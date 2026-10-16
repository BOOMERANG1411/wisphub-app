// Administra puntos de pago (cajeros): ver correo, cambiar correo/contraseña y eliminar.
// Solo un administrador puede usarlo. Corre en Vercel, nunca en el navegador.
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: "Faltan las variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel." });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const { authToken, accion, user_id, email, password } = body;

  // Quien pide esto tiene que ser administrador.
  const { data: quien, error: errQuien } = await admin.auth.getUser(authToken);
  if (errQuien || !quien?.user) return res.status(401).json({ error: "Sesión no válida. Vuelve a iniciar sesión." });
  const { data: yo } = await admin.from("perfiles").select("rol").eq("user_id", quien.user.id).maybeSingle();
  if (yo?.rol !== "admin") return res.status(403).json({ error: "Solo un administrador puede hacer esto." });

  if (!user_id) return res.status(400).json({ error: "Falta indicar el usuario." });
  if (user_id === quien.user.id) return res.status(400).json({ error: "No puedes modificar tu propia cuenta de administrador desde aquí." });

  // El usuario a tocar tiene que ser un cajero (nunca otro administrador).
  const { data: perfil } = await admin.from("perfiles").select("rol").eq("user_id", user_id).maybeSingle();
  if (!perfil || perfil.rol === "admin") return res.status(400).json({ error: "Ese usuario no es un punto de pago." });

  if (accion === "info") {
    const { data, error } = await admin.auth.admin.getUserById(user_id);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ email: data.user?.email || "" });
  }

  if (accion === "actualizar") {
    const cambios = {};
    if (email) cambios.email = String(email).trim().toLowerCase();
    if (password) {
      if (String(password).length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
      cambios.password = String(password);
    }
    if (!Object.keys(cambios).length) return res.status(200).json({ ok: true });
    if (cambios.email) cambios.email_confirm = true;
    const { error } = await admin.auth.admin.updateUserById(user_id, cambios);
    if (error) {
      const yaExiste = /already|registered|exists/i.test(error.message || "");
      return res.status(400).json({ error: yaExiste ? "Ya existe otro usuario con ese correo." : error.message });
    }
    return res.status(200).json({ ok: true });
  }

  if (accion === "eliminar") {
    // El perfil se conserva marcado como eliminado, para que el historial
    // (quién cobró cada factura, liquidaciones) siga mostrando su nombre.
    const { error: errPerfil } = await admin
      .from("perfiles")
      .update({ rol: "eliminado", permisos: [] })
      .eq("user_id", user_id);
    if (errPerfil) return res.status(500).json({ error: errPerfil.message });

    // Se borra el acceso. Si la base no deja borrarlo (porque tiene cobros ligados), se bloquea para siempre.
    const { error: errBorrar } = await admin.auth.admin.deleteUser(user_id);
    if (errBorrar) {
      const { error: errBloqueo } = await admin.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
      if (errBloqueo) return res.status(500).json({ error: errBloqueo.message });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "Acción no reconocida." });
}
