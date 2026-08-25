import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    const authHeader = req.headers.authorization || "";
    const authToken = authHeader.replace("Bearer ", "");
    if (!(await esAdmin(authToken))) {
      return res.status(401).json({ error: "No autorizado." });
    }

    const { data: archivos, error } = await supabaseAdmin.storage
      .from("backups")
      .list("", { sortBy: { column: "created_at", order: "desc" } });
    if (error) throw new Error(error.message);

    const conUrl = await Promise.all(
      (archivos || []).map(async (a) => {
        const { data: signed } = await supabaseAdmin.storage
          .from("backups")
          .createSignedUrl(a.name, 300);
        return {
          nombre: a.name,
          creado: a.created_at,
          tamano: a.metadata?.size || 0,
          url: signed?.signedUrl || null,
        };
      })
    );

    return res.status(200).json({ backups: conUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
