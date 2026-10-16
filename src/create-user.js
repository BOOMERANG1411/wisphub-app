// Crea un punto de pago (cajero): un usuario de Supabase + su perfil con permisos y comisión.
// Solo un administrador puede usarlo. Corre en Vercel, nunca en el navegador.
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido." });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({
      error: "Faltan las variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel.",
    });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const { authToken, nombre, email, password, permisos, comision_tipo, comision_valor } = body;

  // 1. Quien pide esto tiene que ser administrador.
  const { data: quien, error: errQuien } = await admin.auth.getUser(authToken);
  if (errQuien || !quien?.user) {
    return res.status(401).json({ error: "Sesión no válida. Vuelve a iniciar sesión." });
  }
  const { data: perfilAdmin } = await admin
    .from("perfiles")
    .select("rol")
    .eq("user_id", quien.user.id)
    .maybeSingle();
  if (perfilAdmin?.rol !== "admin") {
    return res.status(403).json({ error: "Solo un administrador puede crear puntos de pago." });
  }

  // 2. Datos mínimos.
  if (!nombre || !email || !password || String(password).length < 6) {
    return res.status(400).json({ error: "Nombre, correo y una contraseña de al menos 6 caracteres son obligatorios." });
  }

  // 3. Crear el usuario (ya confirmado, para que pueda entrar enseguida).
  const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
    email: String(email).trim().toLowerCase(),
    password: String(password),
    email_confirm: true,
  });
  if (errCrear) {
    const yaExiste = /already|registered|exists/i.test(errCrear.message || "");
    return res.status(400).json({
      error: yaExiste ? "Ya existe un usuario con ese correo." : `No se pudo crear el usuario: ${errCrear.message}`,
    });
  }

  // 4. Su perfil de cajero.
  const { error: errPerfil } = await admin.from("perfiles").upsert(
    {
      user_id: creado.user.id,
      nombre,
      rol: "cajero",
      permisos: Array.isArray(permisos) ? permisos : [],
      comision_tipo: comision_tipo === "fijo" ? "fijo" : "porcentaje",
      comision_valor: Number(comision_valor) || 0,
    },
    { onConflict: "user_id" }
  );
  if (errPerfil) {
    // Si el perfil falla, borramos el usuario para no dejarlo a medias.
    await admin.auth.admin.deleteUser(creado.user.id);
    return res.status(500).json({ error: `No se pudo guardar el perfil: ${errPerfil.message}` });
  }

  return res.status(200).json({ ok: true, user_id: creado.user.id });
}
