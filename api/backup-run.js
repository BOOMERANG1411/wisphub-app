import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TABLAS = [
  "clientes",
  "planes",
  "facturas",
  "movimientos",
  "historial_mensual",
  "configuracion",
  "perfiles",
  "liquidaciones",
];

async function fetchTodo(tabla) {
  let todos = [];
  let desde = 0;
  const tam = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from(tabla)
      .select("*")
      .range(desde, desde + tam - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    todos = todos.concat(data || []);
    if (!data || data.length < tam) break;
    desde += tam;
  }
  return todos;
}

async function esAdmin(authToken) {
  if (!authToken) return false;
  const { data: userData, error } = await supabaseAdmin.auth.getUser(authToken);
  if (error || !userData?.user) return false;
  const { data: perfil } = await supabaseAdmin
    .from("perfiles")
    .select("rol")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  return perfil?.rol === "admin";
}

export default async function handler(req, res) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization;
    const esLlamadaDelCron = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;

    let autorizado = esLlamadaDelCron;
    if (!autorizado) {
      const authToken = req.method === "POST" ? req.body?.authToken : null;
      autorizado = await esAdmin(authToken);
    }
    if (!autorizado) {
      return res.status(401).json({ error: "No autorizado." });
    }

    const backup = { generado_en: new Date().toISOString(), tablas: {} };
    for (const tabla of TABLAS) {
      backup.tablas[tabla] = await fetchTodo(tabla);
    }
    const contenido = JSON.stringify(backup, null, 2);

    const ahora = new Date();
    const nombreArchivo = `backup-${ahora.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("backups")
      .upload(nombreArchivo, contenido, {
        contentType: "application/json",
        upsert: false,
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data: archivos } = await supabaseAdmin.storage.from("backups").list();
    if (archivos) {
      const limite = new Date();
      limite.setDate(limite.getDate() - 30);
      const viejos = archivos
        .filter((a) => a.created_at && new Date(a.created_at) < limite)
        .map((a) => a.name);
      if (viejos.length > 0) {
        await supabaseAdmin.storage.from("backups").remove(viejos);
      }
    }

    return res.status(200).json({ ok: true, archivo: nombreArchivo });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
