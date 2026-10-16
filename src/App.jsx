import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  LayoutDashboard,
  Users,
  Wifi,
  FileText,
  Plus,
  Search,
  X,
  Trash2,
  Pencil,
  SignalHigh,
  SignalMedium,
  SignalLow,
  CheckCircle2,
  Clock,
  AlertTriangle,
  BarChart3,
  MapPin,
  Navigation,
  MessageCircle,
  CalendarPlus,
  Upload,
  Eye,
  EyeOff,
  Wallet,
  TrendingDown,
  TrendingUp,
  Download,
  Printer,
  Receipt,
  DollarSign,
  Settings,
  Phone,
  LogOut,
  CalendarDays,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Wrench,
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";

const markerIcon = (color) =>
  L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #0D1526;box-shadow:0 0 0 2px ${color}55"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

const DEFAULT_CENTER = [19.4517, -70.697]; // Santiago de los Caballeros, RD

function whatsappLink(telefono, mensaje) {
  const digits = (telefono || "").replace(/\D/g, "");
  if (!digits) return null;
  const conCodigo = digits.length === 10 ? `1${digits}` : digits;
  return `https://wa.me/${conCodigo}?text=${encodeURIComponent(mensaje)}`;
}

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const fmtISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Mes (YYYY-MM) en que entró el dinero: fecha real de pago si existe; si no, el vencimiento.
const mesDePago = (f) => (f.fecha_pago ? fmtISO(new Date(f.fecha_pago)).slice(0, 7) : (f.fecha_vencimiento || "").slice(0, 7));
const ultimoDiaMes = (year, month) => new Date(year, month + 1, 0).getDate();

// Convierte "28/07/2026 11:15" o "28/07/2026" a "2026-07-28". Si no coincide el patrón, lo deja igual.
function parseFechaFlexible(str) {
  if (!str) return null;
  const soloFecha = str.trim().split(" ")[0];
  const m = soloFecha.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(soloFecha)) return soloFecha;
  return null;
}

// Para el ciclo del cliente y la fecha de hoy, calcula si ya toca generar factura
// y cuáles son sus fechas clave (vencimiento y suspensión).
function cicloInfo(ciclo, hoy) {
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const dia = hoy.getDate();
  if (ciclo === 15) {
    const generar = dia >= 10;
    const vencimiento = new Date(y, m, 20);
    return { generar, vencimiento, periodo: `${MESES[m]} ${y}` };
  }
  // ciclo 30: el limite real de pago es el dia 5 del mes siguiente
  const generar = dia >= 25;
  const vMes = m === 11 ? 0 : m + 1;
  const vAnio = m === 11 ? y + 1 : y;
  const vencimiento = new Date(vAnio, vMes, 5);
  return { generar, vencimiento, periodo: `${MESES[m]} ${y}` };
}

// Estado "visual" de una factura: vencida si ya paso su fecha limite de pago sin marcarse como pagada.
function estadoVisual(factura, hoy) {
  if (factura.estado === "pagada") return "pagada";
  if (factura.prorroga_hasta) {
    const limite = new Date(factura.prorroga_hasta + "T23:59:59");
    return hoy > limite ? "vencida" : "pendiente";
  }
  if (!factura.fecha_vencimiento) return factura.estado;
  const venc = new Date(factura.fecha_vencimiento + "T23:59:59");
  return hoy > venc ? "vencida" : "pendiente";
}

function mensajeRecordatorio(cliente, factura) {
  if (factura.prorroga_hasta) {
    return `Hola ${cliente.nombre}, te confirmamos que tu factura de ${factura.periodo || "tu servicio"} por ${money(factura.monto)} tiene plazo hasta el ${factura.prorroga_hasta} antes de la suspension del servicio. Gracias por tu comprension!`;
  }
  return `Hola ${cliente.nombre}, te recordamos que tu factura de ${factura.periodo || "tu servicio"} por ${money(factura.monto)} vence el ${factura.fecha_vencimiento || ""}. Despues de esa fecha el servicio podria suspenderse. Recuerda: estar al dia antes de esa fecha te hace elegible para nuestro sorteo mensual del dia 4 (mes gratis o articulos). No estamos obligados a realizar sorteos, lo hacemos para incentivar el pago a tiempo, ya que asi cubrimos a tiempo nuestros compromisos con el servicio. Nuestro compromiso contigo es que el servicio contratado te siga llegando. Gracias por tu preferencia!`;
}

// Valores por defecto si todavía no se ha guardado nada en la pestaña Configuración.
const EMPRESA_DEFAULT = {
  nombre: "ZONA-WLAN",
  direccion: "Barrio Juan Bosch",
  telefono: "829-321-3372",
  email: "wifizona100@gmail.com",
  logoUrl: "/logo.png",
};

// Paleta azul marino, estilo consola de operaciones de un ISP.
const COLORS = {
  bg: "#0D1526",
  nav: "#091020",
  panel: "#132039",
  panel2: "#192A4A",
  border: "#22355A",
  text: "#E8EEF7",
  dim: "#8DA0BE",
  active: "#2FBF71",
  warn: "#F0A23B",
  danger: "#E5534B",
  accent: "#2F8CFF",
};

// Colores sólidos de las tarjetas del Panel.
const TILE = {
  hoy: "#1597BB",
  mes: "#2F6FE0",
  atraso: "#DE7A2C",
  clientes: "#D4476C",
};

// Moneda dominicana: RD$ 1,500.00
const money = (n) =>
  "RD$ " +
  new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

function EstadoBadge({ estado }) {
  const map = {
    activo: { color: COLORS.active, label: "Activo", Icon: SignalHigh },
    moroso: { color: COLORS.danger, label: "Moroso", Icon: SignalLow },
    suspendido: { color: COLORS.warn, label: "Suspendido", Icon: SignalMedium },
    cancelado: { color: COLORS.dim, label: "Cancelado", Icon: SignalLow },
  };
  const { color, label, Icon } = map[estado] || map.activo;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ color, backgroundColor: color + "1A", border: `1px solid ${color}40` }}
    >
      <Icon size={12} />
      {label}
    </span>
  );
}

function CicloBadge({ ciclo }) {
  const es30 = ciclo === 30;
  const color = es30 ? COLORS.warn : COLORS.accent;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ color, backgroundColor: color + "1A", border: `1px solid ${color}40` }}
    >
      {es30 ? "Corte 30" : "Corte 15"}
    </span>
  );
}

function FacturaBadge({ estado }) {
  const map = {
    pagada: { color: COLORS.active, label: "Pagada", Icon: CheckCircle2 },
    pendiente: { color: COLORS.warn, label: "Pendiente", Icon: Clock },
    vencida: { color: COLORS.danger, label: "Vencida", Icon: AlertTriangle },
  };
  const { color, label, Icon } = map[estado] || map.pendiente;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color, backgroundColor: color + "1A", border: `1px solid ${color}40` }}
    >
      <Icon size={12} />
      {label}
    </span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ backgroundColor: "#00000099", zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl p-5"
        style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}`, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold" style={{ color: COLORS.text }}>
            {title}
          </h3>
          <button onClick={onClose} style={{ color: COLORS.dim }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs mb-1" style={{ color: COLORS.dim }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  backgroundColor: COLORS.panel2,
  border: `1px solid ${COLORS.border}`,
  color: COLORS.text,
  borderRadius: "8px",
  padding: "8px 10px",
  fontSize: "14px",
  outline: "none",
};

function Button({ children, onClick, variant = "primary", type = "button", ...rest }) {
  const styles = {
    primary: { backgroundColor: COLORS.accent, color: "#fff" },
    ghost: {
      backgroundColor: "transparent",
      color: COLORS.text,
      border: `1px solid ${COLORS.border}`,
    },
    danger: { backgroundColor: COLORS.danger + "1A", color: COLORS.danger, border: `1px solid ${COLORS.danger}40` },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-85"
      style={styles[variant]}
      {...rest}
    >
      {children}
    </button>
  );
}

function OrdenFlecha({ label, campo, valor, onChange }) {
  const asc = valor === `${campo}_asc`;
  const desc = valor === `${campo}_desc`;
  return (
    <button
      type="button"
      onClick={() => onChange(asc ? `${campo}_desc` : `${campo}_asc`)}
      className="inline-flex items-center gap-1 text-xs font-medium"
      style={{ color: asc || desc ? COLORS.accent : COLORS.dim }}
    >
      {label}
      <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: "8px", fontSize: 9 }}>
        <span style={{ opacity: asc ? 1 : 0.3 }}>▲</span>
        <span style={{ opacity: desc ? 1 : 0.3 }}>▼</span>
      </span>
    </button>
  );
}

/* ---------- Piezas nuevas del Panel ---------- */

function Reloj() {
  const [ahora, setAhora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const fecha = ahora.toLocaleDateString("es-DO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hora = ahora.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" });
  return (
    <p className="text-sm" style={{ color: COLORS.dim }}>
      <span style={{ textTransform: "capitalize" }}>{fecha}</span>, {hora}
    </p>
  );
}

function KpiTile({ color, Icon, valor, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative overflow-hidden rounded-xl p-4 text-left transition-transform active:scale-95"
      style={{ backgroundColor: color, color: "#fff", minHeight: 96 }}
    >
      <Icon size={72} style={{ position: "absolute", right: -8, bottom: -14, opacity: 0.2 }} />
      <div className="relative font-mono text-lg md:text-2xl font-semibold leading-tight">{valor}</div>
      <div className="relative text-xs md:text-sm mt-1" style={{ opacity: 0.92 }}>{label}</div>
    </button>
  );
}

function Seccion({ titulo, Icon, accion, children }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon size={16} color={COLORS.accent} />
          {titulo}
        </div>
        {accion}
      </div>
      {children}
    </div>
  );
}

function Trio({ items }) {
  return (
    <div className="grid grid-cols-3">
      {items.map((it, i) => (
        <button
          key={it.label}
          type="button"
          onClick={it.onClick}
          className="py-4 px-2 text-center"
          style={{ borderLeft: i > 0 ? `1px solid ${COLORS.border}` : "none", cursor: it.onClick ? "pointer" : "default" }}
        >
          <div className="font-mono text-2xl md:text-3xl font-semibold" style={{ color: it.color || COLORS.text }}>{it.valor}</div>
          <div className="text-xs mt-1" style={{ color: COLORS.dim }}>{it.label}</div>
        </button>
      ))}
    </div>
  );
}

function IconoAccion({ href, onClick, title, color, children }) {
  const cls = "inline-flex items-center justify-center rounded-md";
  const style = { width: 30, height: 30, color, backgroundColor: color + "1A", border: `1px solid ${color}40` };
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" title={title} className={cls} style={style}>
        {children}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} className={cls} style={style}>
        {children}
      </button>
    );
  }
  return (
    <span title={title + " (sin datos)"} className={cls} style={{ ...style, opacity: 0.25 }}>
      {children}
    </span>
  );
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    let data, error;
    try {
      ({ data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }));
    } catch (err) {
      error = err;
    }
    setBusy(false);
    if (!error) {
      onLogin(data.session);
      return;
    }
    // Mostrar la causa real, no siempre "contraseña incorrecta".
    const msg = `${error.message || ""} ${error.status || ""}`.toLowerCase();
    if (msg.includes("invalid login credentials")) setError("Correo o contraseña incorrectos.");
    else if (msg.includes("not confirmed")) setError("Este correo todavía no está confirmado en Supabase.");
    else if (msg.includes("banned")) setError("Este usuario está bloqueado.");
    else if (msg.includes("rate") || msg.includes("429") || msg.includes("too many"))
      setError("Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.");
    else if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed"))
      setError("No hay conexión con la base de datos. Revisa tu internet o la configuración de Supabase en Vercel.");
    else setError(`No se pudo entrar: ${error.message || "error desconocido"}`);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: COLORS.bg, color: COLORS.text }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl p-6"
        style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}` }}
      >
        <div className="flex items-center gap-2 mb-6">
          <SignalHigh size={20} color={COLORS.accent} />
          <span className="font-display font-semibold text-lg">ISP-Control</span>
        </div>
        {error && (
          <div
            className="mb-4 rounded-lg px-3 py-2 text-xs"
            style={{ backgroundColor: COLORS.danger + "1A", color: COLORS.danger, border: `1px solid ${COLORS.danger}40` }}
          >
            {error}
          </div>
        )}
        <Field label="Correo">
          <input type="email" required style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Contraseña">
          <input type="password" required style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg px-3 py-2 text-sm font-medium mt-2"
          style={{ backgroundColor: COLORS.accent, color: "#fff", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [perfil, setPerfil] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [historialMensual, setHistorialMensual] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [facturaFiltro, setFacturaFiltro] = useState("todas");
  const [clienteFiltro, setClienteFiltro] = useState("todos");
  const [clientesVista, setClientesVista] = useState("lista"); // "lista" o "atraso"
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [ordenCliente, setOrdenCliente] = useState("nombre_asc");
  const [ordenPlan, setOrdenPlan] = useState("nombre_asc");
  const [ordenFactura, setOrdenFactura] = useState("");
  const [ordenCaja, setOrdenCaja] = useState("");
  const [clientModal, setClientModal] = useState(null);
  const [planModal, setPlanModal] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [prorrogaModal, setProrrogaModal] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [pagoModal, setPagoModal] = useState(null);
  const [movimientoModal, setMovimientoModal] = useState(null);
  const [importFacturasModal, setImportFacturasModal] = useState(false);
  const [importPagosModal, setImportPagosModal] = useState(false);
  const [importUbicacionModal, setImportUbicacionModal] = useState(false);
  const [importTelefonosModal, setImportTelefonosModal] = useState(false);
  const [importPlanesModal, setImportPlanesModal] = useState(false);
  const [importHistorialModal, setImportHistorialModal] = useState(false);
  const [reciboModal, setReciboModal] = useState(null);
  const [migracionModal, setMigracionModal] = useState(false);

  // Supabase renueva la sesión sola cada cierto tiempo (y al volver a la pestaña).
  // Eso NO debe recargar la app: solo recargamos si cambia el usuario.
  const usuarioId = session?.user?.id;
  const yaCargo = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Supabase solo devuelve hasta 1000 filas por consulta; esto trae todas las páginas necesarias.
  const fetchTodo = async (tabla, orderBy, ascending) => {
    let todos = [];
    let desde = 0;
    const tam = 1000;
    while (true) {
      const { data, error } = await supabase
        .from(tabla)
        .select("*")
        .order(orderBy, { ascending })
        .range(desde, desde + tam - 1);
      if (error) return { data: null, error };
      todos = todos.concat(data || []);
      if (!data || data.length < tam) break;
      desde += tam;
    }
    return { data: todos, error: null };
  };

  const loadAll = useCallback(async () => {
    // La pantalla de "Cargando…" solo aparece la primera vez; después se actualiza en silencio.
    if (!yaCargo.current) setLoading(true);
    setErrorMsg("");
    const [c, p, f, m, hm] = await Promise.all([
      fetchTodo("clientes", "nombre", true),
      supabase.from("planes").select("*").order("precio"),
      fetchTodo("facturas", "fecha_vencimiento", true),
      fetchTodo("movimientos", "fecha", false),
      supabase.from("historial_mensual").select("*").order("mes", { ascending: true }),
    ]);
    if (c.error || p.error || f.error || m.error || hm.error) {
      setErrorMsg((c.error || p.error || f.error || m.error || hm.error).message);
      setLoading(false);
      return;
    }
    await generarFacturasDelCiclo(c.data || [], p.data || [], f.data || []);
    const f2 = await fetchTodo("facturas", "fecha_vencimiento", true);
    setClientes(c.data || []);
    setPlanes(p.data || []);
    setFacturas(f2.data || f.data || []);
    setMovimientos(m.data || []);
    setHistorialMensual(hm.data || []);
    setLoading(false);
    yaCargo.current = true;
  }, []);

  // Revisa si a algún cliente ya le toca factura este ciclo y, si no existe todavía, la crea.
  const generarFacturasDelCiclo = async (clientesData, planesData, facturasData) => {
    const hoy = new Date();
    const nuevas = [];
    for (const cliente of clientesData) {
      if (cliente.estado === "suspendido" || cliente.estado === "cancelado") continue;
      const { generar, vencimiento, periodo } = cicloInfo(cliente.ciclo || 15, hoy);
      if (!generar) continue;
      const vencISO = fmtISO(vencimiento);
      const mesClave = vencISO.slice(0, 7);
      const yaExiste = facturasData.some(
        (f) =>
          f.cliente_id === cliente.id &&
          (f.fecha_vencimiento === vencISO || (f.estado === "pagada" && (f.fecha_vencimiento || "").slice(0, 7) === mesClave))
      );
      if (yaExiste) continue;
      const plan = planesData.find((p) => p.id === cliente.plan_id);
      nuevas.push({
        cliente_id: cliente.id,
        periodo,
        monto: plan ? plan.precio : 0,
        estado: "pendiente",
        fecha_vencimiento: vencISO,
      });
    }
    if (nuevas.length > 0) {
      await supabase.from("facturas").insert(nuevas);
    }
  };

  useEffect(() => {
    if (!usuarioId) {
      yaCargo.current = false;
      return;
    }
    loadAll();
    supabase
      .from("perfiles")
      .select("*")
      .eq("user_id", usuarioId)
      .maybeSingle()
      .then(({ data }) => setPerfil(data || { rol: "sin_acceso", nombre: session?.user?.email }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId, loadAll]);

  // Los cajeros no tienen acceso al Panel: al entrar los mandamos a su primera área permitida.
  useEffect(() => {
    if (perfil && perfil.rol !== "admin" && perfil.rol !== "sin_acceso") {
      const permisos = perfil.permisos || [];
      if (!permisos.includes("dashboard")) setTab(permisos[0] || "clientes");
    }
  }, [perfil]);

  const esAdmin = perfil?.rol === "admin";
  const esCajero = perfil?.rol === "cajero";
  const miUserId = session?.user?.id;
  const tienePermiso = (id) => esAdmin || (perfil?.permisos || []).includes(id);

  const ensurePlanes = async (unicos) => {
    const faltantes = unicos.filter(
      (u) => u.nombre && !planes.some((p) => p.nombre.toLowerCase().trim() === u.nombre.toLowerCase().trim())
    );
    if (faltantes.length > 0) {
      await supabase.from("planes").insert(
        faltantes.map((u) => ({ nombre: u.nombre, velocidad: "", precio: u.precio || 0 }))
      );
    }
    const { data } = await supabase.from("planes").select("*").order("precio");
    setPlanes(data || []);
    return data || [];
  };

  const importarClientes = async (filas, planesActualizados) => {
    const estadosValidos = ["activo", "moroso", "suspendido", "cancelado"];
    const payload = filas.map((f) => {
      const estadoNorm = (f.estado || "").toLowerCase().trim();
      const cicloTexto = String(f.ciclo || "");
      const cicloNum = cicloTexto.includes("30") ? 30 : cicloTexto.includes("15") ? 15 : 15;
      const planEncontrado = f.plan
        ? planesActualizados.find((p) => p.nombre.toLowerCase().trim() === f.plan.toLowerCase().trim())
        : null;
      return {
        nombre: f.nombre,
        telefono: f.telefono || null,
        direccion: f.direccion || null,
        estado: estadosValidos.includes(estadoNorm) ? estadoNorm : "activo",
        ciclo: cicloNum,
        pppoe_usuario: f.pppoe_usuario || null,
        pppoe_secret: f.pppoe_secret || null,
        ip_asignada: f.ip_asignada || null,
        equipo: f.equipo || null,
        cedula: f.cedula || null,
        fecha_instalacion: parseFechaFlexible(f.fecha_instalacion),
        plan_id: planEncontrado ? planEncontrado.id : null,
      };
    });
    const { error } = await supabase.from("clientes").insert(payload);
    if (error) setErrorMsg(error.message);
    else {
      setImportModal(false);
      loadAll();
    }
  };

  const importarFacturas = async (filas) => {
    const nuevasFacturas = [];
    const nuevosMovimientos = [];
    let sinCliente = 0;
    let duplicadas = 0;
    for (const f of filas) {
      const cliente = clientes.find((c) => c.nombre.toLowerCase().trim() === (f.cliente || "").toLowerCase().trim());
      const esOtroIngreso = (f.tipo || "").toLowerCase().includes("otro");
      const estadoNorm = (f.estado || "").toLowerCase().includes("pagad") ? "pagada" : "pendiente";
      if (esOtroIngreso) {
        nuevosMovimientos.push({
          fecha: f.fecha_emision || fmtISO(new Date()),
          tipo: "otro_ingreso",
          descripcion: f.cliente || "Ingreso importado",
          monto: parseFloat(f.monto) || 0,
          forma_pago: "efectivo",
        });
      } else {
        if (!cliente) {
          sinCliente++;
          continue;
        }
        const mesClave = f.fecha_vencimiento ? f.fecha_vencimiento.slice(0, 7) : null;
        const yaExiste = facturas.some(
          (existe) => existe.cliente_id === cliente.id && mesClave && (existe.fecha_vencimiento || "").slice(0, 7) === mesClave
        );
        if (yaExiste) {
          duplicadas++;
          continue;
        }
        nuevasFacturas.push({
          cliente_id: cliente.id,
          periodo: f.fecha_vencimiento ? f.fecha_vencimiento.slice(0, 7) : "",
          monto: parseFloat(f.monto) || 0,
          estado: estadoNorm,
          fecha_vencimiento: f.fecha_vencimiento || null,
        });
      }
    }
    if (nuevasFacturas.length > 0) await supabase.from("facturas").insert(nuevasFacturas);
    if (nuevosMovimientos.length > 0) await supabase.from("movimientos").insert(nuevosMovimientos);
    setImportFacturasModal(false);
    loadAll();
    const avisos = [];
    if (sinCliente > 0) avisos.push(`${sinCliente} sin cliente coincidente`);
    if (duplicadas > 0) avisos.push(`${duplicadas} ya existían y se omitieron`);
    if (avisos.length > 0) setErrorMsg(`Importación completa. ${avisos.join(" · ")}.`);
  };

  const reconciliarPagos = async (filas) => {
    const formaPagoMap = { "efectivo": "efectivo", "transferencia bancaria": "transferencia", "saldo a favor": "saldo_favor" };
    // por cliente, nos quedamos con el #Factura mas alto (el mas reciente)
    const porCliente = {};
    filas.forEach((f) => {
      const key = f.cliente.toLowerCase().trim();
      const num = parseInt(f.numero) || 0;
      if (!porCliente[key] || num > porCliente[key].numero) {
        porCliente[key] = { ...f, numero: num };
      }
    });
    let actualizadas = 0, sinCliente = 0, sinFactura = 0;
    for (const key in porCliente) {
      const f = porCliente[key];
      const cliente = clientes.find((c) => c.nombre.toLowerCase().trim() === key);
      if (!cliente) { sinCliente++; continue; }
      if ((f.estado || "").toLowerCase().includes("pagad")) {
        const facturaCliente = facturas
          .filter((fa) => fa.cliente_id === cliente.id && fa.estado !== "pagada")
          .sort((a, b) => (b.fecha_vencimiento || "").localeCompare(a.fecha_vencimiento || ""))[0];
        if (!facturaCliente) { sinFactura++; continue; }
        const fp = formaPagoMap[(f.forma_pago || "").toLowerCase().trim()] || "efectivo";
        await supabase.from("facturas").update({ estado: "pagada", forma_pago: fp }).eq("id", facturaCliente.id);
        actualizadas++;
      }
    }
    setImportPagosModal(false);
    loadAll();
    setErrorMsg(`Reconciliación completa. Marcadas como pagadas: ${actualizadas} · Sin cliente coincidente: ${sinCliente} · Sin factura pendiente que actualizar: ${sinFactura}`);
  };

  const [puntosDePago, setPuntosDePago] = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);

  const cargarPuntosDePago = useCallback(async () => {
    const [{ data: perfilesData }, { data: liqData }] = await Promise.all([
      supabase.from("perfiles").select("*").order("nombre"),
      supabase.from("liquidaciones").select("*").order("fecha", { ascending: false }),
    ]);
    setPuntosDePago(perfilesData || []);
    setLiquidaciones(liqData || []);
  }, []);

  useEffect(() => {
    if (usuarioId && perfil && perfil.rol !== "cajero") cargarPuntosDePago();
  }, [usuarioId, perfil?.rol, cargarPuntosDePago]);

  const [config, setConfig] = useState(null);

  const cargarConfig = useCallback(async () => {
    const { data } = await supabase.from("configuracion").select("*").eq("id", 1).maybeSingle();
    setConfig(data || null);
  }, []);

  useEffect(() => {
    if (usuarioId) cargarConfig();
  }, [usuarioId, cargarConfig]);

  const guardarConfig = async (nuevaConfig) => {
    const { error } = await supabase.from("configuracion").upsert({ id: 1, ...nuevaConfig });
    if (error) setErrorMsg(error.message);
    else await cargarConfig();
  };

  const empresaActual = {
    nombre: config?.nombre || EMPRESA_DEFAULT.nombre,
    direccion: config?.direccion || EMPRESA_DEFAULT.direccion,
    telefono: config?.telefono || EMPRESA_DEFAULT.telefono,
    email: config?.email || EMPRESA_DEFAULT.email,
    logoUrl: config?.logo_url || EMPRESA_DEFAULT.logoUrl,
  };

  const guardarComision = async (userId, tipo, valor, nombre, permisos) => {
    const payload = { comision_tipo: tipo, comision_valor: valor, nombre };
    if (permisos) payload.permisos = permisos;
    const { error } = await supabase.from("perfiles").update(payload).eq("user_id", userId);
    if (error) setErrorMsg(error.message);
    else cargarPuntosDePago();
  };

  const crearPuntoDePago = async (datos) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const authToken = sessionData?.session?.access_token;
    let resp, resultado;
    try {
      resp = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...datos, authToken }),
      });
      resultado = await resp.json().catch(() => ({}));
    } catch (err) {
      setErrorMsg("No hay conexión con el servidor para crear el usuario.");
      return false;
    }
    if (resp.status === 404) {
      setErrorMsg("Falta el archivo api/create-user.js en GitHub, por eso no se puede crear el punto de pago.");
      return false;
    }
    if (!resp.ok) {
      setErrorMsg(resultado.error || `No se pudo crear el usuario (error ${resp.status}).`);
      return false;
    }
    await cargarPuntosDePago();
    return true;
  };

  // Ver correo, cambiar correo/contraseña o eliminar un punto de pago (api/manage-user.js).
  const gestionarUsuario = async (accion, datos) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const authToken = sessionData?.session?.access_token;
    let resp, resultado;
    try {
      resp = await fetch("/api/manage-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...datos, accion, authToken }),
      });
      resultado = await resp.json().catch(() => ({}));
    } catch (err) {
      return { error: "No hay conexión con el servidor." };
    }
    if (resp.status === 404) return { error: "Falta el archivo api/manage-user.js en GitHub." };
    if (!resp.ok) return { error: resultado.error || `Error ${resp.status}` };
    if (accion !== "info") await cargarPuntosDePago();
    return resultado;
  };

  const liquidarCajero = async (cajero) => {
    const pendientes = facturas.filter((f) => f.cobrado_por === cajero.user_id && f.estado === "pagada" && !f.liquidado);
    if (pendientes.length === 0) return;
    const montoTotal = pendientes.reduce((s, f) => s + Number(f.monto || 0), 0);
    const comision =
      cajero.comision_tipo === "fijo"
        ? pendientes.length * Number(cajero.comision_valor || 0)
        : montoTotal * (Number(cajero.comision_valor || 0) / 100);
    await supabase.from("liquidaciones").insert({
      user_id: cajero.user_id,
      nombre_cajero: cajero.nombre,
      cantidad_facturas: pendientes.length,
      monto_total: montoTotal,
      comision,
    });
    const ids = pendientes.map((f) => f.id);
    await supabase.from("facturas").update({ liquidado: true }).in("id", ids);
    await loadAll();
    await cargarPuntosDePago();
  };

  const importarUbicaciones = async (filas) => {
    let actualizados = 0, sinCliente = 0, sinCoordenadas = 0;
    const tareas = [];
    for (const f of filas) {
      const cliente = clientes.find((c) => c.nombre.toLowerCase().trim() === f.cliente.toLowerCase().trim());
      if (!cliente) { sinCliente++; continue; }
      const lat = parseFloat(f.lat);
      const lng = parseFloat(f.lng);
      if (isNaN(lat) || isNaN(lng)) { sinCoordenadas++; continue; }
      tareas.push(
        supabase.from("clientes").update({ lat, lng }).eq("id", cliente.id).then(() => { actualizados++; })
      );
    }
    await Promise.allSettled(tareas);
    setImportUbicacionModal(false);
    loadAll();
    setErrorMsg(`Ubicaciones actualizadas: ${actualizados} · Sin cliente coincidente: ${sinCliente} · Sin coordenadas válidas: ${sinCoordenadas}`);
  };

  const importarTelefonos = async (filas) => {
    let actualizados = 0, sinCliente = 0;
    const tareas = [];
    for (const f of filas) {
      const cliente = clientes.find((c) => c.nombre.toLowerCase().trim() === f.cliente.toLowerCase().trim());
      if (!cliente) { sinCliente++; continue; }
      tareas.push(
        supabase.from("clientes").update({ telefono: f.telefono }).eq("id", cliente.id).then(() => { actualizados++; })
      );
    }
    await Promise.allSettled(tareas);
    setImportTelefonosModal(false);
    loadAll();
    setErrorMsg(`Teléfonos sincronizados: ${actualizados} · Sin cliente coincidente: ${sinCliente}`);
  };

  const importarPlanesClientes = async (filas) => {
    let actualizados = 0, sinCliente = 0, sinPlan = 0;
    const planesLocales = [...planes];
    for (const f of filas) {
      const cliente = clientes.find((c) => c.nombre.toLowerCase().trim() === f.cliente.toLowerCase().trim());
      if (!cliente) { sinCliente++; continue; }
      const nombrePlan = (f.plan || "").trim();
      if (!nombrePlan) { sinPlan++; continue; }
      let plan = planesLocales.find((p) => p.nombre.toLowerCase().trim() === nombrePlan.toLowerCase());
      if (!plan) {
        const { data: nuevoPlan } = await supabase
          .from("planes")
          .insert({ nombre: nombrePlan, velocidad: "", precio: parseFloat(f.plan_precio) || 0 })
          .select()
          .single();
        if (nuevoPlan) {
          plan = nuevoPlan;
          planesLocales.push(nuevoPlan);
        }
      }
      if (!plan) { sinPlan++; continue; }
      await supabase.from("clientes").update({ plan_id: plan.id }).eq("id", cliente.id);
      actualizados++;
    }
    setImportPlanesModal(false);
    loadAll();
    setErrorMsg(`Planes sincronizados: ${actualizados} · Sin cliente coincidente: ${sinCliente} · Sin plan indicado: ${sinPlan}`);
  };

  const importarHistorialIngresos = async (filas) => {
    const formaPagoMap = { "efectivo": "efectivo", "transferencia bancaria": "transferencia", "saldo a favor": "saldo_favor" };
    const nuevas = [];
    const yaImportadosEnEsteLote = new Set(); // evita duplicar dentro del mismo archivo también
    let sinCliente = 0, duplicadas = 0, sinFecha = 0;
    for (const f of filas) {
      const cliente = clientes.find((c) => c.nombre.toLowerCase().trim() === f.cliente.toLowerCase().trim());
      if (!cliente) { sinCliente++; continue; }
      const fechaISO = parseFechaFlexible(f.fecha);
      if (!fechaISO) { sinFecha++; continue; }
      const mesClave = `${cliente.id}-${fechaISO.slice(0, 7)}`;
      const yaExiste =
        facturas.some((fa) => fa.cliente_id === cliente.id && fa.estado === "pagada" && (fa.fecha_vencimiento || "").slice(0, 7) === fechaISO.slice(0, 7)) ||
        yaImportadosEnEsteLote.has(mesClave);
      if (yaExiste) { duplicadas++; continue; }
      yaImportadosEnEsteLote.add(mesClave);
      const fp = formaPagoMap[(f.forma_pago || "").toLowerCase().trim()] || "efectivo";
      nuevas.push({
        cliente_id: cliente.id,
        periodo: fechaISO.slice(0, 7),
        monto: parseFloat(f.monto) || 0,
        estado: "pagada",
        forma_pago: fp,
        fecha_vencimiento: fechaISO,
      });
    }
    if (nuevas.length > 0) await supabase.from("facturas").insert(nuevas);
    setImportHistorialModal(false);
    loadAll();
    setErrorMsg(`Historial importado: ${nuevas.length} · Ya existían (mismo cliente y mes): ${duplicadas} · Sin cliente: ${sinCliente} · Sin fecha válida: ${sinFecha}`);
  };

  const saveHistorialMes = async (fila) => {
    const { error } = await supabase.from("historial_mensual").upsert(
      { mes: fila.mes, pagos_internet: fila.pagos_internet, otros_ingresos: fila.otros_ingresos, gastos: fila.gastos },
      { onConflict: "mes" }
    );
    if (error) setErrorMsg(error.message);
    else loadAll();
  };
  const deleteHistorialMes = async (mes) => {
    const { error } = await supabase.from("historial_mensual").delete().eq("mes", mes);
    if (error) setErrorMsg(error.message);
    else loadAll();
  };

  const nombreCajero = (userId) => {
    if (!userId) return null;
    if (userId === miUserId) return perfil?.nombre || session?.user?.email;
    const p = puntosDePago.find((pp) => pp.user_id === userId);
    return p?.nombre || null;
  };

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.bg, color: COLORS.dim }}>
        Cargando…
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onLogin={setSession} />;
  }

  if (perfil && (perfil.rol === "sin_acceso" || perfil.rol === "eliminado")) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center" style={{ backgroundColor: COLORS.bg, color: COLORS.text }}>
        <p className="text-sm" style={{ color: COLORS.dim }}>
          Tu cuenta no tiene un perfil asignado todavía. Pídele al administrador que te dé acceso desde "Puntos de pago".
        </p>
        <button onClick={() => supabase.auth.signOut()} className="text-xs underline" style={{ color: COLORS.accent }}>
          Cerrar sesión
        </button>
      </div>
    );
  }

  const planById = (id) => planes.find((p) => p.id === id);

  /* ----- Clientes ----- */
  const saveClient = async (form) => {
    const payload = {
      nombre: form.nombre,
      telefono: form.telefono,
      direccion: form.direccion,
      plan_id: form.planId || null,
      estado: form.estado,
      lat: form.lat || null,
      lng: form.lng || null,
      ciclo: Number(form.ciclo) || 15,
      pppoe_usuario: form.pppoe_usuario || null,
      pppoe_secret: form.pppoe_secret || null,
      ip_asignada: form.ip_asignada || null,
      equipo: form.equipo || null,
      cedula: form.cedula || null,
      fecha_instalacion: form.fecha_instalacion || null,
    };
    const q = form.id
      ? supabase.from("clientes").update(payload).eq("id", form.id)
      : supabase.from("clientes").insert(payload);
    const { error } = await q;
    if (error) setErrorMsg(error.message);
    else {
      setClientModal(null);
      loadAll();
    }
  };
  const deleteClient = async (id) => {
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) setErrorMsg(error.message);
    else loadAll();
  };

  /* ----- Planes ----- */
  const savePlan = async (form) => {
    const payload = { nombre: form.nombre, velocidad: form.velocidad, precio: form.precio };
    const q = form.id
      ? supabase.from("planes").update(payload).eq("id", form.id)
      : supabase.from("planes").insert(payload);
    const { error } = await q;
    if (error) setErrorMsg(error.message);
    else {
      setPlanModal(null);
      loadAll();
    }
  };
  const deletePlan = async (id) => {
    const { error } = await supabase.from("planes").delete().eq("id", id);
    if (error) setErrorMsg(error.message);
    else loadAll();
  };

  /* ----- Facturas ----- */
  const saveInvoice = async (form) => {
    const payload = {
      cliente_id: form.clienteId,
      periodo: form.periodo,
      monto: form.monto,
      fecha_vencimiento: form.fechaVencimiento || null,
      estado: form.estado,
    };
    const q = form.id
      ? supabase.from("facturas").update(payload).eq("id", form.id)
      : supabase.from("facturas").insert(payload);
    const { error } = await q;
    if (error) setErrorMsg(error.message);
    else {
      setInvoiceModal(null);
      loadAll();
    }
  };
  // Guarda también la fecha y hora del pago (columna fecha_pago) para "Ingresos hoy".
  // Si esa columna todavía no existe en Supabase, el pago se guarda igual sin ella.
  const markPaid = async (id, formaPago) => {
    const { data: userData } = await supabase.auth.getUser();
    const base = { estado: "pagada", forma_pago: formaPago, cobrado_por: userData?.user?.id || null };
    const fechaPago = new Date().toISOString();
    let { error } = await supabase
      .from("facturas")
      .update({ ...base, fecha_pago: fechaPago })
      .eq("id", id);
    if (error && /fecha_pago/i.test(error.message || "")) {
      ({ error } = await supabase.from("facturas").update(base).eq("id", id));
    }
    if (error) setErrorMsg(error.message);
    else {
      const pagada = facturas.find((f) => f.id === id);
      setPagoModal(null);
      if (pagada) setReciboModal({ ...pagada, ...base, fecha_pago: fechaPago, recienPagada: true });
      loadAll();
    }
  };
  // Anular un pago hecho por error: la factura vuelve a quedar pendiente.
  // El administrador puede anular cualquiera; un cajero solo los suyos del mismo día.
  // Si el pago ya se liquidó al punto de pago, no se puede (descuadraría su comisión).
  const puedeAnular = (f) =>
    f.estado === "pagada" &&
    !f.liquidado &&
    (esAdmin ||
      (f.cobrado_por === miUserId && f.fecha_pago && fmtISO(new Date(f.fecha_pago)) === fmtISO(new Date())));
  const anularPago = async (f) => {
    if (f.liquidado) {
      setErrorMsg("Este pago ya se liquidó al punto de pago, por eso no se puede anular.");
      return;
    }
    const c = clientes.find((x) => x.id === f.cliente_id);
    if (!window.confirm(`¿Anular el pago de ${money(f.monto)} de ${c ? c.nombre : "este cliente"}?\n\nLa factura vuelve a quedar pendiente y el dinero sale de la caja.`)) return;
    const base = { estado: "pendiente", forma_pago: null, cobrado_por: null };
    let { error } = await supabase.from("facturas").update({ ...base, fecha_pago: null }).eq("id", f.id);
    if (error && /fecha_pago/i.test(error.message || "")) {
      ({ error } = await supabase.from("facturas").update(base).eq("id", f.id));
    }
    if (error) setErrorMsg(error.message);
    else loadAll();
  };

  const saveMovimiento = async (mov) => {
    const payload = { fecha: mov.fecha, tipo: mov.tipo, descripcion: mov.descripcion, monto: mov.monto, forma_pago: mov.forma_pago };
    const q = mov.id
      ? supabase.from("movimientos").update(payload).eq("id", mov.id)
      : supabase.from("movimientos").insert(payload);
    const { error } = await q;
    if (error) setErrorMsg(error.message);
    else {
      setMovimientoModal(null);
      loadAll();
    }
  };
  const deleteMovimiento = async (id) => {
    const { error } = await supabase.from("movimientos").delete().eq("id", id);
    if (error) setErrorMsg(error.message);
    else loadAll();
  };
  const deleteInvoice = async (id) => {
    const { error } = await supabase.from("facturas").delete().eq("id", id);
    if (error) setErrorMsg(error.message);
    else loadAll();
  };
  const saveProrroga = async (facturaId, fecha) => {
    const { error } = await supabase.from("facturas").update({ prorroga_hasta: fecha }).eq("id", facturaId);
    if (error) setErrorMsg(error.message);
    else {
      setProrrogaModal(null);
      loadAll();
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: COLORS.bg, color: COLORS.dim }}
      >
        Cargando…
      </div>
    );
  }

  /* ----- Datos calculados para el Panel y la lista de clientes ----- */
  const hoy = new Date();
  const hoyISO = fmtISO(hoy);
  const mesISO = hoyISO.slice(0, 7);
  const anioISO = hoyISO.slice(0, 4);
  const sumar = (lista) => lista.reduce((s, f) => s + Number(f.monto || 0), 0);
  const fechaPagoDe = (f) => (f.fecha_pago ? fmtISO(new Date(f.fecha_pago)) : null);

  const pagadas = facturas.filter((f) => f.estado === "pagada");
  const ingresosHoy = sumar(pagadas.filter((f) => fechaPagoDe(f) === hoyISO));
  // Pagos nuevos usan su fecha real de pago; los viejos (sin fecha_pago) usan el mes de vencimiento.
  const ingresosMesActual = sumar(
    pagadas.filter((f) => {
      const fp = fechaPagoDe(f);
      return fp ? fp.startsWith(mesISO) : (f.fecha_vencimiento || "").startsWith(mesISO);
    })
  );
  const totalActivos = clientes.filter((c) => c.estado === "activo").length;
  const porCobrarMonto = sumar(facturas.filter((f) => f.estado !== "pagada"));
  const facturasVencidas = facturas.filter((f) => estadoVisual(f, hoy) === "vencida");
  const prorrogasActivas = facturas.filter((f) => f.estado !== "pagada" && f.prorroga_hasta && f.prorroga_hasta >= hoyISO).length;

  // Deuda vencida por cliente (para "Atraso de pago").
  const deudaPorCliente = {};
  facturasVencidas.forEach((f) => {
    const d = deudaPorCliente[f.cliente_id] || { monto: 0, cantidad: 0, factura: f };
    d.monto += Number(f.monto || 0);
    d.cantidad += 1;
    if ((f.fecha_vencimiento || "") < (d.factura.fecha_vencimiento || "")) d.factura = f;
    deudaPorCliente[f.cliente_id] = d;
  });
  const clientesEnAtraso = clientes.filter((c) => deudaPorCliente[c.id]);
  const diasDeAtraso = (f) => {
    const limite = new Date((f.prorroga_hasta || f.fecha_vencimiento) + "T00:00:00");
    return Math.max(1, Math.ceil((hoy - limite) / 86400000));
  };

  const instHoy = clientes.filter((c) => c.fecha_instalacion === hoyISO).length;
  const instMes = clientes.filter((c) => (c.fecha_instalacion || "").startsWith(mesISO)).length;
  const instAnio = clientes.filter((c) => (c.fecha_instalacion || "").startsWith(anioISO)).length;

  const ultimosPagos = pagadas
    .slice()
    .sort((a, b) => (b.fecha_pago || "").localeCompare(a.fecha_pago || ""))
    .slice(0, 6);
  const peoresAtrasos = clientesEnAtraso
    .slice()
    .sort((a, b) => deudaPorCliente[b.id].monto - deudaPorCliente[a.id].monto)
    .slice(0, 6);

  // Lista de clientes: búsqueda por nombre, usuario PPPoE, IP, teléfono o dirección.
  const q = search.toLowerCase().trim();
  const baseClientes = clientesVista === "atraso" ? clientesEnAtraso : clientes;
  const filteredClients = baseClientes
    .filter((c) => !q || [c.nombre, c.pppoe_usuario, c.ip_asignada, c.telefono, c.direccion].some((v) => (v || "").toLowerCase().includes(q)))
    .filter((c) => clienteFiltro === "todos" || c.estado === clienteFiltro)
    .slice()
    .sort((a, b) => {
      if (ordenCliente === "nombre_asc") return (a.nombre || "").localeCompare(b.nombre || "");
      if (ordenCliente === "nombre_desc") return (b.nombre || "").localeCompare(a.nombre || "");
      if (ordenCliente === "deuda_asc") return (deudaPorCliente[a.id]?.monto || 0) - (deudaPorCliente[b.id]?.monto || 0);
      if (ordenCliente === "deuda_desc") return (deudaPorCliente[b.id]?.monto || 0) - (deudaPorCliente[a.id]?.monto || 0);
      return 0;
    });
  const totalPaginas = pageSize === "todos" ? 1 : Math.max(1, Math.ceil(filteredClients.length / pageSize));
  const paginaActual = Math.min(page, totalPaginas);
  const inicio = pageSize === "todos" ? 0 : (paginaActual - 1) * pageSize;
  const clientesPagina = pageSize === "todos" ? filteredClients : filteredClients.slice(inicio, inicio + pageSize);

  const editarCliente = (c) =>
    setClientModal({
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefono,
      direccion: c.direccion,
      planId: c.plan_id,
      estado: c.estado,
      lat: c.lat,
      lng: c.lng,
      ciclo: c.ciclo,
      pppoe_usuario: c.pppoe_usuario,
      pppoe_secret: c.pppoe_secret,
      ip_asignada: c.ip_asignada,
      equipo: c.equipo,
      cedula: c.cedula,
      fecha_instalacion: c.fecha_instalacion,
    });
  const eliminarCliente = (c) => {
    if (window.confirm(`¿Eliminar a ${c.nombre}? Esto no se puede deshacer.`)) deleteClient(c.id);
  };

  const irAClientes = (vista, estado = "todos") => {
    setClientesVista(vista);
    setClienteFiltro(estado);
    setPage(1);
    setTab("clientes");
  };
  const irABuscar = () => {
    irAClientes("lista");
    setTimeout(() => document.getElementById("buscador-global")?.focus(), 60);
  };

  const renderContacto = (c) => {
    const deuda = deudaPorCliente[c.id];
    const digits = (c.telefono || "").replace(/\D/g, "");
    const wa = deuda ? whatsappLink(c.telefono, mensajeRecordatorio(c, deuda.factura)) : whatsappLink(c.telefono, `Hola ${c.nombre}, `);
    return (
      <>
        <IconoAccion title="Llamar" color={COLORS.accent} href={digits ? `tel:${digits}` : null}>
          <Phone size={14} />
        </IconoAccion>
        <IconoAccion title={deuda ? "Recordar pago por WhatsApp" : "WhatsApp"} color={COLORS.active} href={wa}>
          <MessageCircle size={14} />
        </IconoAccion>
        <IconoAccion
          title="Ver en Google Maps"
          color={COLORS.warn}
          href={c.lat && c.lng ? `https://www.google.com/maps?q=${c.lat},${c.lng}` : null}
        >
          <MapPin size={14} />
        </IconoAccion>
      </>
    );
  };

  const NAV_COMPLETO = [
    { id: "dashboard", label: "Panel", Icon: LayoutDashboard, grupo: "Operación" },
    { id: "clientes", label: "Clientes", Icon: Users, grupo: "Operación" },
    { id: "planes", label: "Planes", Icon: Wifi, grupo: "Operación" },
    { id: "mapa", label: "Mapa", Icon: MapPin, grupo: "Operación" },
    { id: "facturacion", label: "Facturación", Icon: FileText, grupo: "Cobros" },
    { id: "caja", label: "Caja", Icon: Wallet, grupo: "Cobros" },
    { id: "puntos-pago", label: "Puntos de pago", Icon: DollarSign, grupo: "Cobros" },
    { id: "reportes", label: "Reportes", Icon: BarChart3, grupo: "Análisis" },
    { id: "configuracion", label: "Configuración", Icon: Settings, grupo: "Sistema" },
  ];
  const NAV = esAdmin ? NAV_COMPLETO : NAV_COMPLETO.filter((n) => tienePermiso(n.id));
  const GRUPOS = [...new Set(NAV.map((n) => n.grupo))];
  const nombreUsuario = perfil?.nombre || session?.user?.email || "";

  return (
    <div className="min-h-screen w-full flex" style={{ backgroundColor: COLORS.bg, color: COLORS.text }}>
      {/* ---------- Barra lateral (computadora) ---------- */}
      <nav
        className="hidden md:flex flex-col w-60 shrink-0 h-screen sticky top-0 no-print"
        style={{ backgroundColor: COLORS.nav, borderRight: `1px solid ${COLORS.border}` }}
      >
        <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <img
            src={empresaActual.logoUrl}
            alt=""
            className="rounded-lg object-contain"
            style={{ width: 38, height: 38, backgroundColor: "#fff", padding: 3 }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <div className="min-w-0">
            <div className="font-display font-semibold text-sm truncate">{empresaActual.nombre}</div>
            <div className="text-xs" style={{ color: COLORS.dim }}>ISP-Control</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          {GRUPOS.map((g) => (
            <div key={g} className="mb-3">
              <div className="px-3 mb-1 text-xs" style={{ color: COLORS.dim, opacity: 0.7 }}>{g}</div>
              {NAV.filter((n) => n.grupo === g).map(({ id, label, Icon }) => {
                const activo = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium mb-0.5"
                    style={{
                      backgroundColor: activo ? COLORS.accent + "26" : "transparent",
                      color: activo ? "#fff" : COLORS.dim,
                      boxShadow: activo ? `inset 3px 0 0 ${COLORS.accent}` : "none",
                    }}
                  >
                    <Icon size={18} color={activo ? COLORS.accent : undefined} />
                    {label}
                    {id === "clientes" && clientesEnAtraso.length > 0 && (
                      <span
                        className="ml-auto rounded-full px-1.5 text-xs font-mono"
                        style={{ backgroundColor: COLORS.danger, color: "#fff" }}
                        title="Clientes con facturas vencidas"
                      >
                        {clientesEnAtraso.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="px-4 py-3 text-xs" style={{ borderTop: `1px solid ${COLORS.border}`, color: COLORS.dim }}>
          <div className="truncate mb-2" style={{ color: COLORS.text }}>{nombreUsuario}</div>
          <button onClick={() => supabase.auth.signOut()} className="inline-flex items-center gap-1.5">
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </nav>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* ---------- Barra superior ---------- */}
        <header
          className="sticky top-0 flex items-center gap-3 px-4 md:px-8 py-3 no-print"
          style={{ backgroundColor: COLORS.bg + "F2", borderBottom: `1px solid ${COLORS.border}`, zIndex: 1100, backdropFilter: "blur(6px)" }}
        >
          <div className="md:hidden font-display font-semibold text-sm truncate" style={{ maxWidth: 110 }}>
            {empresaActual.nombre}
          </div>
          {tienePermiso("clientes") ? (
            <div className="relative flex-1 max-w-md">
              <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: COLORS.dim }} />
              <input
                id="buscador-global"
                style={{ ...inputStyle, paddingLeft: 32, borderRadius: 999 }}
                placeholder="Buscar cliente, usuario PPPoE o IP"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                  if (tab !== "clientes") setTab("clientes");
                }}
              />
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <div className="hidden md:flex items-center gap-2 text-xs" style={{ color: COLORS.dim }}>
            <span
              className="rounded-full px-2 py-0.5"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            >
              {esAdmin ? "Administrador" : esCajero ? "Cajero" : "Usuario"}
            </span>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="md:hidden"
            style={{ color: COLORS.dim }}
            title="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        </header>

        <main className="flex-1 px-4 md:px-8 py-6 pb-28 md:pb-10">
          {errorMsg && (
            <div
              className="mb-4 rounded-lg px-3 py-2 text-xs flex items-start justify-between gap-3"
              style={{ backgroundColor: COLORS.danger + "1A", color: COLORS.danger, border: `1px solid ${COLORS.danger}40` }}
            >
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg("")} title="Cerrar aviso"><X size={14} /></button>
            </div>
          )}

          {/* ---------- PANEL ---------- */}
          {tab === "dashboard" && (
            <div>
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 mb-5">
                <div>
                  <h1 className="font-display text-xl md:text-2xl font-semibold">Panel</h1>
                  <Reloj />
                </div>
                <div className="flex flex-wrap gap-2">
                  {!esCajero && (
                    <Button onClick={() => setClientModal({})}>
                      <UserPlus size={16} /> Agregar cliente
                    </Button>
                  )}
                  <Button variant="ghost" onClick={irABuscar}>
                    <Search size={16} /> Buscar cliente
                  </Button>
                  <Button variant="ghost" onClick={() => { setFacturaFiltro("por_cobrar"); setTab("facturacion"); }}>
                    <FileText size={16} /> Facturas por cobrar
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <KpiTile
                  color={TILE.hoy}
                  Icon={Clock}
                  valor={money(ingresosHoy)}
                  label="Ingresos hoy"
                  onClick={() => { setFacturaFiltro("pagada"); setTab("facturacion"); }}
                />
                <KpiTile
                  color={TILE.mes}
                  Icon={CalendarDays}
                  valor={money(ingresosMesActual)}
                  label="Ingresos este mes"
                  onClick={() => setTab("reportes")}
                />
                <KpiTile
                  color={TILE.atraso}
                  Icon={AlertTriangle}
                  valor={`${totalActivos}/${clientesEnAtraso.length}`}
                  label="Activos / con atraso"
                  onClick={() => irAClientes("atraso")}
                />
                <KpiTile
                  color={TILE.clientes}
                  Icon={Users}
                  valor={clientes.length}
                  label="Clientes"
                  onClick={() => irAClientes("lista")}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <Seccion titulo="Clientes instalados" Icon={Wrench}>
                  <Trio
                    items={[
                      { label: "Hoy", valor: instHoy },
                      { label: "Este mes", valor: instMes },
                      { label: "Este año", valor: instAnio },
                    ]}
                  />
                </Seccion>
                <Seccion titulo="Cobranza" Icon={Wallet}>
                  <Trio
                    items={[
                      {
                        label: "Por cobrar",
                        valor: money(porCobrarMonto).replace("RD$ ", ""),
                        color: COLORS.warn,
                        onClick: () => { setFacturaFiltro("por_cobrar"); setTab("facturacion"); },
                      },
                      {
                        label: "Facturas vencidas",
                        valor: facturasVencidas.length,
                        color: facturasVencidas.length ? COLORS.danger : COLORS.text,
                        onClick: () => { setFacturaFiltro("vencida"); setTab("facturacion"); },
                      },
                      { label: "Prórrogas activas", valor: prorrogasActivas },
                    ]}
                  />
                </Seccion>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Seccion
                  titulo="Clientes con atraso"
                  Icon={AlertTriangle}
                  accion={
                    clientesEnAtraso.length > 0 && (
                      <button className="text-xs" style={{ color: COLORS.accent }} onClick={() => irAClientes("atraso")}>
                        Ver los {clientesEnAtraso.length}
                      </button>
                    )
                  }
                >
                  {peoresAtrasos.length === 0 ? (
                    <div className="p-6 text-sm text-center" style={{ color: COLORS.dim }}>
                      Todos tus clientes están al día.
                    </div>
                  ) : (
                    peoresAtrasos.map((c) => {
                      const d = deudaPorCliente[c.id];
                      const link = whatsappLink(c.telefono, mensajeRecordatorio(c, d.factura));
                      return (
                        <div
                          key={c.id}
                          className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                          style={{ borderTop: `1px solid ${COLORS.border}` }}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{c.nombre}</div>
                            <div className="text-xs" style={{ color: COLORS.dim }}>
                              {diasDeAtraso(d.factura)} días de atraso, {d.cantidad} factura{d.cantidad > 1 ? "s" : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-sm" style={{ color: COLORS.danger }}>{money(d.monto)}</span>
                            <IconoAccion title="Recordar pago por WhatsApp" color={COLORS.active} href={link}>
                              <MessageCircle size={14} />
                            </IconoAccion>
                          </div>
                        </div>
                      );
                    })
                  )}
                </Seccion>

                <Seccion
                  titulo="Últimos pagos"
                  Icon={Receipt}
                  accion={
                    <button className="text-xs" style={{ color: COLORS.accent }} onClick={() => { setFacturaFiltro("pagada"); setTab("facturacion"); }}>
                      Ver pagadas
                    </button>
                  }
                >
                  {ultimosPagos.length === 0 ? (
                    <div className="p-6 text-sm text-center" style={{ color: COLORS.dim }}>
                      Aquí aparecerán los cobros a medida que los registres.
                    </div>
                  ) : (
                    ultimosPagos.map((f) => {
                      const c = clientes.find((cl) => cl.id === f.cliente_id);
                      const cuando = f.fecha_pago
                        ? new Date(f.fecha_pago).toLocaleString("es-DO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                        : f.periodo;
                      return (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                          style={{ borderTop: `1px solid ${COLORS.border}` }}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{c ? c.nombre : "Cliente eliminado"}</div>
                            <div className="text-xs" style={{ color: COLORS.dim }}>
                              {cuando}
                              {f.forma_pago ? `, ${FORMAS_PAGO.find((x) => x.value === f.forma_pago)?.label || f.forma_pago}` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-sm" style={{ color: COLORS.active }}>{money(f.monto)}</span>
                            <IconoAccion title="Ver recibo" color={COLORS.accent} onClick={() => setReciboModal(f)}>
                              <Receipt size={14} />
                            </IconoAccion>
                          </div>
                        </div>
                      );
                    })
                  )}
                </Seccion>
              </div>
            </div>
          )}

          {/* ---------- CLIENTES ---------- */}
          {tab === "clientes" && (
            <div>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                <div>
                  <h1 className="font-display text-xl md:text-2xl font-semibold">Clientes</h1>
                  <p className="text-sm" style={{ color: COLORS.dim }}>
                    {clientes.length} registrados, {clientesEnAtraso.length} con atraso
                  </p>
                </div>
                {!esCajero && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => setMigracionModal(true)}>
                      <Upload size={16} /> Importar de WispHub
                    </Button>
                    <Button onClick={() => setClientModal({})}>
                      <Plus size={16} /> Nuevo cliente
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex gap-1 mb-4" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                {[
                  { id: "lista", label: "Lista de clientes", n: clientes.length },
                  { id: "atraso", label: "Atraso de pago", n: clientesEnAtraso.length },
                ].map((v) => {
                  const activo = clientesVista === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => { setClientesVista(v.id); setPage(1); if (v.id === "atraso") setOrdenCliente("deuda_desc"); else setOrdenCliente("nombre_asc"); }}
                      className="px-3 py-2 text-sm font-medium -mb-px"
                      style={{
                        color: activo ? COLORS.text : COLORS.dim,
                        borderBottom: `2px solid ${activo ? COLORS.accent : "transparent"}`,
                      }}
                    >
                      {v.label}{" "}
                      <span
                        className="rounded-full px-1.5 text-xs font-mono"
                        style={{
                          backgroundColor: v.id === "atraso" && v.n > 0 ? COLORS.danger + "33" : COLORS.panel2,
                          color: v.id === "atraso" && v.n > 0 ? COLORS.danger : COLORS.dim,
                        }}
                      >
                        {v.n}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-3 mb-4">
                <select
                  style={{ ...inputStyle, width: "auto" }}
                  value={clienteFiltro}
                  onChange={(e) => { setClienteFiltro(e.target.value); setPage(1); }}
                >
                  <option value="todos">Todos los estados</option>
                  <option value="activo">Activos</option>
                  <option value="moroso">Morosos</option>
                  <option value="suspendido">Suspendidos</option>
                  <option value="cancelado">Cancelados</option>
                </select>
                <select
                  style={{ ...inputStyle, width: "auto" }}
                  value={pageSize}
                  onChange={(e) => { setPageSize(e.target.value === "todos" ? "todos" : Number(e.target.value)); setPage(1); }}
                >
                  <option value={10}>Mostrar 10</option>
                  <option value={25}>Mostrar 25</option>
                  <option value={50}>Mostrar 50</option>
                  <option value={100}>Mostrar 100</option>
                  <option value="todos">Mostrar todos</option>
                </select>
                <span className="text-xs" style={{ color: COLORS.dim }}>Ordenar:</span>
                <OrdenFlecha label="Nombre" campo="nombre" valor={ordenCliente} onChange={setOrdenCliente} />
                {clientesVista === "atraso" && (
                  <OrdenFlecha label="Deuda" campo="deuda" valor={ordenCliente} onChange={setOrdenCliente} />
                )}
                {search && (
                  <button onClick={() => setSearch("")} className="text-xs underline" style={{ color: COLORS.accent }}>
                    Quitar búsqueda "{search}"
                  </button>
                )}
              </div>

              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${COLORS.border}`, backgroundColor: COLORS.panel }}>
                {filteredClients.length === 0 ? (
                  <div className="p-8 text-sm text-center" style={{ color: COLORS.dim }}>
                    {search
                      ? `Ningún cliente coincide con "${search}".`
                      : clientesVista === "atraso"
                      ? "Ningún cliente tiene facturas vencidas."
                      : "Todavía no hay clientes. Agrega el primero con Nuevo cliente."}
                  </div>
                ) : (
                  <>
                    {/* Tabla en computadora */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ color: COLORS.dim, backgroundColor: COLORS.panel2 }}>
                            <th className="text-left font-medium px-3 py-2.5">Nombre</th>
                            <th className="text-left font-medium px-3 py-2.5">Servicio</th>
                            <th className="text-left font-medium px-3 py-2.5">IP</th>
                            <th className="text-left font-medium px-3 py-2.5">Plan</th>
                            {clientesVista === "atraso" && <th className="text-right font-medium px-3 py-2.5">Deuda</th>}
                            <th className="text-left font-medium px-3 py-2.5">Corte</th>
                            <th className="text-left font-medium px-3 py-2.5">Estado</th>
                            <th className="text-left font-medium px-3 py-2.5">Contacto</th>
                            {!esCajero && <th className="text-right font-medium px-3 py-2.5">Administrar</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {clientesPagina.map((c) => {
                            const plan = planById(c.plan_id);
                            const deuda = deudaPorCliente[c.id];
                            const colorEstado =
                              { activo: COLORS.active, moroso: COLORS.danger, suspendido: COLORS.warn }[c.estado] || COLORS.dim;
                            return (
                              <tr
                                key={c.id}
                                style={{
                                  borderTop: `1px solid ${COLORS.border}`,
                                  backgroundColor: deuda ? COLORS.danger + "12" : "transparent",
                                }}
                              >
                                <td className="px-3 py-2.5">
                                  <div className="font-medium">{c.nombre}</div>
                                  {c.direccion && (
                                    <div className="text-xs truncate" style={{ color: COLORS.dim, maxWidth: 240 }}>{c.direccion}</div>
                                  )}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="inline-flex items-center gap-1.5 font-mono text-xs whitespace-nowrap">
                                    <span style={{ width: 7, height: 7, borderRadius: 9, backgroundColor: colorEstado }} />
                                    {(c.pppoe_usuario || "—").split("@")[0]}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{c.ip_asignada || "—"}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap">{plan ? plan.nombre : <span style={{ color: COLORS.dim }}>Sin plan</span>}</td>
                                {clientesVista === "atraso" && (
                                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                    <div className="font-mono" style={{ color: COLORS.danger }}>{deuda ? money(deuda.monto) : "—"}</div>
                                    {deuda && (
                                      <div className="text-xs" style={{ color: COLORS.dim }}>{diasDeAtraso(deuda.factura)} días</div>
                                    )}
                                  </td>
                                )}
                                <td className="px-3 py-2.5"><CicloBadge ciclo={c.ciclo} /></td>
                                <td className="px-3 py-2.5"><EstadoBadge estado={c.estado} /></td>
                                <td className="px-3 py-2.5">
                                  <div className="flex gap-1">{renderContacto(c)}</div>
                                </td>
                                {!esCajero && (
                                  <td className="px-3 py-2.5">
                                    <div className="flex justify-end gap-1">
                                      <IconoAccion title="Editar" color={COLORS.accent} onClick={() => editarCliente(c)}>
                                        <Pencil size={14} />
                                      </IconoAccion>
                                      <IconoAccion title="Eliminar" color={COLORS.danger} onClick={() => eliminarCliente(c)}>
                                        <Trash2 size={14} />
                                      </IconoAccion>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Tarjetas en celular */}
                    <div className="md:hidden">
                      {clientesPagina.map((c, i) => {
                        const plan = planById(c.plan_id);
                        const deuda = deudaPorCliente[c.id];
                        return (
                          <div
                            key={c.id}
                            className="px-4 py-3"
                            style={{
                              borderTop: i > 0 ? `1px solid ${COLORS.border}` : "none",
                              backgroundColor: deuda ? COLORS.danger + "12" : "transparent",
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-medium">{c.nombre}</div>
                                <div className="text-xs" style={{ color: COLORS.dim }}>
                                  {plan ? plan.nombre : "Sin plan"}
                                  {c.ip_asignada ? `, ${c.ip_asignada}` : ""}
                                </div>
                              </div>
                              <EstadoBadge estado={c.estado} />
                            </div>
                            {deuda && (
                              <div className="text-xs mt-1" style={{ color: COLORS.danger }}>
                                Debe {money(deuda.monto)}, {diasDeAtraso(deuda.factura)} días de atraso
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-2">
                              <div className="flex gap-1">{renderContacto(c)}</div>
                              {!esCajero && (
                                <div className="flex gap-1">
                                  <IconoAccion title="Editar" color={COLORS.accent} onClick={() => editarCliente(c)}>
                                    <Pencil size={14} />
                                  </IconoAccion>
                                  <IconoAccion title="Eliminar" color={COLORS.danger} onClick={() => eliminarCliente(c)}>
                                    <Trash2 size={14} />
                                  </IconoAccion>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Paginación */}
                    <div
                      className="flex items-center justify-between gap-3 px-4 py-3 text-xs"
                      style={{ borderTop: `1px solid ${COLORS.border}`, color: COLORS.dim }}
                    >
                      <span>
                        Mostrando {inicio + 1} a {inicio + clientesPagina.length} de {filteredClients.length}
                      </span>
                      {totalPaginas > 1 && (
                        <div className="flex items-center gap-2">
                          <IconoAccion
                            title="Página anterior"
                            color={COLORS.accent}
                            onClick={paginaActual > 1 ? () => setPage(paginaActual - 1) : null}
                          >
                            <ChevronLeft size={14} />
                          </IconoAccion>
                          <span style={{ color: COLORS.text }}>{paginaActual} / {totalPaginas}</span>
                          <IconoAccion
                            title="Página siguiente"
                            color={COLORS.accent}
                            onClick={paginaActual < totalPaginas ? () => setPage(paginaActual + 1) : null}
                          >
                            <ChevronRight size={14} />
                          </IconoAccion>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {tab === "planes" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h1 className="font-display text-xl md:text-2xl font-semibold">Planes</h1>
                <Button onClick={() => setPlanModal({})}>
                  <Plus size={16} /> Nuevo plan
                </Button>
              </div>
              <div className="flex items-center gap-4 mb-4">
                <OrdenFlecha label="Nombre" campo="nombre" valor={ordenPlan} onChange={setOrdenPlan} />
                <OrdenFlecha label="Precio" campo="precio" valor={ordenPlan} onChange={setOrdenPlan} />
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {planes.slice().sort((a, b) => {
                  if (ordenPlan === "nombre_asc") return (a.nombre || "").localeCompare(b.nombre || "");
                  if (ordenPlan === "nombre_desc") return (b.nombre || "").localeCompare(a.nombre || "");
                  if (ordenPlan === "precio_asc") return Number(a.precio || 0) - Number(b.precio || 0);
                  if (ordenPlan === "precio_desc") return Number(b.precio || 0) - Number(a.precio || 0);
                  return 0;
                }).map((p) => {
                  const cantidad = clientes.filter((c) => c.plan_id === p.id).length;
                  return (
                    <div
                      key={p.id}
                      className="rounded-xl p-4"
                      style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}` }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Wifi size={16} color={COLORS.accent} />
                        <div className="flex gap-2">
                          <button onClick={() => setPlanModal(p)} style={{ color: COLORS.dim }}>
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => window.confirm(`¿Eliminar el plan ${p.nombre}?`) && deletePlan(p.id)}
                            style={{ color: COLORS.dim }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="text-sm font-medium mb-1">{p.nombre}</div>
                      <div className="text-xs mb-2" style={{ color: COLORS.dim }}>
                        {p.velocidad ? `${p.velocidad}, ` : ""}{p.perfil_mikrotik ? `perfil ${p.perfil_mikrotik}, ` : ""}{cantidad} cliente{cantidad === 1 ? "" : "s"}
                      </div>
                      <div className="font-mono text-lg" style={{ color: COLORS.text }}>{money(p.precio)}<span className="text-xs" style={{ color: COLORS.dim }}>/mes</span></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "facturacion" && (
            <div>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
                <h1 className="font-display text-xl md:text-2xl font-semibold">Facturación</h1>
                <div className="flex flex-wrap gap-2">
                  {!esCajero && (
                    <>
                      <Button variant="ghost" onClick={() => setMigracionModal(true)}>
                        <Upload size={16} /> Importar de WispHub
                      </Button>
                      <Button onClick={() => setInvoiceModal({})}>
                        <Plus size={16} /> Nueva factura
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {facturaFiltro !== "todas" && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs" style={{ color: COLORS.dim }}>Mostrando solo:</span>
                  {facturaFiltro === "por_cobrar" ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ color: COLORS.warn, backgroundColor: COLORS.warn + "1A", border: `1px solid ${COLORS.warn}40` }}
                    >
                      Por cobrar (pendientes + vencidas)
                    </span>
                  ) : (
                    <FacturaBadge estado={facturaFiltro} />
                  )}
                  <button onClick={() => setFacturaFiltro("todas")} className="text-xs underline" style={{ color: COLORS.accent }}>
                    Quitar filtro
                  </button>
                </div>
              )}
              <div className="flex items-center gap-4 mb-3">
                <span className="text-xs" style={{ color: COLORS.dim }}>Ordenar:</span>
                <OrdenFlecha label="Cliente" campo="cliente" valor={ordenFactura} onChange={setOrdenFactura} />
                <OrdenFlecha label="Monto" campo="monto" valor={ordenFactura} onChange={setOrdenFactura} />
                <OrdenFlecha label="Vencimiento" campo="vencimiento" valor={ordenFactura} onChange={setOrdenFactura} />
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${COLORS.border}` }}>
                {(() => {
                  const facturasFiltradas = facturas
                    .slice()
                    .reverse()
                    .filter((f) => (esCajero ? f.estado !== "pagada" || f.cobrado_por === miUserId : true))
                    .filter((f) => {
                      if (facturaFiltro === "todas") return true;
                      const visual = estadoVisual(f, new Date());
                      if (facturaFiltro === "por_cobrar") return visual !== "pagada";
                      return visual === facturaFiltro;
                    })
                    .sort((a, b) => {
                      if (!ordenFactura) return 0;
                      if (ordenFactura === "cliente_asc" || ordenFactura === "cliente_desc") {
                        const na = clientes.find((c) => c.id === a.cliente_id)?.nombre || "";
                        const nb = clientes.find((c) => c.id === b.cliente_id)?.nombre || "";
                        return ordenFactura === "cliente_asc" ? na.localeCompare(nb) : nb.localeCompare(na);
                      }
                      if (ordenFactura === "monto_asc") return Number(a.monto || 0) - Number(b.monto || 0);
                      if (ordenFactura === "monto_desc") return Number(b.monto || 0) - Number(a.monto || 0);
                      if (ordenFactura === "vencimiento_asc") return (a.fecha_vencimiento || "").localeCompare(b.fecha_vencimiento || "");
                      if (ordenFactura === "vencimiento_desc") return (b.fecha_vencimiento || "").localeCompare(a.fecha_vencimiento || "");
                      return 0;
                    });
                  if (facturasFiltradas.length === 0) {
                    return (
                      <div className="p-6 text-sm text-center" style={{ color: COLORS.dim, backgroundColor: COLORS.panel }}>
                        No hay facturas que coincidan.
                      </div>
                    );
                  }
                  return facturasFiltradas.map((f) => {
                    const c = clientes.find((c) => c.id === f.cliente_id);
                    const visual = estadoVisual(f, new Date());
                    const mensaje = c ? mensajeRecordatorio(c, f) : "";
                    const link = c ? whatsappLink(c.telefono, mensaje) : null;
                    return (
                      <div
                        key={f.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3"
                        style={{ backgroundColor: COLORS.panel, borderTop: `1px solid ${COLORS.border}` }}
                      >
                        <div>
                          <div className="text-sm font-medium">{c ? c.nombre : "Cliente eliminado"}</div>
                          <div className="text-xs" style={{ color: COLORS.dim }}>
                            {f.numero_wisphub ? `#${f.numero_wisphub} · ` : ""}Periodo: {f.periodo} · Vence: {f.fecha_vencimiento || "—"}
                            {f.prorroga_hasta && <span style={{ color: COLORS.warn }}> · Prórroga hasta {f.prorroga_hasta}</span>}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-mono text-sm">{money(f.monto)}</span>
                          <FacturaBadge estado={visual} />
                          {f.estado !== "pagada" && (
                            <Button variant="ghost" onClick={() => setPagoModal(f)}>
                              Marcar pagada
                            </Button>
                          )}
                          {f.estado !== "pagada" && !esCajero && (
                            <button
                              onClick={() => setProrrogaModal(f)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium"
                              style={{ color: COLORS.warn, border: `1px solid ${COLORS.warn}40`, backgroundColor: COLORS.warn + "1A" }}
                            >
                              <CalendarPlus size={13} /> Prórroga
                            </button>
                          )}
                          {f.estado !== "pagada" && link && (
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium"
                              style={{ color: COLORS.active, border: `1px solid ${COLORS.active}40`, backgroundColor: COLORS.active + "1A" }}
                            >
                              <MessageCircle size={13} /> Recordar
                            </a>
                          )}
                          <button
                            onClick={() => setReciboModal(f)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium"
                            style={{ color: COLORS.accent, border: `1px solid ${COLORS.accent}40`, backgroundColor: COLORS.accent + "1A" }}
                          >
                            <Receipt size={13} /> Recibo
                          </button>
                          {puedeAnular(f) && (
                            <button
                              onClick={() => anularPago(f)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium"
                              style={{ color: COLORS.danger, border: `1px solid ${COLORS.danger}40`, backgroundColor: COLORS.danger + "1A" }}
                              title="Deshacer este pago; la factura vuelve a quedar pendiente"
                            >
                              <X size={13} /> Anular pago
                            </button>
                          )}
                          {!esCajero && (
                            <button
                              onClick={() => window.confirm("¿Eliminar esta factura?") && deleteInvoice(f.id)}
                              style={{ color: COLORS.dim }}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
          {tab === "reportes" && (
            <ReportesTab
              clientes={clientes}
              planes={planes}
              facturas={facturas}
              movimientos={movimientos}
              historialMensual={historialMensual}
              onGuardarHistorialMes={saveHistorialMes}
              onEliminarHistorialMes={deleteHistorialMes}
              onVerFacturas={(filtro) => {
                setFacturaFiltro(filtro);
                setTab("facturacion");
              }}
            />
          )}
          {tab === "mapa" && <MapaTab clientes={clientes} planById={planById} onImportar={() => setImportUbicacionModal(true)} />}
          {tab === "caja" && (
            <CajaTab
              movimientos={movimientos}
              facturas={facturas}
              clientes={clientes}
              nombreCajero={nombreCajero}
              soloUsuario={esCajero ? miUserId : null}
              puedeAnular={puedeAnular}
              onAnular={anularPago}
              onNuevo={() => setMovimientoModal({})}
              onEditar={(m) => setMovimientoModal(m)}
              onEliminar={deleteMovimiento}
              orden={ordenCaja}
              onOrden={setOrdenCaja}
            />
          )}
          {tab === "puntos-pago" && esAdmin && (
            <PuntosDePagoTab
              puntosDePago={puntosDePago}
              liquidaciones={liquidaciones}
              facturas={facturas}
              onGuardarComision={guardarComision}
              onGestionar={gestionarUsuario}
              onLiquidar={liquidarCajero}
              onCrear={crearPuntoDePago}
            />
          )}
          {tab === "configuracion" && esAdmin && (
            <ConfiguracionTab config={config} onGuardar={guardarConfig} session={session} />
          )}
        </main>
      </div>

      {/* ---------- Menú inferior (celular) ---------- */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 flex overflow-x-auto no-print"
        style={{ backgroundColor: COLORS.nav, borderTop: `1px solid ${COLORS.border}`, zIndex: 1100 }}
      >
        {NAV.map(({ id, label, Icon }) => {
          const activo = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="relative flex flex-col items-center gap-1 px-2 py-2 text-xs font-medium shrink-0"
              style={{ minWidth: 72, color: activo ? COLORS.accent : COLORS.dim, boxShadow: activo ? `inset 0 2px 0 ${COLORS.accent}` : "none" }}
            >
              <Icon size={20} />
              {label}
              {id === "clientes" && clientesEnAtraso.length > 0 && (
                <span
                  className="absolute rounded-full px-1 font-mono"
                  style={{ top: 4, right: 14, fontSize: 10, backgroundColor: COLORS.danger, color: "#fff" }}
                >
                  {clientesEnAtraso.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {clientModal && (
        <ClientForm
          initial={clientModal}
          planes={planes}
          onCancel={() => setClientModal(null)}
          onSave={saveClient}
        />
      )}
      {planModal && (
        <PlanForm initial={planModal} onCancel={() => setPlanModal(null)} onSave={savePlan} />
      )}
      {invoiceModal && (
        <InvoiceForm
          initial={invoiceModal}
          clientes={clientes}
          planById={planById}
          onCancel={() => setInvoiceModal(null)}
          onSave={saveInvoice}
        />
      )}
      {prorrogaModal && (
        <ProrrogaForm
          factura={prorrogaModal}
          onCancel={() => setProrrogaModal(null)}
          onSave={(fecha) => saveProrroga(prorrogaModal.id, fecha)}
        />
      )}
      {importModal && (
        <ImportForm
          planes={planes}
          onCancel={() => setImportModal(false)}
          onEnsurePlanes={ensurePlanes}
          onImport={importarClientes}
        />
      )}
      {pagoModal && (
        <PagoForm
          factura={pagoModal}
          onCancel={() => setPagoModal(null)}
          onSave={(formaPago) => markPaid(pagoModal.id, formaPago)}
        />
      )}
      {movimientoModal && (
        <MovimientoForm
          initial={movimientoModal}
          onCancel={() => setMovimientoModal(null)}
          onSave={saveMovimiento}
        />
      )}
      {importFacturasModal && (
        <ImportFacturasForm
          onCancel={() => setImportFacturasModal(false)}
          onImport={importarFacturas}
        />
      )}
      {importPagosModal && (
        <ImportPagosForm
          onCancel={() => setImportPagosModal(false)}
          onImport={reconciliarPagos}
        />
      )}
      {importUbicacionModal && (
        <ImportUbicacionForm
          onCancel={() => setImportUbicacionModal(false)}
          onImport={importarUbicaciones}
        />
      )}
      {importTelefonosModal && (
        <ImportTelefonosForm
          onCancel={() => setImportTelefonosModal(false)}
          onImport={importarTelefonos}
        />
      )}
      {importPlanesModal && (
        <ImportPlanesForm
          onCancel={() => setImportPlanesModal(false)}
          onImport={importarPlanesClientes}
        />
      )}
      {importHistorialModal && (
        <ImportHistorialIngresosForm
          onCancel={() => setImportHistorialModal(false)}
          onImport={importarHistorialIngresos}
        />
      )}
      {reciboModal && (
        <ReciboModal
          factura={reciboModal}
          cliente={clientes.find((c) => c.id === reciboModal.cliente_id)}
          plan={planById(clientes.find((c) => c.id === reciboModal.cliente_id)?.plan_id)}
          cajeroNombre={nombreCajero(reciboModal.cobrado_por)}
          empresa={empresaActual}
          tamano={config?.tamano_recibo || "mediano"}
          formatoDefault={config?.formato_recibo || "termica"}
          onClose={() => setReciboModal(null)}
        />
      )}
      {migracionModal && (
        <MigracionWispHub
          clientes={clientes}
          facturas={facturas}
          planes={planes}
          ensurePlanes={ensurePlanes}
          session={session}
          onClose={() => setMigracionModal(false)}
          onTerminado={loadAll}
        />
      )}
    </div>
  );
}

/* =====================================================================
   MIGRACIÓN DESDE WISPHUB
   Lee el export completo de clientes y uno o varios exports de facturas.
   Cada cliente se identifica por su Usuario PPPoE y cada factura por su
   número de WispHub, así que subir archivos repetidos o periodos que se
   pisan nunca duplica nada: lo repetido se ignora y lo que cambió se actualiza.
   ===================================================================== */

const SQL_WISPHUB = `alter table clientes add column if not exists wisphub_usuario text;
alter table clientes add column if not exists fecha_cancelacion date;
alter table clientes add column if not exists comentarios text;
create unique index if not exists clientes_wisphub_usuario_key on clientes (wisphub_usuario);

alter table facturas add column if not exists numero_wisphub integer;
alter table facturas add column if not exists fecha_pago timestamptz;
alter table facturas add column if not exists fecha_emision date;
alter table facturas add column if not exists cajero text;
create unique index if not exists facturas_numero_wisphub_key on facturas (numero_wisphub);

alter table planes add column if not exists perfil_mikrotik text;`;

const normKey = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const txtWH = (v) => (v instanceof Date ? fmtISO(v) : String(v ?? "")).trim();
const numWH = (v) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")) || 0);
const p2 = (n) => String(n).padStart(2, "0");

// "08/10/2026 16:15" -> { fecha: "2026-10-08", hora: "16:15" }. "0/0/0" o vacío -> null.
function fechaWH(v) {
  if (v instanceof Date && !isNaN(v)) return { fecha: fmtISO(v), hora: `${p2(v.getHours())}:${p2(v.getMinutes())}` };
  const s = txtWH(v);
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return { fecha: `${m[3]}-${p2(m[2])}-${p2(m[1])}`, hora: m[4] ? `${p2(m[4])}:${m[5]}` : null };
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) return { fecha: `${m[1]}-${m[2]}-${m[3]}`, hora: m[4] ? `${m[4]}:${m[5]}` : null };
  return null;
}

// Lee la salida de "/ppp profile export" de MikroTik y devuelve { perfil -> velocidad }.
function perfilesMikrotik(texto) {
  const mapa = new Map();
  if (!texto) return mapa;
  const unido = texto.replace(/\\\r?\n\s*/g, "");
  const valor = (linea, campo) => {
    const m = linea.match(new RegExp(`(?:^|\\s)${campo}=("(?:[^"\\\\]|\\\\.)*"|\\S+)`));
    if (!m) return null;
    return m[1].replace(/^"|"$/g, "").replace(/\\(.)/g, "$1").trim();
  };
  unido.split(/\r?\n/).forEach((linea) => {
    if (!/^\s*add\s/.test(linea)) return;
    const nombre = valor(linea, "name");
    const rate = valor(linea, "rate-limit");
    if (nombre && rate) mapa.set(normKey(nombre), rate.split(/\s+/)[0]);
  });
  return mapa;
}

// "3, $2700.00" -> { n: 3, monto: 2700 }
function conteoWH(v) {
  const m = txtWH(v).match(/^(\d+)\s*,\s*\$?\s*([\d,.\-]+)/);
  return m ? { n: parseInt(m[1], 10), monto: numWH(m[2].replace(/,/g, "")) } : null;
}

function formaPagoWH(v) {
  const n = normKey(v);
  if (!n) return "efectivo";
  if (n.includes("transf")) return "transferencia";
  if (n.includes("saldo")) return "saldo_favor";
  return "efectivo";
}

function leerArchivoWH(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true, codepage: 65001 });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const matriz = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
        const hi = matriz.slice(0, 15).findIndex((r) => r.some((c) => ["#factura", "nombre"].includes(normKey(c))));
        if (hi < 0) {
          resolve({ nombre: file.name, tipo: null, filas: [], error: "No encontré los encabezados de WispHub en este archivo." });
          return;
        }
        const headers = matriz[hi].map(normKey);
        const filas = matriz
          .slice(hi + 1)
          .filter((r) => r.some((c) => txtWH(c) !== ""))
          .map((r) => {
            const o = {};
            headers.forEach((h, i) => { if (h) o[h] = r[i]; });
            return o;
          });
        let tipo = null;
        let error = "";
        if (headers.includes("#factura")) tipo = "facturas";
        else if (headers.includes("profile") && headers.includes("precio") && !headers.includes("servicio")) tipo = "planes";
        else if (headers.includes("nombre") && headers.includes("servicio")) {
          if (headers.includes("usuario")) tipo = "clientes";
          else error = "Este es el export corto de clientes. Usa el completo, el que trae la columna Usuario.";
        } else error = "No reconozco este archivo como clientes ni facturas de WispHub.";
        // Rango de cada archivo de facturas, para ver de un vistazo qué periodo trae.
        let rango = null;
        if (tipo === "facturas") {
          const nums = filas.map((r) => parseInt(txtWH(r["#factura"]).replace(/\D/g, ""), 10)).filter((n) => n > 0);
          const fechas = filas.map((r) => fechaWH(r["fecha emision"])?.fecha).filter(Boolean).sort();
          if (nums.length) {
            rango = {
              numMin: Math.min(...nums),
              numMax: Math.max(...nums),
              desde: fechas[0] || null,
              hasta: fechas[fechas.length - 1] || null,
            };
          }
        }
        resolve({ nombre: file.name, tipo, filas, error, rango });
      } catch (err) {
        resolve({ nombre: file.name, tipo: null, filas: [], error: "No se pudo leer el archivo." });
      }
    };
    reader.onerror = () => resolve({ nombre: file.name, tipo: null, filas: [], error: "No se pudo leer el archivo." });
    reader.readAsArrayBuffer(file);
  });
}

const CAMPOS_CLIENTE_WH = [
  "nombre", "telefono", "direccion", "estado", "ciclo", "pppoe_usuario", "pppoe_secret",
  "ip_asignada", "fecha_instalacion", "fecha_cancelacion", "comentarios", "lat", "lng",
];

function analizarWH(archivos, clientesDB, facturasDB, planesDB, mikrotikTexto) {
  const avisos = [];

  /* ----- Facturas (primero, porque traen dirección y teléfono extra) ----- */
  const facMap = new Map();
  const extra = new Map();
  let facFilas = 0, facRepetidas = 0, anuladas = 0, sinNumero = 0;
  const numerosAnulados = new Set();
  archivos.filter((a) => a.tipo === "facturas").forEach((a) =>
    a.filas.forEach((r) => {
      facFilas++;
      const numero = parseInt(txtWH(r["#factura"]).replace(/\D/g, ""), 10);
      if (!numero) { sinNumero++; return; }
      const est = normKey(r["estado"]);
      // Canceladas, anuladas y "Se Transfirio" (saldo pasado a otra factura) no son cobros ni deudas.
      if (est.startsWith("cancelad") || est.startsWith("anulad") || est.startsWith("se transf")) {
        if (!numerosAnulados.has(numero)) anuladas++;
        numerosAnulados.add(numero);
        return;
      }
      const pagada = est.startsWith("pagad");
      const usuario = txtWH(r["usuario"]).toLowerCase();
      const venc = fechaWH(r["fecha vencimiento"]);
      const emis = fechaWH(r["fecha emision"]);
      // Las pendientes traen como "Fecha Pago" el día del export: se ignora.
      const pago = pagada ? fechaWH(r["fecha pago"]) : null;
      const cobrado = r["total cobrado"];
      // El periodo es el mes en que se emitió la factura (igual que en WispHub).
      const base = emis || venc;
      const [vy, vm] = base ? base.fecha.split("-").map(Number) : [0, 0];
      const f = {
        numero_wisphub: numero,
        usuario,
        estado: pagada ? "pagada" : "pendiente",
        // WispHub suma sus pagos con "Total Cobrado" (lo que entró a caja); la deuda con "Total".
        monto: pagada ? (txtWH(cobrado) !== "" ? numWH(cobrado) : numWH(r["total"])) : numWH(r["total"]),
        fecha_vencimiento: venc ? venc.fecha : null,
        fecha_emision: emis ? emis.fecha : null,
        fecha_pago: pago ? `${pago.fecha}T${pago.hora || "12:00"}:00-04:00` : null,
        forma_pago: pagada ? formaPagoWH(r["forma de pago"]) : null,
        cajero: txtWH(r["cajero"]) || null,
        periodo: base ? `${MESES[vm - 1]} ${vy}` : "",
      };
      const prev = facMap.get(numero);
      if (prev) {
        facRepetidas++;
        if (prev.estado === "pagada" && f.estado !== "pagada") return; // nos quedamos con la versión pagada
      }
      facMap.set(numero, f);
      const dir = txtWH(r["direccion"]);
      const tel = txtWH(r["telefono"]).replace(/\D/g, "");
      if (usuario && (dir || tel)) {
        const e = extra.get(usuario) || {};
        extra.set(usuario, { direccion: dir || e.direccion, telefono: tel || e.telefono });
      }
    })
  );

  /* ----- Clientes ----- */
  const cliMap = new Map();
  const control = new Map();
  let cliFilas = 0, cliRepetidos = 0, telRaros = 0, sinCoords = 0;
  archivos.filter((a) => a.tipo === "clientes").forEach((a) =>
    a.filas.forEach((r) => {
      const usuario = txtWH(r["usuario"]);
      if (!usuario) return;
      cliFilas++;
      const key = usuario.toLowerCase();
      if (cliMap.has(key)) cliRepetidos++;
      const coords = txtWH(r["coordenadas"]).split(",").map((s) => parseFloat(s));
      const tieneCoords = coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1]);
      const ex = extra.get(key) || {};
      const tel = txtWH(r["telefono"]).replace(/\D/g, "") || ex.telefono || "";
      if (tel && tel.length !== 10 && tel.length !== 11) telRaros++;
      if (!tieneCoords) sinCoords++;
      const inst = fechaWH(r["fecha instalacion"]);
      const canc = fechaWH(r["fecha cancelacion"]);
      const est = normKey(r["estado"]);
      const barrio = txtWH(r["barrio/localidad"]);
      cliMap.set(key, {
        wisphub_usuario: key,
        nombre: txtWH(r["nombre"]),
        telefono: tel || null,
        direccion: [ex.direccion, barrio].filter(Boolean).join(", ") || null,
        estado: ["activo", "suspendido", "cancelado", "moroso"].includes(est) ? est : "activo",
        ciclo: /\b15\b/.test(`${txtWH(r["router"])} ${txtWH(r["zona"])}`) ? 15 : 30,
        plan_nombre: txtWH(r["plan internet"]),
        plan_precio: numWH(r["plan precio"]),
        pppoe_usuario: usuario,
        pppoe_secret: txtWH(r["password hotspot/pppoe"]) || null,
        ip_asignada: txtWH(r["ip"]) || null,
        fecha_instalacion: inst ? inst.fecha : null,
        fecha_cancelacion: canc ? canc.fecha : null,
        comentarios: txtWH(r["comentarios"]) || null,
        lat: tieneCoords ? coords[0] : null,
        lng: tieneCoords ? coords[1] : null,
      });
      const pr = conteoWH(r["pagos realizados"]);
      const pp = conteoWH(r["pagos pendientes"]);
      if (pr || pp) {
        control.set(key, { nombre: txtWH(r["nombre"]), pagN: pr?.n || 0, pagM: pr?.monto || 0, penN: pp?.n || 0, penM: pp?.monto || 0 });
      }
    })
  );

  const planNombreDe = (id) => planesDB.find((p) => p.id === id)?.nombre || "";
  const dbCli = new Map(clientesDB.filter((c) => c.wisphub_usuario).map((c) => [c.wisphub_usuario, c]));
  let cliNuevos = 0, cliCambian = 0, cliIguales = 0;
  cliMap.forEach((c, k) => {
    const d = dbCli.get(k);
    if (!d) { c._accion = "nuevo"; cliNuevos++; return; }
    const cambia =
      CAMPOS_CLIENTE_WH.some((campo) => String(d[campo] ?? "") !== String(c[campo] ?? "")) ||
      normKey(planNombreDe(d.plan_id)) !== normKey(c.plan_nombre);
    c._accion = cambia ? "cambia" : "igual";
    if (cambia) cliCambian++; else cliIguales++;
  });

  /* ----- Planes: archivo de planes + los que usan los clientes + velocidades de MikroTik ----- */
  const velocidades = perfilesMikrotik(mikrotikTexto);
  const planMap = new Map();
  archivos.filter((a) => a.tipo === "planes").forEach((a) =>
    a.filas.forEach((r) => {
      const nombre = txtWH(r["nombre"]);
      if (!nombre || normKey(nombre).includes("suspendido")) return; // perfil de corte, no es un plan de venta
      const perfil = txtWH(r["profile"]);
      planMap.set(normKey(nombre), { nombre, precio: numWH(r["precio"]), perfil: perfil || null, velocidad: velocidades.get(normKey(perfil)) || null });
    })
  );
  cliMap.forEach((c) => {
    const k = normKey(c.plan_nombre);
    if (c.plan_nombre && !planMap.has(k)) planMap.set(k, { nombre: c.plan_nombre, precio: c.plan_precio, perfil: null, velocidad: null });
  });
  let planesSinVelocidad = 0;
  const planes = [...planMap.values()].map((p) => {
    if (velocidades.size > 0 && p.perfil && !p.velocidad) planesSinVelocidad++;
    const d = planesDB.find((x) => normKey(x.nombre) === normKey(p.nombre));
    if (!d) return { ...p, _accion: "nuevo" };
    const cambia =
      Math.abs(Number(d.precio || 0) - p.precio) > 0.001 ||
      (p.velocidad && p.velocidad !== d.velocidad) ||
      (p.perfil && p.perfil !== d.perfil_mikrotik);
    return { ...p, _id: d.id, _accion: cambia ? "cambia" : "igual" };
  });
  const planesNuevos = planes.filter((p) => p._accion === "nuevo");
  if (planesSinVelocidad) avisos.push(`${planesSinVelocidad} planes no tienen su perfil en lo que pegaste de MikroTik y quedan sin velocidad.`);

  /* ----- Facturas contra la base ----- */
  const dbFac = new Map(facturasDB.filter((f) => f.numero_wisphub).map((f) => [Number(f.numero_wisphub), f]));
  const conocidos = new Set([...cliMap.keys(), ...dbCli.keys()]);
  const tiempo = (x) => (x ? new Date(x).getTime() : 0);
  let facNuevas = 0, facCambian = 0, facIguales = 0;
  const sinCliente = new Map();
  facMap.forEach((f, n) => {
    if (!conocidos.has(f.usuario)) {
      f._accion = "sin_cliente";
      sinCliente.set(f.usuario, (sinCliente.get(f.usuario) || 0) + 1);
      return;
    }
    const d = dbFac.get(n);
    if (!d) { f._accion = "nueva"; facNuevas++; return; }
    const cambia =
      d.estado !== f.estado ||
      Math.abs(Number(d.monto) - f.monto) > 0.001 ||
      tiempo(d.fecha_pago) !== tiempo(f.fecha_pago) ||
      (d.forma_pago || null) !== (f.forma_pago || null) ||
      (d.fecha_vencimiento || null) !== f.fecha_vencimiento;
    f._accion = cambia ? "cambia" : "igual";
    if (cambia) facCambian++; else facIguales++;
  });

  /* ----- Prueba de control: lo que quedaría guardado vs lo que dice WispHub ----- */
  const usuarioDeId = new Map(clientesDB.map((c) => [c.id, c.wisphub_usuario]));
  const final = new Map();
  dbFac.forEach((f, n) => final.set(n, { usuario: usuarioDeId.get(f.cliente_id), estado: f.estado, monto: Number(f.monto) }));
  facMap.forEach((f, n) => { if (f._accion !== "sin_cliente") final.set(n, { usuario: f.usuario, estado: f.estado, monto: f.monto }); });
  const porUsuario = new Map();
  final.forEach((f) => {
    if (!f.usuario) return;
    const a = porUsuario.get(f.usuario) || { pagN: 0, pagM: 0, penN: 0, penM: 0 };
    if (f.estado === "pagada") { a.pagN++; a.pagM += f.monto; } else { a.penN++; a.penM += f.monto; }
    porUsuario.set(f.usuario, a);
  });
  let controlRes = null;
  if (control.size > 0) {
    const t = { whPagN: 0, whPagM: 0, whPenN: 0, whPenM: 0, apPagN: 0, apPagM: 0, apPenN: 0, apPenM: 0 };
    const diferencias = [];
    control.forEach((w, u) => {
      const ap = porUsuario.get(u) || { pagN: 0, pagM: 0, penN: 0, penM: 0 };
      t.whPagN += w.pagN; t.whPagM += w.pagM; t.whPenN += w.penN; t.whPenM += w.penM;
      t.apPagN += ap.pagN; t.apPagM += ap.pagM; t.apPenN += ap.penN; t.apPenM += ap.penM;
      if (w.pagN !== ap.pagN || Math.abs(w.pagM - ap.pagM) > 0.01 || w.penN !== ap.penN || Math.abs(w.penM - ap.penM) > 0.01) {
        diferencias.push({ nombre: w.nombre, w, ap });
      }
    });
    controlRes = { t, diferencias };
  }

  if (facMap.size > 0) {
    const nums = [...facMap.keys()];
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const huecos = max - min + 1 - nums.length - anuladas;
    if (min > 1) avisos.push(`Tus facturas empiezan en la #${min}. Las anteriores no están en ningún archivo: exporta periodos más viejos de WispHub.`);
    if (huecos > 20) avisos.push(`Entre la #${min} y la #${max} hay unos ${huecos} números que no aparecen en tus archivos. Suelen ser facturas borradas en WispHub; si la prueba de control cuadra, no te falta nada.`);
  }
  if (sinNumero) avisos.push(`${sinNumero} filas de facturas sin número se ignoraron.`);
  if (telRaros) avisos.push(`${telRaros} teléfonos tienen dígitos de más o de menos. Puedes corregirlos después en cada cliente.`);
  if (sinCoords) avisos.push(`${sinCoords} clientes no tienen coordenadas y no saldrán en el mapa.`);
  if (sinCliente.size) {
    avisos.push(`${[...sinCliente.values()].reduce((s, n) => s + n, 0)} facturas son de ${sinCliente.size} usuarios que no están en tus clientes y no se importarán. Incluye el export de clientes junto con estas facturas.`);
  }

  return {
    cliMap, facMap, planes, planesNuevos, controlRes, avisos,
    cliFilas, cliRepetidos, cliNuevos, cliCambian, cliIguales,
    facFilas, facRepetidas, anuladas, facNuevas, facCambian, facIguales,
  };
}

async function traerTodoWH(tabla, columnas) {
  let todos = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select(columnas).range(desde, desde + 999);
    if (error) throw new Error(error.message);
    todos = todos.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  return todos;
}

async function enLotesWH(filas, tam, fn) {
  for (let i = 0; i < filas.length; i += tam) await fn(filas.slice(i, i + tam), i);
}

function FilaResumenWH({ titulo, partes }) {
  return (
    <div className="px-4 py-3" style={{ borderTop: `1px solid ${COLORS.border}` }}>
      <div className="text-sm font-medium mb-1">{titulo}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {partes.filter((p) => p.valor > 0 || p.siempre).map((p) => (
          <span key={p.label} style={{ color: p.color || COLORS.dim }}>
            <span className="font-mono font-semibold">{p.valor}</span> {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ControlWH({ control }) {
  if (!control) {
    return (
      <p className="text-xs" style={{ color: COLORS.dim }}>
        Sube también el export completo de clientes para comprobar los totales contra WispHub.
      </p>
    );
  }
  const { t, diferencias } = control;
  const filas = [
    { label: "Pagos", whN: t.whPagN, whM: t.whPagM, apN: t.apPagN, apM: t.apPagM },
    { label: "Pendientes", whN: t.whPenN, whM: t.whPenM, apN: t.apPenN, apM: t.apPenM },
  ];
  return (
    <div>
      <div className="rounded-lg overflow-hidden mb-2" style={{ border: `1px solid ${COLORS.border}` }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: COLORS.dim, backgroundColor: COLORS.panel2 }}>
              <th className="text-left px-3 py-2 font-medium"></th>
              <th className="text-right px-3 py-2 font-medium">Según WispHub</th>
              <th className="text-right px-3 py-2 font-medium">Quedará en la app</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {filas.map((f) => {
              const ok = f.whN === f.apN && Math.abs(f.whM - f.apM) < 0.01;
              return (
                <tr key={f.label} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <td className="px-3 py-2 font-sans">{f.label}</td>
                  <td className="px-3 py-2 text-right">{f.whN} · {money(f.whM)}</td>
                  <td className="px-3 py-2 text-right">{f.apN} · {money(f.apM)}</td>
                  <td className="px-3 py-2 text-center">
                    {ok ? <CheckCircle2 size={15} color={COLORS.active} /> : <AlertTriangle size={15} color={COLORS.warn} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {diferencias.length === 0 ? (
        <p className="text-xs" style={{ color: COLORS.active }}>Todo cuadra cliente por cliente con WispHub.</p>
      ) : (
        <div>
          <p className="text-xs mb-1" style={{ color: COLORS.warn }}>
            {diferencias.length} clientes no cuadran. Lo normal es que falte algún periodo de facturas por subir.
          </p>
          <div className="rounded-lg overflow-y-auto text-xs" style={{ border: `1px solid ${COLORS.border}`, maxHeight: 160 }}>
            {diferencias.slice(0, 50).map((d) => (
              <div key={d.nombre} className="flex justify-between gap-2 px-3 py-1.5" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <span className="truncate">{d.nombre}</span>
                <span className="font-mono shrink-0" style={{ color: COLORS.dim }}>
                  pagos {d.ap.pagN}/{d.w.pagN}, pend. {d.ap.penN}/{d.w.penN}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MigracionWispHub({ clientes, facturas, planes, ensurePlanes, session, onClose, onTerminado }) {
  const [listo, setListo] = useState(null);
  const [archivos, setArchivos] = useState([]);
  const [leyendo, setLeyendo] = useState(false);
  const [fase, setFase] = useState("elegir"); // elegir | importando | listo
  const [progreso, setProgreso] = useState("");
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const [hacerBackup, setHacerBackup] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [mikrotikTexto, setMikrotikTexto] = useState("");
  const [verMikrotik, setVerMikrotik] = useState(false);

  useEffect(() => {
    (async () => {
      const a = await supabase.from("clientes").select("wisphub_usuario,fecha_cancelacion,comentarios").limit(1);
      const b = await supabase.from("facturas").select("numero_wisphub,fecha_pago,fecha_emision,cajero").limit(1);
      const c = await supabase.from("planes").select("perfil_mikrotik").limit(1);
      setListo(!a.error && !b.error && !c.error);
    })();
  }, []);

  const validos = archivos.filter((a) => a.tipo);
  const analisis = validos.length > 0 ? analizarWH(validos, clientes, facturas, planes, mikrotikTexto) : null;

  const agregarArchivos = async (e) => {
    const lista = Array.from(e.target.files || []);
    e.target.value = "";
    if (!lista.length) return;
    setLeyendo(true);
    const leidos = await Promise.all(lista.map(leerArchivoWH));
    setArchivos((prev) => [...prev, ...leidos]);
    setLeyendo(false);
  };

  const importar = async () => {
    if (!analisis) return;
    setFase("importando");
    setError("");
    try {
      if (hacerBackup) {
        setProgreso("Haciendo un respaldo de seguridad…");
        try {
          const resp = await fetch("/api/backup-run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ authToken: session?.access_token }),
          });
          if (!resp.ok && !window.confirm("No se pudo hacer el respaldo. ¿Importar de todos modos?")) {
            setFase("elegir");
            return;
          }
        } catch (err) {
          if (!window.confirm("No se pudo hacer el respaldo. ¿Importar de todos modos?")) {
            setFase("elegir");
            return;
          }
        }
      }

      // 1. Planes (nuevos y con cambios de precio, velocidad o perfil)
      const planesNuevos = analisis.planes.filter((p) => p._accion === "nuevo");
      const planesCambian = analisis.planes.filter((p) => p._accion === "cambia");
      if (planesNuevos.length > 0) {
        setProgreso(`Creando ${planesNuevos.length} planes…`);
        const { error: e } = await supabase.from("planes").insert(
          planesNuevos.map((p) => ({ nombre: p.nombre, precio: p.precio, velocidad: p.velocidad || "", perfil_mikrotik: p.perfil }))
        );
        if (e) throw new Error(`Planes: ${e.message}`);
      }
      for (const p of planesCambian) {
        setProgreso(`Actualizando el plan ${p.nombre}…`);
        const cambios = { precio: p.precio };
        if (p.velocidad) cambios.velocidad = p.velocidad;
        if (p.perfil) cambios.perfil_mikrotik = p.perfil;
        const { error: e } = await supabase.from("planes").update(cambios).eq("id", p._id);
        if (e) throw new Error(`Planes: ${e.message}`);
      }
      const planesTodos = await traerTodoWH("planes", "id,nombre");
      const planId = (nombre) => planesTodos.find((p) => normKey(p.nombre) === normKey(nombre))?.id || null;

      // 2. Clientes nuevos y cambiados
      const filasCli = [...analisis.cliMap.values()]
        .filter((c) => c._accion !== "igual")
        .map((c) => {
          const fila = { wisphub_usuario: c.wisphub_usuario, plan_id: planId(c.plan_nombre) };
          CAMPOS_CLIENTE_WH.forEach((campo) => { fila[campo] = c[campo]; });
          return fila;
        });
      await enLotesWH(filasCli, 300, async (lote, i) => {
        setProgreso(`Guardando clientes ${i + 1} a ${i + lote.length} de ${filasCli.length}…`);
        const { error: e } = await supabase.from("clientes").upsert(lote, { onConflict: "wisphub_usuario" });
        if (e) throw new Error(`Clientes: ${e.message}`);
      });

      // 3. Facturas nuevas y cambiadas
      setProgreso("Uniendo facturas con sus clientes…");
      const idsCli = await traerTodoWH("clientes", "id,wisphub_usuario");
      const idDe = new Map(idsCli.filter((c) => c.wisphub_usuario).map((c) => [c.wisphub_usuario, c.id]));
      const filasFac = [...analisis.facMap.values()]
        .filter((f) => (f._accion === "nueva" || f._accion === "cambia") && idDe.get(f.usuario))
        .map((f) => ({
          numero_wisphub: f.numero_wisphub,
          cliente_id: idDe.get(f.usuario),
          estado: f.estado,
          monto: f.monto,
          periodo: f.periodo,
          fecha_vencimiento: f.fecha_vencimiento,
          fecha_emision: f.fecha_emision,
          fecha_pago: f.fecha_pago,
          forma_pago: f.forma_pago,
          cajero: f.cajero,
        }));
      await enLotesWH(filasFac, 500, async (lote, i) => {
        setProgreso(`Guardando facturas ${i + 1} a ${i + lote.length} de ${filasFac.length}…`);
        const { error: e } = await supabase.from("facturas").upsert(lote, { onConflict: "numero_wisphub" });
        if (e) throw new Error(`Facturas: ${e.message}`);
      });

      // 4. Quitar facturas pendientes que la app generó sola para el mismo cliente y mes
      //    (la de WispHub es la buena; así no queda doble deuda).
      const claves = new Set(
        [...analisis.facMap.values()]
          .filter((f) => idDe.get(f.usuario))
          .map((f) => `${idDe.get(f.usuario)}|${(f.fecha_vencimiento || "").slice(0, 7)}`)
      );
      const sobrantes = facturas
        .filter((f) => !f.numero_wisphub && f.estado !== "pagada" && claves.has(`${f.cliente_id}|${(f.fecha_vencimiento || "").slice(0, 7)}`))
        .map((f) => f.id);
      await enLotesWH(sobrantes, 200, async (lote) => {
        setProgreso("Quitando facturas automáticas repetidas…");
        const { error: e } = await supabase.from("facturas").delete().in("id", lote);
        if (e) throw new Error(`Limpieza: ${e.message}`);
      });

      setResultado({
        clientes: filasCli.length,
        facturas: filasFac.length,
        planes: planesNuevos.length + planesCambian.length,
        sobrantes: sobrantes.length,
        ignoradas: analisis.facIguales + analisis.facRepetidas,
        control: analisis.controlRes,
      });
      setFase("listo");
      onTerminado();
    } catch (err) {
      setError(err.message || "Ocurrió un error durante la importación.");
      setFase("elegir");
    }
  };

  const hayCambios =
    analisis &&
    analisis.cliNuevos + analisis.cliCambian + analisis.facNuevas + analisis.facCambian +
      analisis.planes.filter((p) => p._accion !== "igual").length > 0;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-3" style={{ backgroundColor: "#000000AA", zIndex: 9999 }}>
      <div
        className="w-full max-w-2xl rounded-xl"
        style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}`, maxHeight: "92vh", overflowY: "auto" }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <div>
            <h3 className="text-base font-semibold">Importar de WispHub</h3>
            <p className="text-xs" style={{ color: COLORS.dim }}>
              Clientes, planes e historial de facturas. Los repetidos se guardan una sola vez.
            </p>
          </div>
          {fase !== "importando" && (
            <button onClick={onClose} style={{ color: COLORS.dim }}><X size={18} /></button>
          )}
        </div>

        <div className="p-5">
          {listo === null && <p className="text-sm" style={{ color: COLORS.dim }}>Revisando la base de datos…</p>}

          {listo === false && (
            <div>
              <p className="text-sm mb-3">
                Antes de la primera importación hay que preparar la base de datos una sola vez. En Supabase abre
                <strong> SQL Editor</strong>, pega esto y toca <strong>Run</strong>. Luego cierra esta ventana y vuelve a abrirla.
              </p>
              <pre
                className="text-xs rounded-lg p-3 mb-3 overflow-x-auto"
                style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text, whiteSpace: "pre" }}
              >
                {SQL_WISPHUB}
              </pre>
              <Button
                onClick={() => {
                  navigator.clipboard?.writeText(SQL_WISPHUB);
                  setCopiado(true);
                }}
              >
                {copiado ? "Copiado ✓" : "Copiar"}
              </Button>
            </div>
          )}

          {listo && fase === "elegir" && (
            <div>
              <label
                className="flex flex-col items-center justify-center gap-2 rounded-xl p-6 mb-4 text-center cursor-pointer"
                style={{ border: `2px dashed ${COLORS.border}`, backgroundColor: COLORS.panel2 }}
              >
                <Upload size={22} color={COLORS.accent} />
                <span className="text-sm font-medium">{leyendo ? "Leyendo archivos…" : "Elegir archivos de WispHub"}</span>
                <span className="text-xs" style={{ color: COLORS.dim }}>
                  El export completo de clientes, el de planes y todos los de facturas que tengas. Puedes elegir varios a la vez.
                </span>
                <input type="file" multiple accept=".xlsx,.xls,.csv" onChange={agregarArchivos} style={{ display: "none" }} />
              </label>

              {archivos.length > 0 && (
                <div className="rounded-lg mb-4 overflow-hidden" style={{ border: `1px solid ${COLORS.border}` }}>
                  {archivos.map((a, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-xs" style={{ borderTop: i ? `1px solid ${COLORS.border}` : "none" }}>
                      <div className="min-w-0">
                        <div className="truncate">{a.nombre}</div>
                        {a.error ? (
                          <div style={{ color: COLORS.danger }}>{a.error}</div>
                        ) : (
                          <>
                          <div style={{ color: COLORS.dim }}>
                            {{ clientes: "Clientes", facturas: "Facturas", planes: "Planes" }[a.tipo]}, {a.filas.length} filas
                            {a.rango && (
                              <>
                                {a.rango.desde && `, emitidas del ${a.rango.desde.split("-").reverse().join("/")} al ${a.rango.hasta.split("-").reverse().join("/")}`}
                                {`, #${a.rango.numMin} a #${a.rango.numMax}`}
                              </>
                            )}
                          </div>
                          {a.rango &&
                            archivos.slice(0, i).some(
                              (b) => b.rango && b.rango.numMin === a.rango.numMin && b.rango.numMax === a.rango.numMax && b.filas.length === a.filas.length
                            ) && (
                              <div style={{ color: COLORS.warn }}>
                                Trae el mismo periodo que otro archivo de la lista. Revisa el filtro de fechas en WispHub.
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <button onClick={() => setArchivos(archivos.filter((_, j) => j !== i))} style={{ color: COLORS.dim }} title="Quitar">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mb-4">
                <button type="button" onClick={() => setVerMikrotik(!verMikrotik)} className="text-xs" style={{ color: COLORS.accent }}>
                  {verMikrotik ? "Ocultar velocidades de MikroTik" : mikrotikTexto ? "Velocidades de MikroTik pegadas ✓ (ver)" : "Agregar velocidades desde MikroTik (opcional)"}
                </button>
                {verMikrotik && (
                  <div className="mt-2">
                    <p className="text-xs mb-2" style={{ color: COLORS.dim }}>
                      En Winbox abre New Terminal, escribe <code>/ppp profile export</code> y pega aquí todo lo que salga.
                      Cada plan toma la velocidad del perfil que usa en WispHub (necesita el archivo de planes de WispHub).
                    </p>
                    <textarea
                      value={mikrotikTexto}
                      onChange={(e) => setMikrotikTexto(e.target.value)}
                      rows={5}
                      style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }}
                      placeholder="/ppp profile&#10;add ... name=ECONOMICO-1 ... rate-limit=20M/20M ..."
                    />
                  </div>
                )}
              </div>

              {analisis && (
                <>
                  <div className="rounded-lg overflow-hidden mb-4" style={{ border: `1px solid ${COLORS.border}` }}>
                    <div className="px-4 py-2 text-xs font-medium" style={{ backgroundColor: COLORS.panel2, color: COLORS.dim }}>
                      Esto es lo que va a pasar
                    </div>
                    <FilaResumenWH
                      titulo={`Clientes (${analisis.cliMap.size} en los archivos)`}
                      partes={[
                        { label: "nuevos", valor: analisis.cliNuevos, color: COLORS.active, siempre: true },
                        { label: "se actualizan", valor: analisis.cliCambian, color: COLORS.accent },
                        { label: "ya estaban iguales", valor: analisis.cliIguales },
                        { label: "repetidos en los archivos", valor: analisis.cliRepetidos },
                      ]}
                    />
                    {analisis.planes.length > 0 && (
                      <div style={{ borderTop: `1px solid ${COLORS.border}` }}>
                        <FilaResumenWH
                          titulo={`Planes (${analisis.planes.length})`}
                          partes={[
                            { label: "nuevos", valor: analisis.planes.filter((p) => p._accion === "nuevo").length, color: COLORS.active, siempre: true },
                            { label: "se actualizan", valor: analisis.planes.filter((p) => p._accion === "cambia").length, color: COLORS.accent },
                            { label: "ya estaban iguales", valor: analisis.planes.filter((p) => p._accion === "igual").length },
                          ]}
                        />
                        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                          {analisis.planes.map((p) => (
                            <span
                              key={p.nombre}
                              className="rounded-full px-2 py-0.5 text-xs"
                              style={{ backgroundColor: COLORS.panel2, border: `1px solid ${COLORS.border}`, color: p.velocidad ? COLORS.text : COLORS.dim }}
                            >
                              {p.nombre}{p.velocidad ? ` · ${p.velocidad}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <FilaResumenWH
                      titulo={`Facturas (${analisis.facFilas} filas en los archivos)`}
                      partes={[
                        { label: "nuevas", valor: analisis.facNuevas, color: COLORS.active, siempre: true },
                        { label: "se actualizan", valor: analisis.facCambian, color: COLORS.accent },
                        { label: "ya estaban iguales", valor: analisis.facIguales },
                        { label: "repetidas entre archivos (se guardan una vez)", valor: analisis.facRepetidas, color: COLORS.warn },
                        { label: "anuladas en WispHub (se ignoran)", valor: analisis.anuladas },
                      ]}
                    />
                  </div>

                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Prueba de control</div>
                    <ControlWH control={analisis.controlRes} />
                  </div>

                  {analisis.avisos.length > 0 && (
                    <div className="rounded-lg px-3 py-2 mb-4 text-xs" style={{ backgroundColor: COLORS.warn + "14", border: `1px solid ${COLORS.warn}40`, color: COLORS.warn }}>
                      {analisis.avisos.map((a) => <div key={a} className="py-0.5">{a}</div>)}
                    </div>
                  )}
                </>
              )}

              {error && (
                <div className="rounded-lg px-3 py-2 mb-4 text-xs" style={{ backgroundColor: COLORS.danger + "1A", color: COLORS.danger, border: `1px solid ${COLORS.danger}40` }}>
                  {error}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs" style={{ color: COLORS.dim }}>
                  <input type="checkbox" checked={hacerBackup} onChange={(e) => setHacerBackup(e.target.checked)} />
                  Hacer un respaldo antes de importar
                </label>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                  <Button onClick={importar} disabled={!hayCambios} style={{ backgroundColor: COLORS.accent, color: "#fff", opacity: hayCambios ? 1 : 0.4 }}>
                    {analisis && !hayCambios ? "Nada nuevo que importar" : "Importar"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {fase === "importando" && (
            <div className="py-10 text-center">
              <div className="text-sm mb-2">{progreso}</div>
              <div className="text-xs" style={{ color: COLORS.dim }}>No cierres esta ventana.</div>
            </div>
          )}

          {fase === "listo" && resultado && (
            <div>
              <div className="flex items-center gap-2 mb-4" style={{ color: COLORS.active }}>
                <CheckCircle2 size={20} />
                <span className="text-sm font-medium">Importación terminada</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                {[
                  { label: "Clientes guardados", v: resultado.clientes },
                  { label: "Facturas guardadas", v: resultado.facturas },
                  { label: "Planes guardados", v: resultado.planes },
                  { label: "Repetidas ignoradas", v: resultado.ignoradas },
                ].map((k) => (
                  <div key={k.label} className="rounded-lg p-3" style={{ backgroundColor: COLORS.panel2, border: `1px solid ${COLORS.border}` }}>
                    <div className="font-mono text-lg">{k.v}</div>
                    <div className="text-xs" style={{ color: COLORS.dim }}>{k.label}</div>
                  </div>
                ))}
              </div>
              {resultado.sobrantes > 0 && (
                <p className="text-xs mb-3" style={{ color: COLORS.dim }}>
                  Se quitaron {resultado.sobrantes} facturas automáticas que repetían una de WispHub.
                </p>
              )}
              <div className="mb-4">
                <div className="text-sm font-medium mb-2">Prueba de control</div>
                <ControlWH control={resultado.control} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setArchivos([]); setResultado(null); setFase("elegir"); }}>
                  Importar más archivos
                </Button>
                <Button onClick={onClose}>Listo</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const FORMAS_PAGO = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia Bancaria" },
  { value: "saldo_favor", label: "Saldo a Favor" },
];

function cargarImagen(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Dibuja el recibo en un lienzo (canvas) y lo devuelve listo para convertir en PNG.
function dibujarReciboImagen(d, logo) {
  const S = 2; // doble resolución para que se vea nítido en el celular
  const W = 400;
  const P = 24;
  const base = document.createElement("canvas");
  base.width = W * S;
  base.height = 1600 * S;
  const x = base.getContext("2d");
  x.scale(S, S);
  x.fillStyle = "#ffffff";
  x.fillRect(0, 0, W, 1600);
  let y = P;

  const texto = (t, font, color, align, px) => {
    x.font = font;
    x.fillStyle = color || "#111111";
    x.textAlign = align || "left";
    x.fillText(String(t ?? ""), px ?? (align === "center" ? W / 2 : align === "right" ? W - P : P), y);
  };
  const partir = (t, font, maxW) => {
    x.font = font;
    const palabras = String(t ?? "").split(" ");
    const lineas = [];
    let l = "";
    palabras.forEach((p) => {
      const prueba = l ? `${l} ${p}` : p;
      if (x.measureText(prueba).width > maxW && l) {
        lineas.push(l);
        l = p;
      } else l = prueba;
    });
    if (l) lineas.push(l);
    return lineas;
  };
  const raya = () => {
    y += 2;
    x.strokeStyle = "#9a9a9a";
    x.setLineDash([4, 3]);
    x.beginPath();
    x.moveTo(P, y);
    x.lineTo(W - P, y);
    x.stroke();
    x.setLineDash([]);
    y += 22;
  };
  const fila = (izq, der, fuerte) => {
    const font = fuerte ? "bold 16px Arial" : "14px Arial";
    texto(izq, font, "#111", "left");
    texto(der, font, "#111", "right");
    y += fuerte ? 24 : 21;
  };
  const dato = (label, valor) => {
    const lineas = partir(`${label} ${valor}`, "14px Arial", W - P * 2);
    lineas.forEach((l, i) => {
      if (i === 0) {
        x.font = "bold 14px Arial";
        x.fillStyle = "#111";
        x.textAlign = "left";
        x.fillText(label, P, y);
        const ancho = x.measureText(label + " ").width;
        texto(l.slice(label.length + 1), "14px Arial", "#111", "left", P + ancho);
      } else texto(l, "14px Arial");
      y += 20;
    });
  };

  if (logo) {
    const h = 60;
    const w = Math.min((logo.width * h) / logo.height, 160);
    x.drawImage(logo, (W - w) / 2, y, w, h);
    y += h + 26;
  } else y += 18;
  partir(d.empresa.nombre, "bold 22px Arial", W - P * 2).forEach((l) => { texto(l, "bold 22px Arial", "#111", "center"); y += 26; });
  if (d.empresa.direccion) { texto(d.empresa.direccion, "13px Arial", "#555", "center"); y += 18; }
  const contacto = [d.empresa.telefono, d.empresa.email].filter(Boolean).join(" · ");
  if (contacto) { texto(contacto, "13px Arial", "#555", "center"); y += 18; }

  // Sello de estado
  y += 8;
  const sello = d.pagada ? "PAGADO" : "PENDIENTE";
  const colorSello = d.pagada ? "#1f9d55" : "#d97706";
  x.font = "bold 14px Arial";
  const anchoSello = x.measureText(sello).width + 28;
  x.strokeStyle = colorSello;
  x.lineWidth = 2;
  x.strokeRect((W - anchoSello) / 2, y - 4, anchoSello, 26);
  x.lineWidth = 1;
  y += 14;
  texto(sello, "bold 14px Arial", colorSello, "center");
  y += 26;

  raya();
  texto(`Fecha: ${d.fecha}`, "12px Arial", "#555", "left");
  texto(`${d.pagada ? "Recibo" : "Factura"} N° ${d.numero}`, "12px Arial", "#555", "right");
  y += 12;
  raya();
  dato("Cliente:", d.cliente);
  if (d.telefono) dato("Teléfono:", d.telefono);
  dato("Forma de pago:", d.formaPago);
  raya();
  texto("Descripción", "bold 14px Arial");
  y += 20;
  partir(d.servicio, "14px Arial", W - P * 2).forEach((l) => { texto(l, "14px Arial"); y += 20; });
  partir(d.periodo, "13px Arial", W - P * 2).forEach((l) => { texto(l, "13px Arial", "#555"); y += 19; });
  raya();
  fila("Subtotal:", d.subtotal);
  fila("Descuento:", d.descuento);
  fila("Su pago:", d.suPago);
  raya();
  fila("Nuevo saldo pendiente:", d.saldo, true);
  y += 8;
  texto(`Facturado por: ${d.cajero}`, "12px Arial", "#555");
  y += 28;
  texto(d.pagada ? "¡Gracias por su pago!" : "¡Gracias por su preferencia!", "13px Arial", "#555", "center");
  y += P;

  const final = document.createElement("canvas");
  final.width = W * S;
  final.height = Math.ceil(y * S);
  final.getContext("2d").drawImage(base, 0, 0);
  return final;
}

function ReciboModal({ factura, cliente, plan, cajeroNombre, empresa, tamano, formatoDefault, onClose }) {
  const [formato, setFormato] = useState(formatoDefault || "termica"); // "termica" o "carta"
  const fecha = factura.fecha_pago ? new Date(factura.fecha_pago) : new Date();
  const pagada = factura.estado === "pagada";
  const numeroRecibo = factura.numero_wisphub ? String(factura.numero_wisphub) : String(factura.id).replace(/\D/g, "").slice(-5).padStart(5, "0") || String(factura.id).slice(-5);
  const empresaMostrar = empresa || EMPRESA_DEFAULT;
  const escala = tamano === "chico" ? 0.8 : tamano === "grande" ? 1.25 : 1;
  const sz = (n) => Math.round(n * escala);
  const formaPagoTexto = FORMAS_PAGO.find((f) => f.value === factura.forma_pago)?.label || "—";

  // Mismo recibo, en texto, para mandarlo por WhatsApp (los * ponen negrita en WhatsApp).
  const mensajeWhatsApp = [
    `*${empresaMostrar.nombre}*`,
    pagada ? `Recibo de pago N° ${numeroRecibo}` : `Factura N° ${numeroRecibo}`,
    `Fecha: ${fecha.toLocaleDateString("es-DO")} ${fecha.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}`,
    "",
    `Cliente: ${cliente?.nombre || "—"}`,
    `Servicio: Internet${plan ? ` - Plan ${plan.nombre}` : ""}`,
    `Periodo: ${factura.periodo || "—"}`,
    "",
    pagada ? `*Monto pagado: ${money(factura.monto)}*` : `*Monto a pagar: ${money(factura.monto)}*`,
    pagada ? `Forma de pago: ${formaPagoTexto}` : `Vence: ${factura.fecha_vencimiento || "—"}`,
    `Saldo pendiente: ${pagada ? money(0) : money(factura.monto)}`,
    "",
    pagada ? "¡Gracias por su pago!" : "Gracias por su preferencia.",
    empresaMostrar.telefono ? `Tel: ${empresaMostrar.telefono}` : "",
  ]
    .filter((linea, i, arr) => !(linea === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
  const linkWhatsApp = whatsappLink(cliente?.telefono, mensajeWhatsApp);
  const linkChat = whatsappLink(cliente?.telefono, "");

  // El logo se carga al abrir el recibo, para que al tocar "Enviar" la imagen salga al instante.
  const [logoImg, setLogoImg] = useState(null);
  const [avisoEnvio, setAvisoEnvio] = useState("");
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    cargarImagen(empresaMostrar.logoUrl).then(setLogoImg);
  }, [empresaMostrar.logoUrl]);

  const generarBlob = async () => {
      const canvas = dibujarReciboImagen(
        {
          empresa: empresaMostrar,
          pagada,
          numero: numeroRecibo,
          fecha: `${fecha.toLocaleDateString("es-DO")} ${fecha.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}`,
          cliente: cliente?.nombre || "—",
          telefono: cliente?.telefono || "",
          formaPago: pagada ? formaPagoTexto : "—",
          servicio: `Servicio de Internet${plan ? ` — Plan ${plan.nombre}` : ""}`,
          periodo: `Periodo: ${factura.periodo || "—"}${factura.fecha_vencimiento ? ` · Vence: ${factura.fecha_vencimiento}` : ""}`,
          subtotal: money(factura.monto),
          descuento: money(0),
          suPago: pagada ? money(factura.monto) : money(0),
          saldo: pagada ? money(0) : money(factura.monto),
          cajero: cajeroNombre || "Administrador",
        },
        logoImg
      );
      return new Promise((r) => canvas.toBlob(r, "image/png"));
  };

  // Opción principal: abre el chat del cliente con el recibo escrito y el enlace a la imagen.
  const enviarWhatsApp = async () => {
    // La ventana se abre en el mismo toque, si no el navegador la bloquea por "ventana emergente".
    const ventana = window.open("", "_blank");
    setAvisoEnvio("");
    setEnviando(true);
    let enlaceImagen = null;
    try {
      const blob = await generarBlob();
      const ruta = `recibo-${numeroRecibo}-${factura.id}.png`;
      const { error } = await supabase.storage
        .from("recibos")
        .upload(ruta, blob, { contentType: "image/png", upsert: true });
      if (error) {
        setAvisoEnvio("No se pudo subir la imagen del recibo (falta preparar el almacenamiento en Supabase). Se envió solo el texto.");
      } else {
        enlaceImagen = `${supabase.storage.from("recibos").getPublicUrl(ruta).data.publicUrl}?v=${Date.now()}`;
      }
    } catch (err) {
      setAvisoEnvio("No se pudo preparar la imagen. Se envió solo el texto.");
    }
    const mensaje = enlaceImagen ? `${mensajeWhatsApp}\n\nVer recibo: ${enlaceImagen}` : mensajeWhatsApp;
    const link = whatsappLink(cliente?.telefono, mensaje);
    if (ventana) ventana.location.href = link;
    else window.location.href = link;
    setEnviando(false);
  };

  // Opción alterna: compartir el archivo de imagen con el menú del teléfono.
  const enviarImagen = async () => {
    setAvisoEnvio("");
    setEnviando(true);
    try {
      const blob = await generarBlob();
      const archivo = new File([blob], `recibo-${numeroRecibo}.png`, { type: "image/png" });

      // Celular: abre el menú de compartir del teléfono (eliges WhatsApp y el chat del cliente).
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        try {
          await navigator.share({ files: [archivo], title: `Recibo ${numeroRecibo}` });
        } catch (err) {
          // Si cancelas el menú de compartir no pasa nada.
        }
        return;
      }

      // Computadora: copiamos la imagen y abrimos el chat del cliente para pegarla.
      try {
        await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
        if (linkChat) window.open(linkChat, "_blank");
        setAvisoEnvio("Imagen copiada. En el chat de WhatsApp presiona Ctrl + V para pegarla y envíala.");
      } catch (err) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = archivo.name;
        a.click();
        setAvisoEnvio("Se descargó la imagen del recibo. Adjúntala en el chat de WhatsApp del cliente.");
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 recibo-overlay" style={{ backgroundColor: "#00000099", zIndex: 9999 }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl p-5 recibo-card"
        style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}`, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 no-print">
          <h3 className="text-base font-semibold" style={{ color: COLORS.text }}>Recibo de pago</h3>
          <button onClick={onClose} style={{ color: COLORS.dim }}><X size={18} /></button>
        </div>

        {factura.recienPagada && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 mb-4 text-sm no-print"
            style={{ backgroundColor: COLORS.active + "1A", color: COLORS.active, border: `1px solid ${COLORS.active}40` }}
          >
            <CheckCircle2 size={16} /> Pago registrado. ¿Lo imprimes o se lo mandas al cliente?
          </div>
        )}

        <div className="flex gap-2 mb-4 no-print">
          <button
            onClick={() => setFormato("termica")}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ backgroundColor: formato === "termica" ? COLORS.accent : COLORS.panel2, color: formato === "termica" ? "#fff" : COLORS.text, border: `1px solid ${COLORS.border}` }}
          >
            Ticket térmico
          </button>
          <button
            onClick={() => setFormato("carta")}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ backgroundColor: formato === "carta" ? COLORS.accent : COLORS.panel2, color: formato === "carta" ? "#fff" : COLORS.text, border: `1px solid ${COLORS.border}` }}
          >
            Hoja / PDF
          </button>
        </div>

        <div
          id="recibo-imprimible"
          className={formato === "termica" ? "recibo-termica" : "recibo-carta"}
          style={{ backgroundColor: "#fff", color: "#000", padding: formato === "termica" ? "10px" : "24px", borderRadius: 8 }}
        >
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            {empresaMostrar.logoUrl && (
              <img
                src={empresaMostrar.logoUrl}
                alt="Logo"
                style={{ maxWidth: sz(formato === "termica" ? 140 : 180), margin: "0 auto 8px", display: "block" }}
              />
            )}
            <div style={{ fontWeight: 700, fontSize: sz(formato === "termica" ? 20 : 24) }}>{empresaMostrar.nombre}</div>
            <div style={{ fontSize: sz(formato === "termica" ? 14 : 15), color: "#555" }}>
              {empresaMostrar.direccion}<br />
              {empresaMostrar.telefono}{empresaMostrar.email ? ` · ${empresaMostrar.email}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: sz(formato === "termica" ? 13 : 14), color: "#555", marginBottom: 6 }}>
            <span>Fecha: {fecha.toLocaleDateString("es-DO")} {fecha.toLocaleTimeString("es-DO")}</span>
            <span>Recibo N° {numeroRecibo}</span>
          </div>

          <div style={{ borderTop: "1px dashed #999", borderBottom: "1px dashed #999", padding: "8px 0", margin: "8px 0", fontSize: sz(formato === "termica" ? 16 : 17) }}>
            <div><strong>Cliente:</strong> {cliente?.nombre || "—"}</div>
            {cliente?.telefono && <div><strong>Teléfono:</strong> {cliente.telefono}</div>}
            <div><strong>Forma de pago:</strong> {FORMAS_PAGO.find((f) => f.value === factura.forma_pago)?.label || "—"}</div>
            <div><strong>Estado:</strong> {pagada ? "Pagada" : "Pendiente"}</div>
          </div>

          <div style={{ fontSize: sz(formato === "termica" ? 15 : 16), marginBottom: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Descripción</div>
            <div>Servicio de Internet{plan ? ` — Plan ${plan.nombre}` : ""}</div>
            <div style={{ color: "#555" }}>Periodo: {factura.periodo || "—"}{factura.fecha_vencimiento ? ` · Vence: ${factura.fecha_vencimiento}` : ""}</div>
          </div>

          <div style={{ fontSize: sz(formato === "termica" ? 16 : 17), marginBottom: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal:</span><span>{money(factura.monto)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Descuento:</span><span>{money(0)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Su pago:</span><span>{pagada ? money(factura.monto) : money(0)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: sz(formato === "termica" ? 19 : 20), marginTop: 4, borderTop: "1px dashed #999", paddingTop: 4 }}>
              <span>Nuevo saldo pendiente:</span>
              <span>{pagada ? money(0) : money(factura.monto)}</span>
            </div>
          </div>

          <div style={{ fontSize: sz(formato === "termica" ? 13 : 14), color: "#555", marginTop: 6 }}>
            <strong>Facturado por:</strong> {cajeroNombre || "Administrador"}
          </div>

          <div style={{ textAlign: "center", fontSize: sz(formato === "termica" ? 13 : 14), color: "#555", marginTop: 10 }}>
            ¡Gracias por su preferencia!
          </div>
        </div>

        {avisoEnvio && (
          <div
            className="rounded-lg px-3 py-2 mt-4 text-xs no-print"
            style={{ backgroundColor: COLORS.active + "1A", color: COLORS.active, border: `1px solid ${COLORS.active}40` }}
          >
            {avisoEnvio}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 mt-4 no-print">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          <button
            type="button"
            onClick={linkWhatsApp ? enviarWhatsApp : enviarImagen}
            disabled={enviando}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
            style={{ backgroundColor: "#25D366", color: "#fff", opacity: enviando ? 0.6 : 1 }}
          >
            <MessageCircle size={16} /> {enviando ? "Preparando…" : linkWhatsApp ? "Enviar por WhatsApp" : "Compartir imagen"}
          </button>
          <Button onClick={() => window.print()}><Printer size={16} /> Imprimir / Guardar PDF</Button>
        </div>
        <div className="flex flex-wrap justify-end gap-x-3 mt-2 text-xs no-print" style={{ color: COLORS.dim }}>
          {linkWhatsApp ? (
            <>
              <button type="button" onClick={enviarImagen} className="underline">Compartir como foto</button>
              <a href={linkWhatsApp} target="_blank" rel="noreferrer" className="underline">Enviar solo texto</a>
            </>
          ) : (
            <span>Este cliente no tiene teléfono: elige el chat a mano al compartir.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function PagoForm({ factura, onCancel, onSave }) {
  const [formaPago, setFormaPago] = useState("efectivo");
  return (
    <Modal title="Marcar factura como pagada" onClose={onCancel}>
      <p className="text-xs mb-3" style={{ color: COLORS.dim }}>Monto: {money(factura.monto)}</p>
      <Field label="Forma de pago">
        <select style={inputStyle} value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
          {FORMAS_PAGO.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button onClick={() => onSave(formaPago)}>Confirmar pago</Button>
      </div>
    </Modal>
  );
}

function MovimientoForm({ initial, onCancel, onSave }) {
  const [form, setForm] = useState({
    id: initial.id,
    tipo: initial.tipo || "gasto",
    descripcion: initial.descripcion || "",
    monto: initial.monto || "",
    forma_pago: initial.forma_pago || "efectivo",
    fecha: initial.fecha || fmtISO(new Date()),
  });
  return (
    <Modal title={initial.id ? "Editar movimiento" : "Nuevo movimiento"} onClose={onCancel}>
      <Field label="Tipo">
        <select style={inputStyle} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
          <option value="gasto">Gasto</option>
          <option value="otro_ingreso">Otro ingreso</option>
        </select>
      </Field>
      <Field label="Descripción">
        <input style={inputStyle} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
      </Field>
      <Field label="Monto">
        <input type="number" style={inputStyle} value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
      </Field>
      <Field label="Forma de pago">
        <select style={inputStyle} value={form.forma_pago} onChange={(e) => setForm({ ...form, forma_pago: e.target.value })}>
          {FORMAS_PAGO.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Fecha">
        <input type="date" style={inputStyle} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button onClick={() => form.descripcion && form.monto && onSave(form)}>Guardar</Button>
      </div>
    </Modal>
  );
}

function HistorialMensualTabla({ historialMensual, onGuardar, onEliminar }) {
  const [nuevoMes, setNuevoMes] = useState("");
  const [editando, setEditando] = useState({});

  const iniciarEdicion = (fila) => {
    setEditando({
      mes: fila.mes,
      pagos_internet: fila.pagos_internet,
      otros_ingresos: fila.otros_ingresos,
      gastos: fila.gastos,
    });
  };

  const guardarEdicion = () => {
    onGuardar({
      mes: editando.mes,
      pagos_internet: parseFloat(editando.pagos_internet) || 0,
      otros_ingresos: parseFloat(editando.otros_ingresos) || 0,
      gastos: parseFloat(editando.gastos) || 0,
    });
    setEditando({});
  };

  const agregarMes = () => {
    if (!nuevoMes) return;
    onGuardar({ mes: nuevoMes, pagos_internet: 0, otros_ingresos: 0, gastos: 0 });
    setNuevoMes("");
  };

  return (
    <div className="rounded-xl overflow-hidden mb-8" style={{ border: `1px solid ${COLORS.border}` }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ backgroundColor: COLORS.panel }}>
          <thead>
            <tr style={{ color: COLORS.dim, borderBottom: `1px solid ${COLORS.border}` }}>
              <th className="text-left px-4 py-2 font-normal">Mes</th>
              <th className="text-right px-4 py-2 font-normal">Pagos Internet</th>
              <th className="text-right px-4 py-2 font-normal">Otros Ingresos</th>
              <th className="text-right px-4 py-2 font-normal">Gastos</th>
              <th className="text-right px-4 py-2 font-normal">Total</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {historialMensual.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-6 font-sans" style={{ color: COLORS.dim }}>
                  Sin meses agregados todavía.
                </td>
              </tr>
            ) : (
              historialMensual.map((h) => {
                const enEdicion = editando.mes === h.mes;
                const total = enEdicion
                  ? (parseFloat(editando.pagos_internet) || 0) + (parseFloat(editando.otros_ingresos) || 0) - (parseFloat(editando.gastos) || 0)
                  : Number(h.pagos_internet) + Number(h.otros_ingresos) - Number(h.gastos);
                return (
                  <tr key={h.mes} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                    <td className="px-4 py-2 font-sans" style={{ color: COLORS.text }}>{h.mes}</td>
                    {enEdicion ? (
                      <>
                        <td className="px-2 py-1">
                          <input type="number" style={{ ...inputStyle, textAlign: "right" }} value={editando.pagos_internet}
                            onChange={(e) => setEditando({ ...editando, pagos_internet: e.target.value })} />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" style={{ ...inputStyle, textAlign: "right" }} value={editando.otros_ingresos}
                            onChange={(e) => setEditando({ ...editando, otros_ingresos: e.target.value })} />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" style={{ ...inputStyle, textAlign: "right" }} value={editando.gastos}
                            onChange={(e) => setEditando({ ...editando, gastos: e.target.value })} />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="text-right px-4 py-2">{money(h.pagos_internet)}</td>
                        <td className="text-right px-4 py-2" style={{ color: COLORS.active }}>{money(h.otros_ingresos)}</td>
                        <td className="text-right px-4 py-2" style={{ color: COLORS.danger }}>{money(h.gastos)}</td>
                      </>
                    )}
                    <td className="text-right px-4 py-2 font-medium" style={{ color: COLORS.text }}>{money(total)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {enEdicion ? (
                        <button onClick={guardarEdicion} style={{ color: COLORS.active }}><CheckCircle2 size={15} /></button>
                      ) : (
                        <button onClick={() => iniciarEdicion(h)} style={{ color: COLORS.dim }}><Pencil size={14} /></button>
                      )}
                      <button onClick={() => onEliminar(h.mes)} style={{ color: COLORS.dim, marginLeft: 8 }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 p-3" style={{ borderTop: `1px solid ${COLORS.border}` }}>
        <input
          type="month"
          style={{ ...inputStyle, maxWidth: 160 }}
          value={nuevoMes}
          onChange={(e) => setNuevoMes(e.target.value)}
        />
        <Button variant="ghost" onClick={agregarMes}><Plus size={14} /> Agregar mes</Button>
      </div>
    </div>
  );
}

const AREAS_DISPONIBLES = [
  { id: "clientes", label: "Clientes" },
  { id: "facturacion", label: "Facturación" },
  { id: "planes", label: "Planes" },
  { id: "reportes", label: "Reportes" },
  { id: "mapa", label: "Mapa" },
  { id: "caja", label: "Caja" },
];

function CrearPuntoDePagoForm({ onCancel, onCrear }) {
  const [form, setForm] = useState({ nombre: "", email: "", password: "", permisos: ["clientes", "facturacion"], comision_tipo: "porcentaje", comision_valor: 0 });
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);

  const togglePermiso = (id) => {
    setForm((f) => ({
      ...f,
      permisos: f.permisos.includes(id) ? f.permisos.filter((p) => p !== id) : [...f.permisos, id],
    }));
  };

  const confirmar = async () => {
    if (!form.nombre || !form.email || form.password.length < 6) {
      setError("Nombre, correo y una contraseña de al menos 6 caracteres son obligatorios.");
      return;
    }
    setCreando(true);
    setError("");
    const ok = await onCrear({ ...form, rol: "cajero", comision_valor: parseFloat(form.comision_valor) || 0 });
    setCreando(false);
    if (ok) onCancel();
    else setError("No se pudo crear. Revisa el aviso rojo arriba de la página.");
  };

  return (
    <Modal title="Nuevo punto de pago" onClose={onCancel}>
      <Field label="Nombre">
        <input style={inputStyle} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
      </Field>
      <Field label="Correo (para iniciar sesión)">
        <input type="email" style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label="Contraseña">
        <input type="text" style={inputStyle} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </Field>
      <Field label="Áreas que puede ver">
        <div className="flex flex-wrap gap-2">
          {AREAS_DISPONIBLES.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => togglePermiso(a.id)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{
                backgroundColor: form.permisos.includes(a.id) ? COLORS.accent : COLORS.panel2,
                color: form.permisos.includes(a.id) ? "#fff" : COLORS.text,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Tipo de comisión">
        <select style={inputStyle} value={form.comision_tipo} onChange={(e) => setForm({ ...form, comision_tipo: e.target.value })}>
          <option value="porcentaje">Porcentaje de lo cobrado</option>
          <option value="fijo">Monto fijo por factura</option>
        </select>
      </Field>
      <Field label={form.comision_tipo === "fijo" ? "Monto por factura" : "Porcentaje (%)"}>
        <input type="number" style={inputStyle} value={form.comision_valor} onChange={(e) => setForm({ ...form, comision_valor: e.target.value })} />
      </Field>
      {error && <p className="text-xs mb-2" style={{ color: COLORS.danger }}>{error}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button onClick={confirmar} disabled={creando}>{creando ? "Creando…" : "Crear"}</Button>
      </div>
    </Modal>
  );
}

function PuntosDePagoTab({ puntosDePago, liquidaciones, facturas, onGuardarComision, onGestionar, onLiquidar, onCrear }) {
  const [editando, setEditando] = useState({});
  const [errorEdicion, setErrorEdicion] = useState("");
  const [guardandoEd, setGuardandoEd] = useState(false);
  const [mostrarCrear, setMostrarCrear] = useState(false);

  const cajeros = puntosDePago.filter((p) => p.rol === "cajero");

  const datosDe = (cajero) => {
    const pendientes = facturas.filter((f) => f.cobrado_por === cajero.user_id && f.estado === "pagada" && !f.liquidado);
    const monto = pendientes.reduce((s, f) => s + Number(f.monto || 0), 0);
    const comision =
      cajero.comision_tipo === "fijo"
        ? pendientes.length * Number(cajero.comision_valor || 0)
        : monto * (Number(cajero.comision_valor || 0) / 100);
    return { cantidad: pendientes.length, monto, comision };
  };

  const iniciarEdicion = async (c) => {
    setErrorEdicion("");
    setEditando({
      user_id: c.user_id,
      comision_tipo: c.comision_tipo || "porcentaje",
      comision_valor: c.comision_valor || 0,
      nombre: c.nombre || "",
      permisos: c.permisos || [],
      email: "",
      emailOriginal: "",
      password: "",
      cargandoEmail: true,
    });
    const info = await onGestionar("info", { user_id: c.user_id });
    setEditando((e) =>
      e.user_id === c.user_id
        ? { ...e, email: info.email || "", emailOriginal: info.email || "", cargandoEmail: false }
        : e
    );
    if (info.error) setErrorEdicion(info.error);
  };
  const guardarEdicion = async () => {
    setErrorEdicion("");
    if (editando.password && editando.password.length < 6) {
      setErrorEdicion("La contraseña nueva debe tener al menos 6 caracteres.");
      return;
    }
    setGuardandoEd(true);
    const cambioEmail = editando.email && editando.email.trim().toLowerCase() !== editando.emailOriginal;
    if (cambioEmail || editando.password) {
      const r = await onGestionar("actualizar", {
        user_id: editando.user_id,
        email: cambioEmail ? editando.email : undefined,
        password: editando.password || undefined,
      });
      if (r.error) {
        setErrorEdicion(r.error);
        setGuardandoEd(false);
        return;
      }
    }
    await onGuardarComision(editando.user_id, editando.comision_tipo, parseFloat(editando.comision_valor) || 0, editando.nombre, editando.permisos);
    setGuardandoEd(false);
    setEditando({});
  };
  const eliminar = async (c) => {
    const { cantidad, monto } = datosDe(c);
    const aviso =
      cantidad > 0
        ? `${c.nombre} tiene ${cantidad} cobros por ${money(monto)} sin liquidar. Liquídalo antes de eliminarlo.\n\n¿Eliminarlo de todos modos?`
        : `¿Eliminar el punto de pago ${c.nombre}? Ya no podrá entrar a la app. Su historial de cobros se conserva.`;
    if (!window.confirm(aviso)) return;
    setGuardandoEd(true);
    const r = await onGestionar("eliminar", { user_id: c.user_id });
    setGuardandoEd(false);
    if (r.error) setErrorEdicion(r.error);
    else setEditando({});
  };
  const toggleEditPermiso = (id) => {
    setEditando((e) => ({ ...e, permisos: (e.permisos || []).includes(id) ? e.permisos.filter((p) => p !== id) : [...(e.permisos || []), id] }));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-xl md:text-2xl font-semibold">Puntos de pago</h1>
        <Button onClick={() => setMostrarCrear(true)}><Plus size={16} /> Nuevo punto de pago</Button>
      </div>
      <p className="text-sm mb-6" style={{ color: COLORS.dim }}>
        Crea aquí mismo el usuario y elige qué partes de la app puede ver.
      </p>

      {mostrarCrear && <CrearPuntoDePagoForm onCancel={() => setMostrarCrear(false)} onCrear={onCrear} />}

      {cajeros.length === 0 ? (
        <div className="rounded-xl p-6 text-sm text-center" style={{ color: COLORS.dim, backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
          Todavía no hay cajeros registrados. Crea un usuario en Supabase y pídele que inicie sesión una vez.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3 mb-8">
          {cajeros.map((c) => {
            const { cantidad, monto, comision } = datosDe(c);
            const enEdicion = editando.user_id === c.user_id;
            return (
              <div key={c.user_id} className="rounded-xl p-4" style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
                {enEdicion ? (
                  <div className="mb-3">
                    <Field label="Nombre">
                      <input style={inputStyle} value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
                    </Field>
                    <Field label="Correo (para iniciar sesión)">
                      <input
                        type="email"
                        style={inputStyle}
                        value={editando.cargandoEmail ? "Cargando…" : editando.email}
                        disabled={editando.cargandoEmail}
                        onChange={(e) => setEditando({ ...editando, email: e.target.value })}
                      />
                    </Field>
                    <Field label="Nueva contraseña (déjala vacía para no cambiarla)">
                      <input
                        type="text"
                        style={inputStyle}
                        value={editando.password}
                        placeholder="Mínimo 6 caracteres"
                        onChange={(e) => setEditando({ ...editando, password: e.target.value })}
                      />
                    </Field>
                    <Field label="Tipo de comisión">
                      <select style={inputStyle} value={editando.comision_tipo} onChange={(e) => setEditando({ ...editando, comision_tipo: e.target.value })}>
                        <option value="porcentaje">Porcentaje de lo cobrado</option>
                        <option value="fijo">Monto fijo por factura</option>
                      </select>
                    </Field>
                    <Field label={editando.comision_tipo === "fijo" ? "Monto por factura" : "Porcentaje (%)"}>
                      <input type="number" style={inputStyle} value={editando.comision_valor} onChange={(e) => setEditando({ ...editando, comision_valor: e.target.value })} />
                    </Field>
                    <Field label="Áreas que puede ver">
                      <div className="flex flex-wrap gap-2">
                        {AREAS_DISPONIBLES.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => toggleEditPermiso(a.id)}
                            className="rounded-lg px-2 py-1 text-xs font-medium"
                            style={{
                              backgroundColor: (editando.permisos || []).includes(a.id) ? COLORS.accent : COLORS.panel2,
                              color: (editando.permisos || []).includes(a.id) ? "#fff" : COLORS.text,
                              border: `1px solid ${COLORS.border}`,
                            }}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </Field>
                    {errorEdicion && <p className="text-xs mb-2" style={{ color: COLORS.danger }}>{errorEdicion}</p>}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button variant="danger" onClick={() => eliminar(c)} disabled={guardandoEd}>
                        <Trash2 size={14} /> Eliminar
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => setEditando({})}>Cancelar</Button>
                        <Button onClick={guardarEdicion} disabled={guardandoEd || editando.cargandoEmail}>
                          {guardandoEd ? "Guardando…" : "Guardar"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-sm font-medium">{c.nombre || "Sin nombre"}</div>
                        <div className="text-xs" style={{ color: COLORS.dim }}>
                          {c.comision_tipo === "fijo" ? `${money(c.comision_valor)} por factura` : `${c.comision_valor || 0}% de lo cobrado`}
                        </div>
                      </div>
                      <button onClick={() => iniciarEdicion(c)} style={{ color: COLORS.dim }}><Pencil size={15} /></button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-3 font-mono text-sm">
                      <div>
                        <div className="text-xs font-sans" style={{ color: COLORS.dim }}>Facturas</div>
                        {cantidad}
                      </div>
                      <div>
                        <div className="text-xs font-sans" style={{ color: COLORS.dim }}>Recaudado</div>
                        {money(monto)}
                      </div>
                      <div>
                        <div className="text-xs font-sans" style={{ color: COLORS.dim }}>Comisión</div>
                        <span style={{ color: COLORS.active }}>{money(comision)}</span>
                      </div>
                    </div>
                    <Button variant="ghost" onClick={() => onLiquidar(c)} disabled={cantidad === 0}>
                      <DollarSign size={14} /> Recaudar y poner en cero
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <h2 className="font-display text-sm font-semibold mb-3" style={{ color: COLORS.dim }}>HISTORIAL DE LIQUIDACIONES</h2>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${COLORS.border}` }}>
        {liquidaciones.length === 0 ? (
          <div className="p-6 text-sm text-center" style={{ color: COLORS.dim, backgroundColor: COLORS.panel }}>Sin liquidaciones todavía.</div>
        ) : (
          liquidaciones.map((l) => (
            <div key={l.id} className="flex items-center justify-between px-4 py-3 text-sm" style={{ backgroundColor: COLORS.panel, borderTop: `1px solid ${COLORS.border}` }}>
              <div>
                <div className="font-medium">{l.nombre_cajero || "Cajero"}</div>
                <div className="text-xs" style={{ color: COLORS.dim }}>{l.fecha} · {l.cantidad_facturas} facturas</div>
              </div>
              <div className="text-right font-mono">
                <div>{money(l.monto_total)}</div>
                <div className="text-xs" style={{ color: COLORS.active }}>Comisión: {money(l.comision)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CajaTab({ movimientos, facturas, clientes, nombreCajero, soloUsuario, puedeAnular, onAnular, onNuevo, onEditar, onEliminar, orden, onOrden }) {
  // Día que se está mirando (por defecto hoy). Vacío = todos los días.
  const [dia, setDia] = useState(fmtISO(new Date()));
  const delDia = (fechaISO) => !dia || (fechaISO || "").slice(0, 10) === dia;
  const sumar = (lista) => lista.reduce((s, x) => s + Number(x.monto || 0), 0);

  // Cobros de facturas: lo que entró por pagos de clientes (si es cajero, solo los suyos).
  const cobros = facturas
    .filter((f) => f.estado === "pagada" && f.fecha_pago)
    .filter((f) => !soloUsuario || f.cobrado_por === soloUsuario)
    .filter((f) => !dia || fmtISO(new Date(f.fecha_pago)) === dia)
    .sort((a, b) => (b.fecha_pago || "").localeCompare(a.fecha_pago || ""));
  const movsDia = movimientos.filter((m) => delDia(m.fecha));
  const gastos = movsDia.filter((m) => m.tipo === "gasto");
  const ingresos = movsDia.filter((m) => m.tipo === "otro_ingreso");
  const totalCobros = sumar(cobros);
  const totalGastos = sumar(gastos);
  const totalIngresos = sumar(ingresos);

  const cuadre = FORMAS_PAGO.map((fp) => {
    const c = sumar(cobros.filter((f) => f.forma_pago === fp.value));
    const i = sumar(ingresos.filter((m) => m.forma_pago === fp.value));
    const g = sumar(gastos.filter((m) => m.forma_pago === fp.value));
    return { ...fp, cobros: c, ingresos: i, gastos: g, total: c + i - g };
  });

  const movimientosOrdenados = movsDia.slice().sort((a, b) => {
    if (!orden) return 0;
    if (orden === "fecha_asc") return (a.fecha || "").localeCompare(b.fecha || "");
    if (orden === "fecha_desc") return (b.fecha || "").localeCompare(a.fecha || "");
    if (orden === "monto_asc") return Number(a.monto || 0) - Number(b.monto || 0);
    if (orden === "monto_desc") return Number(b.monto || 0) - Number(a.monto || 0);
    return 0;
  });

  const clienteDe = (id) => clientes.find((c) => c.id === id)?.nombre || "Cliente eliminado";
  const hora = (iso) => {
    const d = new Date(iso);
    return dia
      ? d.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleString("es-DO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };
  const tarjeta = (label, valor, color, Icon, sub) => (
    <div className="rounded-xl p-4" style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
      <div className="flex items-center gap-2 text-xs mb-2" style={{ color: COLORS.dim }}><Icon size={14} /> {label}</div>
      <div className="font-mono text-lg" style={{ color }}>{money(valor)}</div>
      {sub && <div className="text-xs mt-1" style={{ color: COLORS.dim }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-semibold">Caja</h1>
          <p className="text-sm" style={{ color: COLORS.dim }}>
            {soloUsuario ? "Tus cobros, gastos y otros ingresos." : "Cobros de facturas, gastos y otros ingresos."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" style={{ ...inputStyle, width: "auto" }} value={dia} onChange={(e) => setDia(e.target.value)} />
          {dia ? (
            <Button variant="ghost" onClick={() => setDia("")}>Ver todos los días</Button>
          ) : (
            <Button variant="ghost" onClick={() => setDia(fmtISO(new Date()))}>Hoy</Button>
          )}
          <Button onClick={onNuevo}><Plus size={16} /> Nuevo movimiento</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {tarjeta("Cobros de facturas", totalCobros, COLORS.accent, Receipt, `${cobros.length} pago${cobros.length === 1 ? "" : "s"}`)}
        {tarjeta("Otros ingresos", totalIngresos, COLORS.active, TrendingUp)}
        {tarjeta("Gastos", totalGastos, COLORS.danger, TrendingDown)}
        {tarjeta("Total en caja", totalCobros + totalIngresos - totalGastos, COLORS.text, Wallet, dia ? "del día" : "de todos los días")}
      </div>

      <h2 className="font-display text-sm font-semibold mb-3" style={{ color: COLORS.dim }}>CUADRE POR FORMA DE PAGO</h2>
      <div className="rounded-xl overflow-x-auto mb-8" style={{ border: `1px solid ${COLORS.border}` }}>
        <table className="w-full text-sm" style={{ backgroundColor: COLORS.panel }}>
          <thead>
            <tr style={{ color: COLORS.dim, borderBottom: `1px solid ${COLORS.border}` }}>
              <th className="text-left px-4 py-2 font-normal">Forma de pago</th>
              <th className="text-right px-4 py-2 font-normal">Cobros</th>
              <th className="text-right px-4 py-2 font-normal">Otros ingresos</th>
              <th className="text-right px-4 py-2 font-normal">Gastos</th>
              <th className="text-right px-4 py-2 font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {cuadre.map((r) => (
              <tr key={r.value} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td className="px-4 py-2 font-sans">{r.label}</td>
                <td className="text-right px-4 py-2">{money(r.cobros)}</td>
                <td className="text-right px-4 py-2" style={{ color: COLORS.active }}>{money(r.ingresos)}</td>
                <td className="text-right px-4 py-2" style={{ color: COLORS.danger }}>{money(r.gastos)}</td>
                <td className="text-right px-4 py-2 font-semibold">{money(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-display text-sm font-semibold mb-3" style={{ color: COLORS.dim }}>
        COBROS DE FACTURAS {dia ? `DEL ${dia.split("-").reverse().join("/")}` : "(TODOS)"}
      </h2>
      <div className="rounded-xl overflow-hidden mb-8" style={{ border: `1px solid ${COLORS.border}` }}>
        {cobros.length === 0 ? (
          <div className="p-6 text-sm text-center" style={{ color: COLORS.dim, backgroundColor: COLORS.panel }}>
            No hay cobros {dia ? "este día" : "registrados"}.
          </div>
        ) : (
          cobros.slice(0, 200).map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-3" style={{ backgroundColor: COLORS.panel, borderTop: `1px solid ${COLORS.border}` }}>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{clienteDe(f.cliente_id)}</div>
                <div className="text-xs" style={{ color: COLORS.dim }}>
                  {hora(f.fecha_pago)} · {FORMAS_PAGO.find((x) => x.value === f.forma_pago)?.label || "—"}
                  {f.numero_wisphub ? ` · #${f.numero_wisphub}` : ""}
                  {!soloUsuario && ` · ${nombreCajero(f.cobrado_por) || f.cajero || "Administrador"}`}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-sm" style={{ color: COLORS.accent }}>{money(f.monto)}</span>
                {puedeAnular(f) && (
                  <button onClick={() => onAnular(f)} className="text-xs underline" style={{ color: COLORS.danger }} title="Deshacer este pago">
                    Anular
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        {cobros.length > 200 && (
          <div className="p-3 text-xs text-center" style={{ color: COLORS.dim, backgroundColor: COLORS.panel, borderTop: `1px solid ${COLORS.border}` }}>
            Mostrando los 200 más recientes de {cobros.length}. Elige un día para ver menos.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-sm font-semibold" style={{ color: COLORS.dim }}>GASTOS Y OTROS INGRESOS</h2>
        <div className="flex items-center gap-4">
          <span className="text-xs" style={{ color: COLORS.dim }}>Ordenar:</span>
          <OrdenFlecha label="Fecha" campo="fecha" valor={orden} onChange={onOrden} />
          <OrdenFlecha label="Monto" campo="monto" valor={orden} onChange={onOrden} />
        </div>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${COLORS.border}` }}>
        {movimientosOrdenados.length === 0 ? (
          <div className="p-6 text-sm text-center" style={{ color: COLORS.dim, backgroundColor: COLORS.panel }}>
            No hay gastos ni otros ingresos {dia ? "este día" : "registrados"}.
          </div>
        ) : (
          movimientosOrdenados.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: COLORS.panel, borderTop: `1px solid ${COLORS.border}` }}>
              <div>
                <div className="text-sm font-medium">{m.descripcion}</div>
                <div className="text-xs" style={{ color: COLORS.dim }}>
                  {m.fecha} · {FORMAS_PAGO.find((f) => f.value === m.forma_pago)?.label || m.forma_pago} · {m.tipo === "gasto" ? "Gasto" : "Otro ingreso"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm" style={{ color: m.tipo === "gasto" ? COLORS.danger : COLORS.active }}>
                  {m.tipo === "gasto" ? "-" : "+"}{money(m.monto)}
                </span>
                <button onClick={() => onEditar(m)} style={{ color: COLORS.dim }}><Pencil size={15} /></button>
                <button onClick={() => window.confirm("¿Eliminar este movimiento?") && onEliminar(m.id)} style={{ color: COLORS.dim }}><Trash2 size={15} /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ReportesTab({ clientes, planes, facturas, movimientos, historialMensual, onGuardarHistorialMes, onEliminarHistorialMes, onVerFacturas }) {
  const hoy = new Date();

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();

    const resumenData = [
      { Concepto: "Total facturado", Monto: facturas.reduce((s, f) => s + Number(f.monto || 0), 0) },
      { Concepto: "Cobrado", Monto: facturas.filter((f) => f.estado === "pagada").reduce((s, f) => s + Number(f.monto || 0), 0) },
      { Concepto: "Pendiente", Monto: facturas.filter((f) => f.estado === "pendiente").reduce((s, f) => s + Number(f.monto || 0), 0) },
      {},
      { Concepto: "Forma de pago", "Pagos Internet": "Otros Ingresos", Gastos: "Total" },
      ...FORMAS_PAGO.map((fp) => {
        const pagosInternet = facturas.filter((f) => f.estado === "pagada" && f.forma_pago === fp.value).reduce((s, f) => s + Number(f.monto || 0), 0);
        const otrosIngresos = movimientos.filter((m) => m.tipo === "otro_ingreso" && m.forma_pago === fp.value).reduce((s, m) => s + Number(m.monto || 0), 0);
        const gastos = movimientos.filter((m) => m.tipo === "gasto" && m.forma_pago === fp.value).reduce((s, m) => s + Number(m.monto || 0), 0);
        return { Concepto: fp.label, "Pagos Internet": pagosInternet, "Otros Ingresos": otrosIngresos, Gastos: gastos, Total: pagosInternet + otrosIngresos - gastos };
      }),
    ];
    const wsResumen = XLSX.utils.json_to_sheet(resumenData, { skipHeader: true });
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

    const facturasData = facturas.map((f) => {
      const c = clientes.find((cl) => cl.id === f.cliente_id);
      return {
        Cliente: c ? c.nombre : "Cliente eliminado",
        Periodo: f.periodo,
        Monto: f.monto,
        Estado: f.estado,
        "Forma de pago": f.forma_pago || "",
        "Fecha vencimiento": f.fecha_vencimiento || "",
      };
    });
    const wsFacturas = XLSX.utils.json_to_sheet(facturasData);
    XLSX.utils.book_append_sheet(wb, wsFacturas, "Facturas");

    const clientesData = clientes.map((c) => {
      const plan = planes.find((p) => p.id === c.plan_id);
      return {
        Nombre: c.nombre,
        Telefono: c.telefono || "",
        Direccion: c.direccion || "",
        Estado: c.estado,
        Plan: plan ? plan.nombre : "",
        Ciclo: c.ciclo === 30 ? "Fin de mes" : "Día 15",
      };
    });
    const wsClientes = XLSX.utils.json_to_sheet(clientesData);
    XLSX.utils.book_append_sheet(wb, wsClientes, "Clientes");

    const movimientosData = movimientos.map((m) => ({
      Fecha: m.fecha,
      Tipo: m.tipo === "gasto" ? "Gasto" : "Otro ingreso",
      Descripcion: m.descripcion,
      Monto: m.monto,
      "Forma de pago": m.forma_pago,
    }));
    const wsMovimientos = XLSX.utils.json_to_sheet(movimientosData);
    XLSX.utils.book_append_sheet(wb, wsMovimientos, "Caja");

    XLSX.writeFile(wb, `Reporte-ISP-Control-${fmtISO(hoy)}.xlsx`);
  };

  // Ingresos cobrados por mes: cubre todo el rango real de tus facturas pagadas (hasta 24 meses),
  // o los últimos 6 meses si aún no tienes historial cargado.
  const fechasPagadas = facturas
    .filter((f) => f.estado === "pagada" && (f.fecha_pago || f.fecha_vencimiento))
    .map(mesDePago)
    .sort();
  const meses = [];
  if (fechasPagadas.length > 0) {
    const [anioMin, mesMin] = fechasPagadas[0].split("-").map(Number);
    let cursor = new Date(anioMin, mesMin - 1, 1);
    const limite = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    while (cursor <= limite && meses.length < 24) {
      meses.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
        label: cursor.toLocaleDateString("es-DO", { month: "short", year: "2-digit" }),
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    // si el historial es más largo de 24 meses, mostramos solo los últimos 24
    if (meses.length === 24) {
      const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 23, 1);
      meses.splice(0, meses.length, ...meses.filter((m) => {
        const [y, mo] = m.key.split("-").map(Number);
        return new Date(y, mo - 1, 1) >= desde;
      }));
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      meses.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("es-DO", { month: "short" }) });
    }
  }
  const ingresosPorMes = meses.map((m) => {
    const total = facturas
      .filter((f) => f.estado === "pagada" && mesDePago(f) === m.key)
      .reduce((s, f) => s + Number(f.monto || 0), 0);
    return { mes: m.label, ingresos: total };
  });

  // Totales generales
  const totalFacturado = facturas.reduce((s, f) => s + Number(f.monto || 0), 0);
  const totalCobrado = facturas.filter((f) => f.estado === "pagada").reduce((s, f) => s + Number(f.monto || 0), 0);
  const totalPendiente = facturas.filter((f) => f.estado === "pendiente").reduce((s, f) => s + Number(f.monto || 0), 0);
  const totalVencido = facturas
    .filter((f) => f.estado !== "pagada" && f.fecha_vencimiento && new Date(f.fecha_vencimiento) < hoy)
    .reduce((s, f) => s + Number(f.monto || 0), 0);
  const tasaCobro = totalFacturado > 0 ? Math.round((totalCobrado / totalFacturado) * 100) : 0;

  // Ingresos por plan (según plan actual del cliente, sobre facturas pagadas)
  const ingresosPorPlan = planes.map((p) => {
    const clientesDelPlan = clientes.filter((c) => c.plan_id === p.id).map((c) => c.id);
    const total = facturas
      .filter((f) => f.estado === "pagada" && clientesDelPlan.includes(f.cliente_id))
      .reduce((s, f) => s + Number(f.monto || 0), 0);
    return { nombre: p.nombre, total };
  }).sort((a, b) => b.total - a.total);

  // Mejores clientes por total facturado (pagado)
  const porCliente = {};
  facturas.filter((f) => f.estado === "pagada").forEach((f) => {
    porCliente[f.cliente_id] = (porCliente[f.cliente_id] || 0) + Number(f.monto || 0);
  });
  const topClientes = Object.entries(porCliente)
    .map(([id, total]) => ({ cliente: clientes.find((c) => c.id === id)?.nombre || "Cliente eliminado", total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-xl md:text-2xl font-semibold">Reportes</h1>
        <div className="flex gap-2 no-print">
          <Button variant="ghost" onClick={exportarExcel}><Download size={16} /> Excel</Button>
          <Button variant="ghost" onClick={() => window.print()}><Printer size={16} /> PDF</Button>
        </div>
      </div>
      <p className="text-sm mb-6" style={{ color: COLORS.dim }}>Visión financiera de tu operación.</p>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        {[
          { label: "Total facturado", value: money(totalFacturado), color: COLORS.text, filtro: "todas" },
          { label: "Cobrado", value: money(totalCobrado), color: COLORS.active, filtro: "pagada" },
          { label: "Pendiente", value: money(totalPendiente), color: COLORS.warn, filtro: "pendiente" },
          { label: "Vencido", value: money(totalVencido), color: COLORS.danger, filtro: "vencida" },
          { label: "Tasa de cobro", value: `${tasaCobro}%`, color: COLORS.accent, filtro: "todas" },
        ].map((k) => (
          <button
            key={k.label}
            onClick={() => onVerFacturas(k.filtro)}
            className="rounded-xl p-4 text-left transition-opacity hover:opacity-80"
            style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}` }}
          >
            <div className="text-xs mb-2" style={{ color: COLORS.dim }}>{k.label}</div>
            <div className="font-mono text-lg font-medium" style={{ color: k.color }}>{k.value}</div>
          </button>
        ))}
      </div>

      <h2 className="font-display text-sm font-semibold mb-3" style={{ color: COLORS.dim }}>INGRESOS COBRADOS POR MES</h2>
      <div className="rounded-xl p-4 mb-8" style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}`, height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={ingresosPorMes}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
            <XAxis dataKey="mes" stroke={COLORS.dim} fontSize={12} />
            <YAxis stroke={COLORS.dim} fontSize={12} />
            <Tooltip
              contentStyle={{ backgroundColor: COLORS.panel2, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
              labelStyle={{ color: COLORS.text }}
              formatter={(v) => money(v)}
            />
            <Bar dataKey="ingresos" fill={COLORS.accent} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h2 className="font-display text-sm font-semibold mb-3" style={{ color: COLORS.dim }}>RESUMEN CONTABLE POR FORMA DE PAGO</h2>
      <div className="rounded-xl overflow-x-auto mb-8" style={{ border: `1px solid ${COLORS.border}` }}>
        <table className="w-full text-sm" style={{ backgroundColor: COLORS.panel }}>
          <thead>
            <tr style={{ color: COLORS.dim, borderBottom: `1px solid ${COLORS.border}` }}>
              <th className="text-left px-4 py-2 font-normal">Forma de pago</th>
              <th className="text-right px-4 py-2 font-normal">Pagos Internet</th>
              <th className="text-right px-4 py-2 font-normal">Otros Ingresos</th>
              <th className="text-right px-4 py-2 font-normal">Gastos</th>
              <th className="text-right px-4 py-2 font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {FORMAS_PAGO.map((fp) => {
              const pagosInternet = facturas
                .filter((f) => f.estado === "pagada" && f.forma_pago === fp.value)
                .reduce((s, f) => s + Number(f.monto || 0), 0);
              const otrosIngresos = movimientos
                .filter((m) => m.tipo === "otro_ingreso" && m.forma_pago === fp.value)
                .reduce((s, m) => s + Number(m.monto || 0), 0);
              const gastos = movimientos
                .filter((m) => m.tipo === "gasto" && m.forma_pago === fp.value)
                .reduce((s, m) => s + Number(m.monto || 0), 0);
              const total = pagosInternet + otrosIngresos - gastos;
              return (
                <tr key={fp.value} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <td className="px-4 py-2 font-sans" style={{ color: COLORS.text }}>{fp.label}</td>
                  <td className="text-right px-4 py-2">{money(pagosInternet)}</td>
                  <td className="text-right px-4 py-2" style={{ color: COLORS.active }}>{money(otrosIngresos)}</td>
                  <td className="text-right px-4 py-2" style={{ color: COLORS.danger }}>{money(gastos)}</td>
                  <td className="text-right px-4 py-2 font-medium" style={{ color: COLORS.text }}>{money(total)}</td>
                </tr>
              );
            })}
            {(() => {
              const pagadasTotal = facturas.filter((f) => f.estado === "pagada").reduce((s, f) => s + Number(f.monto || 0), 0);
              const ingresosTotal = movimientos.filter((m) => m.tipo === "otro_ingreso").reduce((s, m) => s + Number(m.monto || 0), 0);
              const gastosTotal = movimientos.filter((m) => m.tipo === "gasto").reduce((s, m) => s + Number(m.monto || 0), 0);
              return (
                <tr style={{ borderTop: `1px solid ${COLORS.border}`, backgroundColor: COLORS.panel2 }}>
                  <td className="px-4 py-2 font-sans font-semibold" style={{ color: COLORS.text }}>Saldo Final</td>
                  <td className="text-right px-4 py-2 font-semibold">{money(pagadasTotal)}</td>
                  <td className="text-right px-4 py-2 font-semibold" style={{ color: COLORS.active }}>{money(ingresosTotal)}</td>
                  <td className="text-right px-4 py-2 font-semibold" style={{ color: COLORS.danger }}>{money(gastosTotal)}</td>
                  <td className="text-right px-4 py-2 font-semibold" style={{ color: COLORS.accent }}>{money(pagadasTotal + ingresosTotal - gastosTotal)}</td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>

      <h2 className="font-display text-sm font-semibold mb-3" style={{ color: COLORS.dim }}>HISTORIAL MENSUAL (AÑOS ANTERIORES)</h2>
      <p className="text-xs mb-3" style={{ color: COLORS.dim }}>
        Escribe aquí los totales que ya tienes calculados en WispHub para meses que no vas a re-facturar en esta app.
      </p>
      <HistorialMensualTabla
        historialMensual={historialMensual}
        onGuardar={onGuardarHistorialMes}
        onEliminar={onEliminarHistorialMes}
      />

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="font-display text-sm font-semibold mb-3" style={{ color: COLORS.dim }}>INGRESOS POR PLAN</h2>
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${COLORS.border}` }}>
            {ingresosPorPlan.length === 0 ? (
              <div className="p-6 text-sm text-center" style={{ color: COLORS.dim, backgroundColor: COLORS.panel }}>Sin datos.</div>
            ) : (
              ingresosPorPlan.map((p) => (
                <div key={p.nombre} className="flex items-center justify-between px-4 py-3 text-sm" style={{ backgroundColor: COLORS.panel, borderTop: `1px solid ${COLORS.border}` }}>
                  <span>{p.nombre}</span>
                  <span className="font-mono" style={{ color: COLORS.dim }}>{money(p.total)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h2 className="font-display text-sm font-semibold mb-3" style={{ color: COLORS.dim }}>TOP 5 CLIENTES</h2>
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${COLORS.border}` }}>
            {topClientes.length === 0 ? (
              <div className="p-6 text-sm text-center" style={{ color: COLORS.dim, backgroundColor: COLORS.panel }}>Sin datos.</div>
            ) : (
              topClientes.map((c) => (
                <div key={c.cliente} className="flex items-center justify-between px-4 py-3 text-sm" style={{ backgroundColor: COLORS.panel, borderTop: `1px solid ${COLORS.border}` }}>
                  <span>{c.cliente}</span>
                  <span className="font-mono" style={{ color: COLORS.dim }}>{money(c.total)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MapaTab({ clientes, planById, onImportar }) {
  const conUbicacion = clientes.filter((c) => c.lat && c.lng);
  const center =
    conUbicacion.length > 0
      ? [conUbicacion[0].lat, conUbicacion[0].lng]
      : DEFAULT_CENTER;
  const colorByEstado = { activo: COLORS.active, moroso: COLORS.danger, suspendido: COLORS.dim };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-xl md:text-2xl font-semibold">Mapa de cobertura</h1>
        <Button variant="ghost" onClick={onImportar}><Upload size={16} /> Importar ubicaciones</Button>
      </div>
      <p className="text-sm mb-4" style={{ color: COLORS.dim }}>
        {conUbicacion.length} de {clientes.length} clientes con ubicación registrada.
      </p>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${COLORS.border}`, height: "60vh" }}>
        <MapContainer center={center} zoom={conUbicacion.length > 0 ? 13 : 12} style={{ width: "100%", height: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {conUbicacion.map((c) => {
            const plan = planById(c.plan_id);
            return (
              <Marker key={c.id} position={[c.lat, c.lng]} icon={markerIcon(colorByEstado[c.estado] || COLORS.accent)}>
                <Popup>
                  <b>{c.nombre}</b>
                  <br />
                  {plan ? plan.nombre : "Sin plan"} · {c.estado}
                  <br />
                  {c.direccion}
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
      {conUbicacion.length === 0 && (
        <p className="text-xs mt-3" style={{ color: COLORS.dim }}>
          Aún no tienes clientes con ubicación. Edita un cliente y marca su punto en el mapa.
        </p>
      )}
    </div>
  );
}

function LocationPicker({ lat, lng, onChange }) {
  const [busy, setBusy] = useState(false);
  const position = lat && lng ? [lat, lng] : DEFAULT_CENTER;

  function ClickCatcher() {
    useMapEvents({
      click(e) {
        onChange(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  }

  const useMyLocation = () => {
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(pos.coords.latitude, pos.coords.longitude);
        setBusy(false);
      },
      () => setBusy(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="block text-xs" style={{ color: COLORS.dim }}>Ubicación (toca el mapa para marcar)</span>
        <button
          type="button"
          onClick={useMyLocation}
          className="inline-flex items-center gap-1 text-xs"
          style={{ color: COLORS.accent }}
        >
          <Navigation size={12} /> {busy ? "Buscando…" : "Usar mi ubicación"}
        </button>
      </div>
      <div className="rounded-lg overflow-hidden" style={{ height: 180, border: `1px solid ${COLORS.border}` }}>
        <MapContainer center={position} zoom={lat && lng ? 15 : 12} style={{ width: "100%", height: "100%" }}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ClickCatcher />
          {lat && lng && <Marker position={[lat, lng]} icon={markerIcon(COLORS.accent)} />}
        </MapContainer>
      </div>
    </div>
  );
}

function ProrrogaForm({ factura, onCancel, onSave }) {
  const hoyMas = (dias) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return fmtISO(d);
  };
  const [fecha, setFecha] = useState(factura.prorroga_hasta || hoyMas(3));

  return (
    <Modal title="Dar prórroga" onClose={onCancel}>
      <p className="text-xs mb-4" style={{ color: COLORS.dim }}>
        Elige hasta qué fecha le das margen a este cliente antes de considerarlo vencido. No afecta a los demás clientes ni cambia las reglas generales.
      </p>
      <div className="flex gap-2 mb-4">
        {[3, 5, 7].map((dias) => (
          <button
            key={dias}
            type="button"
            onClick={() => setFecha(hoyMas(dias))}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ backgroundColor: COLORS.panel2, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          >
            +{dias} días
          </button>
        ))}
      </div>
      <Field label="Prórroga hasta">
        <input type="date" style={inputStyle} value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button onClick={() => fecha && onSave(fecha)}>Guardar prórroga</Button>
      </div>
    </Modal>
  );
}

const CAMPOS_IMPORTABLES = [
  { key: "nombre", label: "Nombre", requerido: true },
  { key: "telefono", label: "Teléfono" },
  { key: "direccion", label: "Dirección" },
  { key: "estado", label: "Estado (Activo/Suspendido/Cancelado)" },
  { key: "ciclo", label: "Ciclo (columna que diga 15 o 30, ej. 'Router')" },
  { key: "plan", label: "Nombre del plan" },
  { key: "plan_precio", label: "Precio del plan (para crearlo si no existe)" },
  { key: "pppoe_usuario", label: "Usuario PPPoE / Servicio" },
  { key: "pppoe_secret", label: "Secret PPPoE" },
  { key: "ip_asignada", label: "IP asignada" },
  { key: "equipo", label: "Equipo / router" },
  { key: "cedula", label: "Cédula" },
  { key: "fecha_instalacion", label: "Fecha de instalación" },
];

function ImportForm({ planes, onCancel, onEnsurePlanes, onImport }) {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [filasConError, setFilasConError] = useState(0);
  const [importando, setImportando] = useState(false);

  const procesarResultados = (results) => {
    const cols = (results.meta.fields || []).filter((h) => h && h.trim() !== "");
    setHeaders(cols);
    setRows(results.data);
    const erroresDetectados = (results.errors || []).length;
    setFilasConError(erroresDetectados);
    const auto = {};
    const usadas = new Set();
    CAMPOS_IMPORTABLES.forEach((c) => {
      const match = cols.find((h) => !usadas.has(h) && (h.toLowerCase().includes(c.key.replace("_", "")) || h.toLowerCase().includes(c.label.toLowerCase().split(" ")[0])));
      if (match) {
        auto[c.key] = match;
        usadas.add(match);
      }
    });
    setMapping(auto);
  };

  const intentarParseo = (file, delimitadores) => {
    const [actual, ...resto] = delimitadores;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: actual,
      complete: (results) => {
        const cols = (results.meta.fields || []).filter((h) => h && h.trim() !== "");
        if (cols.length <= 1 && resto.length > 0) {
          intentarParseo(file, resto);
        } else {
          procesarResultados(results);
        }
      },
      error: () => setError("No se pudo leer el archivo. Verifica que sea un CSV válido."),
    });
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    const esExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (esExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const wb = XLSX.read(evt.target.result, { type: "array" });
          const hoja = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(hoja, { defval: "" });
          const primeraFila = XLSX.utils.sheet_to_json(hoja, { header: 1 })[0] || [];
          const cols = primeraFila.map(String).filter((h) => h && h.trim() !== "");
          procesarResultados({ meta: { fields: cols }, data });
        } catch (err) {
          setError("No se pudo leer el archivo de Excel. Verifica que no esté dañado.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      intentarParseo(file, [",", "\t", ";"]);
    }
  };

  const confirmar = async () => {
    if (!mapping.nombre) {
      setError("Debes indicar cuál columna es el nombre del cliente.");
      return;
    }
    setImportando(true);
    setError("");
    try {
      const filas = rows.map((r) => {
        const obj = {};
        CAMPOS_IMPORTABLES.forEach((c) => {
          const header = mapping[c.key];
          obj[c.key] = header ? String(r[header] ?? "").trim() : "";
        });
        return obj;
      }).filter((f) => f.nombre && f.nombre.length < 150);

      const unicos = [];
      const vistos = new Set();
      filas.forEach((f) => {
        const clave = (f.plan || "").toLowerCase().trim();
        if (f.plan && f.plan.length < 100 && !vistos.has(clave)) {
          vistos.add(clave);
          unicos.push({ nombre: f.plan, precio: parseFloat(f.plan_precio) || 0 });
        }
      });

      const planesActualizados = unicos.length > 0 ? await onEnsurePlanes(unicos) : planes;
      await onImport(filas, planesActualizados);
    } catch (err) {
      setError("Ocurrió un error al importar: " + (err.message || "revisa la consola del navegador."));
    } finally {
      setImportando(false);
    }
  };

  return (
    <Modal title="Importar clientes desde Excel o CSV" onClose={onCancel}>
      {headers.length === 0 ? (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>
            Exporta tus clientes desde WispHub (u otro sistema) como Excel (.xlsx) o CSV, y súbelo aquí.
          </p>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ color: COLORS.text, fontSize: 13 }} />
          {error && <p className="text-xs mt-3" style={{ color: COLORS.danger }}>{error}</p>}
        </div>
      ) : (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>
            {fileName} · {rows.length} filas detectadas. Indica qué columna corresponde a cada dato (deja "No usar" si no aplica).
          </p>
          {filasConError > 0 && (
            <div className="rounded-lg px-3 py-2 mb-3 text-xs" style={{ backgroundColor: COLORS.warn + "1A", color: COLORS.warn, border: `1px solid ${COLORS.warn}40` }}>
              {filasConError} fila(s) tienen un formato irregular (probablemente una comilla o carácter especial suelto) y se omitirán al importar.
            </div>
          )}
          <div className="rounded-lg p-2 mb-3 overflow-x-auto" style={{ backgroundColor: COLORS.panel2, border: `1px solid ${COLORS.border}` }}>
            <p className="text-xs mb-1" style={{ color: COLORS.dim }}>Vista previa (primeras 2 filas):</p>
            {rows.slice(0, 2).map((r, i) => (
              <div key={i} className="text-xs mb-1 font-mono" style={{ color: COLORS.text, whiteSpace: "nowrap" }}>
                {headers.slice(0, 4).map((h) => `${h}: ${(r[h] || "").slice(0, 20)}`).join(" | ")}
              </div>
            ))}
          </div>
          <div className="max-h-80 overflow-y-auto pr-1">
            {CAMPOS_IMPORTABLES.map((c) => (
              <Field key={c.key} label={c.label + (c.requerido ? " *" : "")}>
                <select
                  style={inputStyle}
                  value={mapping[c.key] || ""}
                  onChange={(e) => setMapping({ ...mapping, [c.key]: e.target.value })}
                >
                  <option value="">No usar</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {error && <p className="text-xs mb-2" style={{ color: COLORS.danger }}>{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
            <Button onClick={confirmar} disabled={importando}>
              {importando ? "Importando…" : `Importar ${rows.length} clientes`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const CAMPOS_FACTURAS = [
  { key: "cliente", label: "Cliente (debe coincidir con el Nombre exacto)", requerido: true },
  { key: "fecha_emision", label: "Fecha de emisión" },
  { key: "fecha_vencimiento", label: "Fecha de vencimiento" },
  { key: "estado", label: "Estado (Pendiente de pago / Pagada)" },
  { key: "tipo", label: "Tipo (Internet / Otros Ingresos)" },
  { key: "monto", label: "Total", requerido: true },
];

const CAMPOS_PAGOS = [
  { key: "cliente", label: "Cliente (debe coincidir con el Nombre exacto)", requerido: true },
  { key: "numero", label: "#Factura (para saber cuál es la más reciente)", requerido: true },
  { key: "estado", label: "Estado (Pagada / Pendiente de pago)", requerido: true },
  { key: "forma_pago", label: "Forma de Pago" },
];

const CAMPOS_UBICACION = [
  { key: "cliente", label: "Cliente (debe coincidir con el Nombre exacto)", requerido: true },
  { key: "coordenadas", label: "Coordenadas combinadas (ej. 19.43,-70.75)" },
  { key: "lat", label: "Latitud (si viene en columna aparte)" },
  { key: "lng", label: "Longitud (si viene en columna aparte)" },
];

const CAMPOS_TELEFONOS = [
  { key: "cliente", label: "Cliente (debe coincidir con el Nombre exacto)", requerido: true },
  { key: "telefono", label: "Teléfono", requerido: true },
];

function ImportTelefonosForm({ onCancel, onImport }) {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [importando, setImportando] = useState(false);

  const procesarResultados = (results) => {
    const cols = (results.meta.fields || []).filter((h) => h && h.trim() !== "");
    setHeaders(cols);
    setRows(results.data);
    const auto = {};
    CAMPOS_TELEFONOS.forEach((c) => {
      const match = cols.find((h) => h.toLowerCase().includes(c.key));
      if (match) auto[c.key] = match;
    });
    setMapping(auto);
  };

  const intentarParseo = (file, delimitadores) => {
    const [actual, ...resto] = delimitadores;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: actual,
      complete: (results) => {
        const cols = (results.meta.fields || []).filter((h) => h && h.trim() !== "");
        if (cols.length <= 1 && resto.length > 0) intentarParseo(file, resto);
        else procesarResultados(results);
      },
      error: () => setError("No se pudo leer el archivo."),
    });
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    const esExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (esExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const wb = XLSX.read(evt.target.result, { type: "array" });
          const hoja = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(hoja, { defval: "" });
          const primeraFila = XLSX.utils.sheet_to_json(hoja, { header: 1 })[0] || [];
          const cols = primeraFila.map(String).filter((h) => h && h.trim() !== "");
          procesarResultados({ meta: { fields: cols }, data });
        } catch (err) {
          setError("No se pudo leer el archivo de Excel.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      intentarParseo(file, [",", "\t", ";"]);
    }
  };

  const confirmar = async () => {
    if (!mapping.cliente || !mapping.telefono) {
      setError("Debes indicar el cliente y el teléfono.");
      return;
    }
    setImportando(true);
    setError("");
    try {
      const filas = rows.map((r) => ({
        cliente: mapping.cliente ? String(r[mapping.cliente] ?? "").trim() : "",
        telefono: mapping.telefono ? String(r[mapping.telefono] ?? "").trim() : "",
      })).filter((f) => f.cliente && f.telefono);
      await onImport(filas);
    } catch (err) {
      setError("Ocurrió un error: " + (err.message || ""));
    } finally {
      setImportando(false);
    }
  };

  return (
    <Modal title="Sincronizar teléfonos" onClose={onCancel}>
      {headers.length === 0 ? (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>
            Sube el archivo de facturas o pagos de WispHub (trae teléfonos), y aquí actualizamos solo ese dato para cada cliente que ya tienes.
          </p>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ color: COLORS.text, fontSize: 13 }} />
          {error && <p className="text-xs mt-3" style={{ color: COLORS.danger }}>{error}</p>}
        </div>
      ) : (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>{fileName} · {rows.length} filas detectadas.</p>
          <div className="max-h-72 overflow-y-auto pr-1">
            {CAMPOS_TELEFONOS.map((c) => (
              <Field key={c.key} label={c.label + (c.requerido ? " *" : "")}>
                <select style={inputStyle} value={mapping[c.key] || ""} onChange={(e) => setMapping({ ...mapping, [c.key]: e.target.value })}>
                  <option value="">No usar</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {error && <p className="text-xs mb-2" style={{ color: COLORS.danger }}>{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
            <Button onClick={confirmar} disabled={importando}>
              {importando ? "Sincronizando…" : `Sincronizar ${rows.length} filas`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const CAMPOS_PLANES = [
  { key: "cliente", label: "Cliente (debe coincidir con el Nombre exacto)", requerido: true },
  { key: "plan", label: "Plan real (ej. Plan Internet)", requerido: true },
  { key: "plan_precio", label: "Precio del plan (para crearlo si no existe)" },
];

function ImportPlanesForm({ onCancel, onImport }) {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [importando, setImportando] = useState(false);

  const procesarResultados = (results) => {
    const cols = (results.meta.fields || []).filter((h) => h && h.trim() !== "");
    setHeaders(cols);
    setRows(results.data);
    const auto = {};
    CAMPOS_PLANES.forEach((c) => {
      const match = cols.find((h) => h.toLowerCase().includes(c.key.replace("_", "")));
      if (match) auto[c.key] = match;
    });
    if (!auto.cliente) {
      const posibleNombre = cols.find((h) => h.toLowerCase().includes("nombre"));
      if (posibleNombre) auto.cliente = posibleNombre;
    }
    setMapping(auto);
  };

  const intentarParseo = (file, delimitadores) => {
    const [actual, ...resto] = delimitadores;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: actual,
      complete: (results) => {
        const cols = (results.meta.fields || []).filter((h) => h && h.trim() !== "");
        if (cols.length <= 1 && resto.length > 0) intentarParseo(file, resto);
        else procesarResultados(results);
      },
      error: () => setError("No se pudo leer el archivo."),
    });
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    const esExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (esExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const wb = XLSX.read(evt.target.result, { type: "array" });
          const hoja = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(hoja, { defval: "" });
          const primeraFila = XLSX.utils.sheet_to_json(hoja, { header: 1 })[0] || [];
          const cols = primeraFila.map(String).filter((h) => h && h.trim() !== "");
          procesarResultados({ meta: { fields: cols }, data });
        } catch (err) {
          setError("No se pudo leer el archivo de Excel.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      intentarParseo(file, [",", "\t", ";"]);
    }
  };

  const confirmar = async () => {
    if (!mapping.cliente || !mapping.plan) {
      setError("Debes indicar el cliente y el plan.");
      return;
    }
    setImportando(true);
    setError("");
    try {
      const filas = rows.map((r) => ({
        cliente: mapping.cliente ? String(r[mapping.cliente] ?? "").trim() : "",
        plan: mapping.plan ? String(r[mapping.plan] ?? "").trim() : "",
        plan_precio: mapping.plan_precio ? String(r[mapping.plan_precio] ?? "").trim() : "",
      })).filter((f) => f.cliente && f.plan);
      await onImport(filas);
    } catch (err) {
      setError("Ocurrió un error: " + (err.message || ""));
    } finally {
      setImportando(false);
    }
  };

  return (
    <Modal title="Sincronizar planes" onClose={onCancel}>
      {headers.length === 0 ? (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>
            Sube el archivo de WispHub que tenga el Nombre del cliente y su Plan real en columnas separadas. Esto corrige el plan de cada cliente que ya tienes — no crea clientes nuevos.
          </p>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ color: COLORS.text, fontSize: 13 }} />
          {error && <p className="text-xs mt-3" style={{ color: COLORS.danger }}>{error}</p>}
        </div>
      ) : (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>{fileName} · {rows.length} filas detectadas.</p>
          <div className="max-h-72 overflow-y-auto pr-1">
            {CAMPOS_PLANES.map((c) => (
              <Field key={c.key} label={c.label + (c.requerido ? " *" : "")}>
                <select style={inputStyle} value={mapping[c.key] || ""} onChange={(e) => setMapping({ ...mapping, [c.key]: e.target.value })}>
                  <option value="">No usar</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {error && <p className="text-xs mb-2" style={{ color: COLORS.danger }}>{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
            <Button onClick={confirmar} disabled={importando}>
              {importando ? "Sincronizando…" : `Sincronizar ${rows.length} filas`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ImportUbicacionForm({ onCancel, onImport }) {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [importando, setImportando] = useState(false);

  const procesarResultados = (results) => {
    const cols = (results.meta.fields || []).filter((h) => h && h.trim() !== "");
    setHeaders(cols);
    setRows(results.data);
    const auto = {};
    CAMPOS_UBICACION.forEach((c) => {
      const match = cols.find((h) => h.toLowerCase().includes(c.key));
      if (match) auto[c.key] = match;
    });
    setMapping(auto);
  };

  const intentarParseo = (file, delimitadores) => {
    const [actual, ...resto] = delimitadores;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: actual,
      complete: (results) => {
        const cols = (results.meta.fields || []).filter((h) => h && h.trim() !== "");
        if (cols.length <= 1 && resto.length > 0) intentarParseo(file, resto);
        else procesarResultados(results);
      },
      error: () => setError("No se pudo leer el archivo."),
    });
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    const esExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (esExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const wb = XLSX.read(evt.target.result, { type: "array" });
          const hoja = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(hoja, { defval: "" });
          const primeraFila = XLSX.utils.sheet_to_json(hoja, { header: 1 })[0] || [];
          const cols = primeraFila.map(String).filter((h) => h && h.trim() !== "");
          procesarResultados({ meta: { fields: cols }, data });
        } catch (err) {
          setError("No se pudo leer el archivo de Excel.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      intentarParseo(file, [",", "\t", ";"]);
    }
  };

  const confirmar = async () => {
    if (!mapping.cliente || (!mapping.coordenadas && (!mapping.lat || !mapping.lng))) {
      setError("Debes indicar el cliente, y las coordenadas (combinadas o lat/lng por separado).");
      return;
    }
    setImportando(true);
    setError("");
    try {
      const filas = rows.map((r) => {
        let lat = "", lng = "";
        if (mapping.coordenadas) {
          const combo = String(r[mapping.coordenadas] ?? "").trim();
          const partes = combo.split(",").map((p) => p.trim());
          if (partes.length === 2) { lat = partes[0]; lng = partes[1]; }
        } else {
          lat = mapping.lat ? String(r[mapping.lat] ?? "").trim() : "";
          lng = mapping.lng ? String(r[mapping.lng] ?? "").trim() : "";
        }
        return { cliente: mapping.cliente ? String(r[mapping.cliente] ?? "").trim() : "", lat, lng };
      }).filter((f) => f.cliente && f.lat && f.lng);
      await onImport(filas);
    } catch (err) {
      setError("Ocurrió un error: " + (err.message || ""));
    } finally {
      setImportando(false);
    }
  };

  return (
    <Modal title="Importar ubicaciones" onClose={onCancel}>
      {headers.length === 0 ? (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>
            Sube el archivo de WispHub con las coordenadas GPS de cada cliente (Excel o CSV).
          </p>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ color: COLORS.text, fontSize: 13 }} />
          {error && <p className="text-xs mt-3" style={{ color: COLORS.danger }}>{error}</p>}
        </div>
      ) : (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>{fileName} · {rows.length} filas detectadas.</p>
          <div className="max-h-72 overflow-y-auto pr-1">
            {CAMPOS_UBICACION.map((c) => (
              <Field key={c.key} label={c.label + (c.requerido ? " *" : "")}>
                <select style={inputStyle} value={mapping[c.key] || ""} onChange={(e) => setMapping({ ...mapping, [c.key]: e.target.value })}>
                  <option value="">No usar</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {error && <p className="text-xs mb-2" style={{ color: COLORS.danger }}>{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
            <Button onClick={confirmar} disabled={importando}>
              {importando ? "Importando…" : `Importar ${rows.length} ubicaciones`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const CAMPOS_HISTORIAL_INGRESOS = [
  { key: "cliente", label: "Cliente (debe coincidir con el Nombre exacto)", requerido: true },
  { key: "fecha", label: "Fecha de pago", requerido: true },
  { key: "estado", label: "Estado (para filtrar solo las Pagadas)", requerido: true },
  { key: "monto", label: "Total / Total Cobrado", requerido: true },
  { key: "forma_pago", label: "Forma de Pago" },
];

function ImportHistorialIngresosForm({ onCancel, onImport }) {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [importando, setImportando] = useState(false);

  const procesarResultados = (results) => {
    const cols = (results.meta.fields || []).filter((h) => h && h.trim() !== "");
    setHeaders(cols);
    setRows(results.data);
    const auto = {};
    CAMPOS_HISTORIAL_INGRESOS.forEach((c) => {
      const match = cols.find((h) => h.toLowerCase().includes(c.key.split("_")[0]));
      if (match) auto[c.key] = match;
    });
    setMapping(auto);
  };

  const intentarParseo = (file, delimitadores) => {
    const [actual, ...resto] = delimitadores;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: actual,
      complete: (results) => {
        const cols = (results.meta.fields || []).filter((h) => h && h.trim() !== "");
        if (cols.length <= 1 && resto.length > 0) intentarParseo(file, resto);
        else procesarResultados(results);
      },
      error: () => setError("No se pudo leer el archivo."),
    });
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    const esExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (esExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const wb = XLSX.read(evt.target.result, { type: "array" });
          const hoja = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(hoja, { defval: "" });
          const primeraFila = XLSX.utils.sheet_to_json(hoja, { header: 1 })[0] || [];
          const cols = primeraFila.map(String).filter((h) => h && h.trim() !== "");
          procesarResultados({ meta: { fields: cols }, data });
        } catch (err) {
          setError("No se pudo leer el archivo de Excel.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      intentarParseo(file, [",", "\t", ";"]);
    }
  };

  const confirmar = async () => {
    if (!mapping.cliente || !mapping.fecha || !mapping.estado || !mapping.monto) {
      setError("Debes indicar cliente, fecha, estado y monto.");
      return;
    }
    setImportando(true);
    setError("");
    try {
      const filas = rows.map((r) => ({
        cliente: mapping.cliente ? String(r[mapping.cliente] ?? "").trim() : "",
        fecha: mapping.fecha ? String(r[mapping.fecha] ?? "").trim() : "",
        estado: mapping.estado ? String(r[mapping.estado] ?? "").trim() : "",
        monto: mapping.monto ? String(r[mapping.monto] ?? "").trim() : "",
        forma_pago: mapping.forma_pago ? String(r[mapping.forma_pago] ?? "").trim() : "",
      })).filter((f) => f.cliente && (f.estado || "").toLowerCase().includes("pagad"));
      await onImport(filas);
    } catch (err) {
      setError("Ocurrió un error: " + (err.message || ""));
    } finally {
      setImportando(false);
    }
  };

  return (
    <Modal title="Importar historial de ingresos" onClose={onCancel}>
      {headers.length === 0 ? (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>
            Sube el archivo completo de pagos de WispHub (el mismo de "Reconciliar pagos" sirve). Solo se importan las filas marcadas como "Pagada" — el resto se ignora.
          </p>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ color: COLORS.text, fontSize: 13 }} />
          {error && <p className="text-xs mt-3" style={{ color: COLORS.danger }}>{error}</p>}
        </div>
      ) : (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>{fileName} · {rows.length} filas detectadas.</p>
          <div className="max-h-72 overflow-y-auto pr-1">
            {CAMPOS_HISTORIAL_INGRESOS.map((c) => (
              <Field key={c.key} label={c.label + (c.requerido ? " *" : "")}>
                <select style={inputStyle} value={mapping[c.key] || ""} onChange={(e) => setMapping({ ...mapping, [c.key]: e.target.value })}>
                  <option value="">No usar</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {error && <p className="text-xs mb-2" style={{ color: COLORS.danger }}>{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
            <Button onClick={confirmar} disabled={importando}>
              {importando ? "Importando…" : `Importar ${rows.length} filas`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ImportPagosForm({ onCancel, onImport }) {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [importando, setImportando] = useState(false);

  const procesarResultados = (results) => {
    const cols = (results.meta.fields || []).filter((h) => h && h.trim() !== "");
    setHeaders(cols);
    setRows(results.data);
    const auto = {};
    CAMPOS_PAGOS.forEach((c) => {
      const match = cols.find((h) => h.toLowerCase().includes(c.key.split("_")[0]));
      if (match) auto[c.key] = match;
    });
    setMapping(auto);
  };

  const intentarParseo = (file, delimitadores) => {
    const [actual, ...resto] = delimitadores;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: actual,
      complete: (results) => {
        const cols = (results.meta.fields || []).filter((h) => h && h.trim() !== "");
        if (cols.length <= 1 && resto.length > 0) intentarParseo(file, resto);
        else procesarResultados(results);
      },
      error: () => setError("No se pudo leer el archivo."),
    });
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    const esExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (esExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const wb = XLSX.read(evt.target.result, { type: "array" });
          const hoja = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(hoja, { defval: "" });
          const primeraFila = XLSX.utils.sheet_to_json(hoja, { header: 1 })[0] || [];
          const cols = primeraFila.map(String).filter((h) => h && h.trim() !== "");
          procesarResultados({ meta: { fields: cols }, data });
        } catch (err) {
          setError("No se pudo leer el archivo de Excel.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      intentarParseo(file, [",", "\t", ";"]);
    }
  };

  const confirmar = async () => {
    if (!mapping.cliente || !mapping.numero || !mapping.estado) {
      setError("Debes indicar cuál columna es el cliente, el #Factura y el estado.");
      return;
    }
    setImportando(true);
    setError("");
    try {
      const filas = rows.map((r) => ({
        cliente: mapping.cliente ? String(r[mapping.cliente] ?? "").trim() : "",
        numero: mapping.numero ? String(r[mapping.numero] ?? "").trim() : "",
        estado: mapping.estado ? String(r[mapping.estado] ?? "").trim() : "",
        forma_pago: mapping.forma_pago ? String(r[mapping.forma_pago] ?? "").trim() : "",
      })).filter((f) => f.cliente);
      await onImport(filas);
    } catch (err) {
      setError("Ocurrió un error: " + (err.message || ""));
    } finally {
      setImportando(false);
    }
  };

  return (
    <Modal title="Reconciliar pagos" onClose={onCancel}>
      {headers.length === 0 ? (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>
            Sube el reporte completo de facturas (pagadas y pendientes) de WispHub. Se usa el #Factura más alto de cada cliente para saber su estado real más reciente.
          </p>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ color: COLORS.text, fontSize: 13 }} />
          {error && <p className="text-xs mt-3" style={{ color: COLORS.danger }}>{error}</p>}
        </div>
      ) : (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>{fileName} · {rows.length} filas detectadas.</p>
          <div className="max-h-72 overflow-y-auto pr-1">
            {CAMPOS_PAGOS.map((c) => (
              <Field key={c.key} label={c.label + (c.requerido ? " *" : "")}>
                <select style={inputStyle} value={mapping[c.key] || ""} onChange={(e) => setMapping({ ...mapping, [c.key]: e.target.value })}>
                  <option value="">No usar</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {error && <p className="text-xs mb-2" style={{ color: COLORS.danger }}>{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
            <Button onClick={confirmar} disabled={importando}>
              {importando ? "Reconciliando…" : `Reconciliar ${rows.length} filas`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ImportFacturasForm({ onCancel, onImport }) {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [importando, setImportando] = useState(false);

  const procesarResultados = (results) => {
    const cols = (results.meta.fields || []).filter((h) => h && h.trim() !== "");
    setHeaders(cols);
    setRows(results.data);
    const auto = {};
    CAMPOS_FACTURAS.forEach((c) => {
      const match = cols.find((h) => h.toLowerCase().includes(c.key.split("_")[0]));
      if (match) auto[c.key] = match;
    });
    setMapping(auto);
  };

  const intentarParseo = (file, delimitadores) => {
    const [actual, ...resto] = delimitadores;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: actual,
      complete: (results) => {
        const cols = (results.meta.fields || []).filter((h) => h && h.trim() !== "");
        if (cols.length <= 1 && resto.length > 0) intentarParseo(file, resto);
        else procesarResultados(results);
      },
      error: () => setError("No se pudo leer el archivo."),
    });
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    const esExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (esExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const wb = XLSX.read(evt.target.result, { type: "array" });
          const hoja = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(hoja, { defval: "" });
          const primeraFila = XLSX.utils.sheet_to_json(hoja, { header: 1 })[0] || [];
          const cols = primeraFila.map(String).filter((h) => h && h.trim() !== "");
          procesarResultados({ meta: { fields: cols }, data });
        } catch (err) {
          setError("No se pudo leer el archivo de Excel.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      intentarParseo(file, [",", "\t", ";"]);
    }
  };

  const normalizarFecha = (v) => {
    if (!v) return "";
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const f = parseFechaFlexible(s);
    return f || "";
  };

  const confirmar = async () => {
    if (!mapping.cliente || !mapping.monto) {
      setError("Debes indicar cuál columna es el cliente y cuál el monto.");
      return;
    }
    setImportando(true);
    setError("");
    try {
      const filas = rows.map((r) => ({
        cliente: mapping.cliente ? String(r[mapping.cliente] ?? "").trim() : "",
        fecha_emision: mapping.fecha_emision ? normalizarFecha(r[mapping.fecha_emision]) : "",
        fecha_vencimiento: mapping.fecha_vencimiento ? normalizarFecha(r[mapping.fecha_vencimiento]) : "",
        estado: mapping.estado ? String(r[mapping.estado] ?? "").trim() : "",
        tipo: mapping.tipo ? String(r[mapping.tipo] ?? "").trim() : "",
        monto: mapping.monto ? String(r[mapping.monto] ?? "").trim() : "",
      })).filter((f) => f.cliente);
      await onImport(filas);
    } catch (err) {
      setError("Ocurrió un error al importar: " + (err.message || ""));
    } finally {
      setImportando(false);
    }
  };

  return (
    <Modal title="Importar historial de facturas" onClose={onCancel}>
      {headers.length === 0 ? (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>
            Sube el archivo de facturas exportado de WispHub (Excel o CSV). Las filas de tipo "Otros Ingresos" se guardan en Caja en vez de en Facturación.
          </p>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ color: COLORS.text, fontSize: 13 }} />
          {error && <p className="text-xs mt-3" style={{ color: COLORS.danger }}>{error}</p>}
        </div>
      ) : (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>
            {fileName} · {rows.length} filas detectadas.
          </p>
          <div className="max-h-72 overflow-y-auto pr-1">
            {CAMPOS_FACTURAS.map((c) => (
              <Field key={c.key} label={c.label + (c.requerido ? " *" : "")}>
                <select
                  style={inputStyle}
                  value={mapping[c.key] || ""}
                  onChange={(e) => setMapping({ ...mapping, [c.key]: e.target.value })}
                >
                  <option value="">No usar</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {error && <p className="text-xs mb-2" style={{ color: COLORS.danger }}>{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
            <Button onClick={confirmar} disabled={importando}>
              {importando ? "Importando…" : `Importar ${rows.length} facturas`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ConfiguracionTab({ config, onGuardar, session }) {
  const [form, setForm] = useState({
    nombre: config?.nombre || EMPRESA_DEFAULT.nombre,
    direccion: config?.direccion || EMPRESA_DEFAULT.direccion,
    telefono: config?.telefono || EMPRESA_DEFAULT.telefono,
    email: config?.email || EMPRESA_DEFAULT.email,
    logo_url: config?.logo_url || EMPRESA_DEFAULT.logoUrl,
    tamano_recibo: config?.tamano_recibo || "mediano",
    formato_recibo: config?.formato_recibo || "termica",
  });
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const confirmar = async () => {
    setGuardando(true);
    setGuardado(false);
    await onGuardar(form);
    setGuardando(false);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  };

  /* ----- Respaldos ----- */
  const [backups, setBackups] = useState([]);
  const [cargandoBackups, setCargandoBackups] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [errorBackup, setErrorBackup] = useState("");

  const cargarBackups = useCallback(async () => {
    setCargandoBackups(true);
    try {
      const resp = await fetch("/api/backup-list", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "No se pudo cargar la lista de backups.");
      setBackups(data.backups || []);
    } catch (err) {
      setErrorBackup(err.message);
    } finally {
      setCargandoBackups(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  useEffect(() => {
    cargarBackups();
  }, [cargarBackups]);

  const generarBackup = async () => {
    setGenerando(true);
    setErrorBackup("");
    try {
      const resp = await fetch("/api/backup-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken: session?.access_token }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "No se pudo generar el backup.");
      await cargarBackups();
    } catch (err) {
      setErrorBackup(err.message);
    } finally {
      setGenerando(false);
    }
  };

  const formatoTamano = (bytes) => {
    if (!bytes) return "—";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(0)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };
  const formatoFecha = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <div>
      <h1 className="font-display text-xl md:text-2xl font-semibold mb-1">Configuración</h1>
      <p className="text-sm mb-6" style={{ color: COLORS.dim }}>
        Estos datos se usan en los recibos y en el resto de la app.
      </p>
      <div className="rounded-xl p-4 mb-6" style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
        <h2 className="font-display text-sm font-semibold mb-3" style={{ color: COLORS.dim }}>DATOS DE LA EMPRESA</h2>
        <Field label="Nombre de la empresa">
          <input style={inputStyle} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        </Field>
        <Field label="Dirección">
          <input style={inputStyle} value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
        </Field>
        <Field label="Teléfono">
          <input style={inputStyle} value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
        </Field>
        <Field label="Correo">
          <input style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Ruta o URL del logo (ej. /logo.png)">
          <input style={inputStyle} value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} />
        </Field>
        <p className="text-xs" style={{ color: COLORS.dim }}>
          El archivo del logo debe seguir subido en tu repositorio (carpeta <code>public</code>); aquí solo cambias la ruta o el nombre del archivo que usa la app.
        </p>
      </div>
      <div className="rounded-xl p-4 mb-6" style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
        <h2 className="font-display text-sm font-semibold mb-3" style={{ color: COLORS.dim }}>RECIBO</h2>
        <Field label="Tamaño de letra">
          <select style={inputStyle} value={form.tamano_recibo} onChange={(e) => setForm({ ...form, tamano_recibo: e.target.value })}>
            <option value="chico">Chico</option>
            <option value="mediano">Mediano</option>
            <option value="grande">Grande</option>
          </select>
        </Field>
        <Field label="Formato que abre por defecto">
          <select style={inputStyle} value={form.formato_recibo} onChange={(e) => setForm({ ...form, formato_recibo: e.target.value })}>
            <option value="termica">Ticket térmico</option>
            <option value="carta">Hoja / PDF</option>
          </select>
        </Field>
      </div>

      <div className="rounded-xl p-4 mb-6" style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-sm font-semibold" style={{ color: COLORS.dim }}>RESPALDOS</h2>
          <Button variant="ghost" onClick={generarBackup} disabled={generando}>
            {generando ? "Generando…" : "Generar backup ahora"}
          </Button>
        </div>
        <p className="text-xs mb-3" style={{ color: COLORS.dim }}>
          Todos los días se genera un respaldo automático de clientes, planes, facturas, caja y configuración.
          Se conservan los últimos 30 días. Puedes generar uno extra antes de una importación grande.
        </p>
        {errorBackup && (
          <div
            className="mb-3 rounded-lg px-3 py-2 text-xs"
            style={{ backgroundColor: COLORS.danger + "1A", color: COLORS.danger, border: `1px solid ${COLORS.danger}40` }}
          >
            {errorBackup}
          </div>
        )}
        {cargandoBackups ? (
          <p className="text-xs" style={{ color: COLORS.dim }}>Cargando…</p>
        ) : backups.length === 0 ? (
          <p className="text-xs" style={{ color: COLORS.dim }}>Todavía no hay backups generados.</p>
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${COLORS.border}` }}>
            {backups.map((b) => (
              <div
                key={b.nombre}
                className="flex items-center justify-between px-3 py-2 text-xs"
                style={{ borderTop: `1px solid ${COLORS.border}` }}
              >
                <div>
                  <div style={{ color: COLORS.text }}>{formatoFecha(b.creado)}</div>
                  <div style={{ color: COLORS.dim }}>{formatoTamano(b.tamano)}</div>
                </div>
                {b.url ? (
                  <a
                    href={b.url}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 font-medium"
                    style={{ color: COLORS.accent, border: `1px solid ${COLORS.accent}40`, backgroundColor: COLORS.accent + "1A" }}
                  >
                    <Download size={13} /> Descargar
                  </a>
                ) : (
                  <span style={{ color: COLORS.dim }}>Enlace no disponible</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={confirmar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</Button>
        {guardado && <span className="text-xs" style={{ color: COLORS.active }}>Guardado ✓</span>}
      </div>
    </div>
  );
}

function ClientForm({ initial, planes, onCancel, onSave }) {
  const [form, setForm] = useState({
    id: initial.id,
    nombre: initial.nombre || "",
    telefono: initial.telefono || "",
    direccion: initial.direccion || "",
    planId: initial.planId || (planes[0] && planes[0].id) || "",
    estado: initial.estado || "activo",
    lat: initial.lat || null,
    lng: initial.lng || null,
    ciclo: initial.ciclo || 15,
    pppoe_usuario: initial.pppoe_usuario || "",
    pppoe_secret: initial.pppoe_secret || "",
    ip_asignada: initial.ip_asignada || "",
    equipo: initial.equipo || "",
    cedula: initial.cedula || "",
    fecha_instalacion: initial.fecha_instalacion || "",
  });
  const [verSecret, setVerSecret] = useState(false);
  const [mostrarTecnico, setMostrarTecnico] = useState(false);
  return (
    <Modal title={initial.id ? "Editar cliente" : "Nuevo cliente"} onClose={onCancel}>
      <Field label="Nombre">
        <input style={inputStyle} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
      </Field>
      <Field label="Teléfono">
        <input style={inputStyle} value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
      </Field>
      <Field label="Dirección">
        <input style={inputStyle} value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
      </Field>
      <Field label="Ciclo de facturación">
        <select style={inputStyle} value={form.ciclo} onChange={(e) => setForm({ ...form, ciclo: e.target.value })}>
          <option value={15}>Corte día 15 (suspensión día 20)</option>
          <option value={30}>Corte fin de mes (suspensión día 5)</option>
        </select>
      </Field>
      <LocationPicker lat={form.lat} lng={form.lng} onChange={(lat, lng) => setForm({ ...form, lat, lng })} />

      <button
        type="button"
        onClick={() => setMostrarTecnico(!mostrarTecnico)}
        className="text-xs mb-3"
        style={{ color: COLORS.accent }}
      >
        {mostrarTecnico ? "Ocultar datos técnicos" : "Mostrar datos técnicos (PPPoE, IP, equipo...)"}
      </button>

      {mostrarTecnico && (
        <div className="rounded-lg p-3 mb-3" style={{ backgroundColor: COLORS.panel2, border: `1px solid ${COLORS.border}` }}>
          <Field label="Cédula">
            <input style={inputStyle} value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} />
          </Field>
          <Field label="Usuario PPPoE">
            <input style={inputStyle} value={form.pppoe_usuario} onChange={(e) => setForm({ ...form, pppoe_usuario: e.target.value })} />
          </Field>
          <Field label="Secret / clave PPPoE">
            <div className="relative">
              <input
                type={verSecret ? "text" : "password"}
                style={{ ...inputStyle, paddingRight: 34 }}
                value={form.pppoe_secret}
                onChange={(e) => setForm({ ...form, pppoe_secret: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setVerSecret(!verSecret)}
                style={{ position: "absolute", right: 8, top: 8, color: COLORS.dim }}
              >
                {verSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          <Field label="IP asignada">
            <input style={inputStyle} value={form.ip_asignada} onChange={(e) => setForm({ ...form, ip_asignada: e.target.value })} />
          </Field>
          <Field label="Equipo / router">
            <input style={inputStyle} value={form.equipo} onChange={(e) => setForm({ ...form, equipo: e.target.value })} />
          </Field>
          <Field label="Fecha de instalación">
            <input type="date" style={inputStyle} value={form.fecha_instalacion} onChange={(e) => setForm({ ...form, fecha_instalacion: e.target.value })} />
          </Field>
        </div>
      )}
      <Field label="Plan">
        <select style={inputStyle} value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
          {planes.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </Field>
      <Field label="Estado">
        <select style={inputStyle} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
          <option value="activo">Activo</option>
          <option value="moroso">Moroso</option>
          <option value="suspendido">Suspendido</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button onClick={() => form.nombre.trim() && onSave(form)}>Guardar</Button>
      </div>
    </Modal>
  );
}

function PlanForm({ initial, onCancel, onSave }) {
  const [form, setForm] = useState({
    id: initial.id,
    nombre: initial.nombre || "",
    velocidad: initial.velocidad || "",
    precio: initial.precio || "",
  });
  return (
    <Modal title={initial.id ? "Editar plan" : "Nuevo plan"} onClose={onCancel}>
      <Field label="Nombre del plan">
        <input style={inputStyle} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
      </Field>
      <Field label="Velocidad">
        <input style={inputStyle} placeholder="Ej. 30 Mbps" value={form.velocidad} onChange={(e) => setForm({ ...form, velocidad: e.target.value })} />
      </Field>
      <Field label="Precio mensual (RD$)">
        <input type="number" style={inputStyle} value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button onClick={() => form.nombre.trim() && onSave(form)}>Guardar</Button>
      </div>
    </Modal>
  );
}

function InvoiceForm({ initial, clientes, planById, onCancel, onSave }) {
  const firstClient = clientes[0];
  const [form, setForm] = useState({
    id: initial.id,
    clienteId: initial.clienteId || (firstClient && firstClient.id) || "",
    periodo: initial.periodo || "",
    monto: initial.monto || (firstClient ? (planById(firstClient.plan_id)?.precio ?? "") : ""),
    fechaVencimiento: initial.fechaVencimiento || "",
    estado: initial.estado || "pendiente",
  });
  return (
    <Modal title={initial.id ? "Editar factura" : "Nueva factura"} onClose={onCancel}>
      <Field label="Cliente">
        <select
          style={inputStyle}
          value={form.clienteId}
          onChange={(e) => {
            const cliente = clientes.find((c) => c.id === e.target.value);
            const plan = cliente ? planById(cliente.plan_id) : null;
            setForm({ ...form, clienteId: e.target.value, monto: plan ? plan.precio : form.monto });
          }}
        >
          {clientes.length === 0 && <option value="">Sin clientes registrados</option>}
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </Field>
      <Field label="Periodo">
        <input style={inputStyle} placeholder="Ej. Julio 2026" value={form.periodo} onChange={(e) => setForm({ ...form, periodo: e.target.value })} />
      </Field>
      <Field label="Monto (RD$)">
        <input type="number" style={inputStyle} value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
      </Field>
      <Field label="Fecha de vencimiento">
        <input type="date" style={inputStyle} value={form.fechaVencimiento} onChange={(e) => setForm({ ...form, fechaVencimiento: e.target.value })} />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button onClick={() => form.clienteId && onSave(form)}>Guardar</Button>
      </div>
    </Modal>
  );
}
