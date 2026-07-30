import React, { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import Papa from "papaparse";
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
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #10151A;box-shadow:0 0 0 2px ${color}55"></div>`,
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
    const vencimiento = new Date(y, m, 15);
    const suspension = new Date(y, m, 20);
    return { generar, vencimiento, suspension, periodo: `${MESES[m]} ${y}` };
  }
  // ciclo 30 (fin de mes)
  const generar = dia >= 25;
  const vencimiento = new Date(y, m, ultimoDiaMes(y, m));
  const suspensionMes = m === 11 ? 0 : m + 1;
  const suspensionAnio = m === 11 ? y + 1 : y;
  const suspension = new Date(suspensionAnio, suspensionMes, 5);
  return { generar, vencimiento, suspension, periodo: `${MESES[m]} ${y}` };
}

// Estado "visual" de una factura: si venció el plazo de gracia y sigue sin pagar, se ve como vencida,
// sin necesidad de cambiar el estado guardado.
function estadoVisual(factura, hoy) {
  if (factura.estado === "pagada") return "pagada";
  if (factura.prorroga_hasta) {
    const limite = new Date(factura.prorroga_hasta + "T23:59:59");
    return hoy > limite ? "vencida" : "pendiente";
  }
  if (!factura.fecha_vencimiento) return factura.estado;
  const venc = new Date(factura.fecha_vencimiento + "T00:00:00");
  const dia = venc.getDate();
  let suspension;
  if (dia === 15) {
    suspension = new Date(venc.getFullYear(), venc.getMonth(), 20);
  } else {
    const sm = venc.getMonth() === 11 ? 0 : venc.getMonth() + 1;
    const sy = venc.getMonth() === 11 ? venc.getFullYear() + 1 : venc.getFullYear();
    suspension = new Date(sy, sm, 5);
  }
  return hoy >= suspension ? "vencida" : "pendiente";
}

function mensajeRecordatorio(cliente, factura) {
  if (factura.prorroga_hasta) {
    return `Hola ${cliente.nombre}, te confirmamos que tu factura de ${factura.periodo || "tu servicio"} por ${money(factura.monto)} tiene plazo hasta el ${factura.prorroga_hasta} antes de la suspensión del servicio. ¡Gracias por tu comprensión!`;
  }
  const venc = factura.fecha_vencimiento ? new Date(factura.fecha_vencimiento + "T00:00:00") : null;
  const dia = venc ? venc.getDate() : null;
  let fechaLimite, fechaSuspension;
  if (dia === 15) {
    fechaLimite = "19";
    fechaSuspension = `la mañana del 20`;
  } else {
    fechaLimite = "4";
    fechaSuspension = `la mañana del 5`;
  }
  return `Hola ${cliente.nombre}, te recordamos que tu factura de ${factura.periodo || "tu servicio"} por ${money(factura.monto)} vence el ${factura.fecha_vencimiento || ""}. Para evitar la suspensión del servicio, te pedimos realizar tu pago antes del día ${fechaLimite} (la suspensión aplicaría ${fechaSuspension}). Recuerda: estar al día antes de esa fecha te hace elegible para nuestro sorteo mensual del día 4 (mes gratis o artículos). No estamos obligados a realizar sorteos — lo hacemos para incentivar el pago a tiempo, ya que así cubrimos a tiempo nuestros compromisos con el servicio. Nuestro compromiso contigo es que el servicio contratado te siga llegando. ¡Gracias por tu preferencia!`;
}

const COLORS = {
  bg: "#10151A",
  panel: "#171D23",
  panel2: "#1D242C",
  border: "#232B33",
  text: "#ECEFF1",
  dim: "#8B98A3",
  active: "#3EBD82",
  warn: "#E0A339",
  danger: "#D9584B",
  accent: "#4E8DF5",
};

const money = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    Number(n) || 0
  );

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
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
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
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "#00000099" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl p-5"
        style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}` }}
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

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError("Correo o contraseña incorrectos.");
    else onLogin(data.session);
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
  const [clientes, setClientes] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [clientModal, setClientModal] = useState(null);
  const [planModal, setPlanModal] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [prorrogaModal, setProrrogaModal] = useState(null);
  const [importModal, setImportModal] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    const [c, p, f] = await Promise.all([
      supabase.from("clientes").select("*").order("nombre"),
      supabase.from("planes").select("*").order("precio"),
      supabase.from("facturas").select("*").order("fecha_vencimiento", { ascending: true }),
    ]);
    if (c.error || p.error || f.error) {
      setErrorMsg((c.error || p.error || f.error).message);
      setLoading(false);
      return;
    }
    await generarFacturasDelCiclo(c.data || [], p.data || [], f.data || []);
    const f2 = await supabase.from("facturas").select("*").order("fecha_vencimiento", { ascending: true });
    setClientes(c.data || []);
    setPlanes(p.data || []);
    setFacturas(f2.data || f.data || []);
    setLoading(false);
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
      const yaExiste = facturasData.some((f) => f.cliente_id === cliente.id && f.fecha_vencimiento === vencISO);
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
    if (session) loadAll();
  }, [session, loadAll]);

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
  const markPaid = async (id) => {
    const { error } = await supabase.from("facturas").update({ estado: "pagada" }).eq("id", id);
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

  const filteredClients = clientes.filter((c) =>
    (c.nombre || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalActivos = clientes.filter((c) => c.estado === "activo").length;
  const totalMorosos = clientes.filter((c) => c.estado === "moroso").length;
  const ingresosMes = facturas
    .filter((f) => f.estado === "pagada")
    .reduce((sum, f) => sum + Number(f.monto || 0), 0);
  const pendientesMonto = facturas
    .filter((f) => f.estado !== "pagada")
    .reduce((sum, f) => sum + Number(f.monto || 0), 0);

  const NAV = [
    { id: "dashboard", label: "Panel", Icon: LayoutDashboard },
    { id: "clientes", label: "Clientes", Icon: Users },
    { id: "planes", label: "Planes", Icon: Wifi },
    { id: "facturacion", label: "Facturación", Icon: FileText },
    { id: "reportes", label: "Reportes", Icon: BarChart3 },
    { id: "mapa", label: "Mapa", Icon: MapPin },
  ];

  return (
    <div
      className="min-h-screen w-full flex flex-col md:flex-row"
      style={{ backgroundColor: COLORS.bg, color: COLORS.text }}
    >
      <nav
        className="md:w-56 w-full flex md:flex-col justify-between md:justify-start order-2 md:order-1 md:h-screen md:sticky md:top-0 px-3 py-3 md:py-5"
        style={{ backgroundColor: COLORS.panel, borderTop: `1px solid ${COLORS.border}`, borderRight: `1px solid ${COLORS.border}` }}
      >
        <div className="hidden md:flex items-center gap-2 px-2 mb-6">
          <SignalHigh size={20} color={COLORS.accent} />
          <span className="font-display font-semibold text-lg">ISP-Control</span>
        </div>
        <div className="flex md:flex-col w-full gap-1 justify-around md:justify-start">
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex md:flex-row flex-col items-center gap-1 md:gap-2 rounded-lg px-3 py-2 text-xs md:text-sm font-medium transition-colors"
              style={{
                backgroundColor: tab === id ? COLORS.accent + "1F" : "transparent",
                color: tab === id ? COLORS.accent : COLORS.dim,
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="hidden md:block text-xs px-2 py-2 mt-4 text-left"
          style={{ color: COLORS.dim }}
        >
          Cerrar sesión
        </button>
      </nav>

      <main className="flex-1 order-1 md:order-2 px-4 md:px-8 py-6 md:py-8 pb-24 md:pb-8">
        {errorMsg && (
          <div
            className="mb-4 rounded-lg px-3 py-2 text-xs"
            style={{ backgroundColor: COLORS.danger + "1A", color: COLORS.danger, border: `1px solid ${COLORS.danger}40` }}
          >
            {errorMsg}
          </div>
        )}

        {tab === "dashboard" && (
          <div>
            <h1 className="font-display text-xl md:text-2xl font-semibold mb-1">Panel general</h1>
            <p className="text-sm mb-6" style={{ color: COLORS.dim }}>
              Estado de tu red de clientes en un vistazo.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              {[
                { label: "Clientes activos", value: totalActivos, color: COLORS.active },
                { label: "Clientes morosos", value: totalMorosos, color: COLORS.danger },
                { label: "Ingresos cobrados", value: money(ingresosMes), color: COLORS.text },
                { label: "Por cobrar", value: money(pendientesMonto), color: COLORS.warn },
              ].map((k) => (
                <div
                  key={k.label}
                  className="rounded-xl p-4"
                  style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}` }}
                >
                  <div className="text-xs mb-2" style={{ color: COLORS.dim }}>
                    {k.label}
                  </div>
                  <div className="font-mono text-xl font-medium" style={{ color: k.color }}>
                    {k.value}
                  </div>
                </div>
              ))}
            </div>

            <h2 className="font-display text-sm font-semibold mb-3" style={{ color: COLORS.dim }}>
              FACTURAS RECIENTES
            </h2>
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${COLORS.border}` }}>
              {facturas.length === 0 ? (
                <div className="p-6 text-sm text-center" style={{ color: COLORS.dim, backgroundColor: COLORS.panel }}>
                  Aún no hay facturas. Créalas desde la pestaña Facturación.
                </div>
              ) : (
                facturas.slice(-5).reverse().map((f) => {
                  const c = clientes.find((c) => c.id === f.cliente_id);
                  return (
                    <div
                      key={f.id}
                      className="flex items-center justify-between px-4 py-3 text-sm"
                      style={{ backgroundColor: COLORS.panel, borderTop: `1px solid ${COLORS.border}` }}
                    >
                      <span>{c ? c.nombre : "Cliente eliminado"}</span>
                      <span className="font-mono" style={{ color: COLORS.dim }}>{money(f.monto)}</span>
                      <FacturaBadge estado={f.estado} />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {tab === "clientes" && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <h1 className="font-display text-xl md:text-2xl font-semibold">Clientes</h1>
                <p className="text-sm" style={{ color: COLORS.dim }}>{clientes.length} registrados</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setImportModal(true)}>
                  <Upload size={16} /> Importar CSV
                </Button>
                <Button onClick={() => setClientModal({})}>
                  <Plus size={16} /> Nuevo cliente
                </Button>
              </div>
            </div>

            <div className="relative mb-4 max-w-xs">
              <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: COLORS.dim }} />
              <input
                style={{ ...inputStyle, paddingLeft: 32 }}
                placeholder="Buscar cliente…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${COLORS.border}` }}>
              {filteredClients.length === 0 ? (
                <div className="p-6 text-sm text-center" style={{ color: COLORS.dim, backgroundColor: COLORS.panel }}>
                  Sin resultados.
                </div>
              ) : (
                filteredClients.map((c) => {
                  const plan = planById(c.plan_id);
                  return (
                    <div
                      key={c.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3"
                      style={{ backgroundColor: COLORS.panel, borderTop: `1px solid ${COLORS.border}` }}
                    >
                      <div>
                        <div className="text-sm font-medium">{c.nombre}</div>
                        <div className="text-xs" style={{ color: COLORS.dim }}>
                          {c.telefono} · {c.direccion} · {plan ? plan.nombre : "Sin plan"} · Corte {c.ciclo === 30 ? "fin de mes" : "día 15"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <EstadoBadge estado={c.estado} />
                        <CicloBadge ciclo={c.ciclo} />
                        <button
                          onClick={() =>
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
                            })
                          }
                          style={{ color: COLORS.dim }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => deleteClient(c.id)} style={{ color: COLORS.dim }}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {tab === "planes" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h1 className="font-display text-xl md:text-2xl font-semibold">Planes</h1>
              <Button onClick={() => setPlanModal({})}>
                <Plus size={16} /> Nuevo plan
              </Button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {planes.map((p) => (
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
                      <button onClick={() => deletePlan(p.id)} style={{ color: COLORS.dim }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="text-sm font-medium mb-1">{p.nombre}</div>
                  <div className="text-xs mb-2" style={{ color: COLORS.dim }}>{p.velocidad}</div>
                  <div className="font-mono text-lg" style={{ color: COLORS.text }}>{money(p.precio)}<span className="text-xs" style={{ color: COLORS.dim }}>/mes</span></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "facturacion" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h1 className="font-display text-xl md:text-2xl font-semibold">Facturación</h1>
              <Button onClick={() => setInvoiceModal({})}>
                <Plus size={16} /> Nueva factura
              </Button>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${COLORS.border}` }}>
              {facturas.length === 0 ? (
                <div className="p-6 text-sm text-center" style={{ color: COLORS.dim, backgroundColor: COLORS.panel }}>
                  No hay facturas todavía.
                </div>
              ) : (
                facturas.slice().reverse().map((f) => {
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
                          Periodo: {f.periodo} · Vence: {f.fecha_vencimiento || "—"}
                          {f.prorroga_hasta && <span style={{ color: COLORS.warn }}> · Prórroga hasta {f.prorroga_hasta}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm">{money(f.monto)}</span>
                        <FacturaBadge estado={visual} />
                        {f.estado !== "pagada" && (
                          <Button variant="ghost" onClick={() => markPaid(f.id)}>
                            Marcar pagada
                          </Button>
                        )}
                        {f.estado !== "pagada" && (
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
                        <button onClick={() => deleteInvoice(f.id)} style={{ color: COLORS.dim }}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
        {tab === "reportes" && <ReportesTab clientes={clientes} planes={planes} facturas={facturas} />}
        {tab === "mapa" && <MapaTab clientes={clientes} planById={planById} />}
      </main>

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
    </div>
  );
}

function ReportesTab({ clientes, planes, facturas }) {
  const hoy = new Date();

  // Ingresos cobrados por mes (últimos 6 meses, según fecha_vencimiento)
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    meses.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("es-MX", { month: "short" }) });
  }
  const ingresosPorMes = meses.map((m) => {
    const total = facturas
      .filter((f) => f.estado === "pagada" && f.fecha_vencimiento && f.fecha_vencimiento.startsWith(m.key))
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
      <h1 className="font-display text-xl md:text-2xl font-semibold mb-1">Reportes</h1>
      <p className="text-sm mb-6" style={{ color: COLORS.dim }}>Visión financiera de tu operación.</p>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        {[
          { label: "Total facturado", value: money(totalFacturado), color: COLORS.text },
          { label: "Cobrado", value: money(totalCobrado), color: COLORS.active },
          { label: "Pendiente", value: money(totalPendiente), color: COLORS.warn },
          { label: "Vencido", value: money(totalVencido), color: COLORS.danger },
          { label: "Tasa de cobro", value: `${tasaCobro}%`, color: COLORS.accent },
        ].map((k) => (
          <div key={k.label} className="rounded-xl p-4" style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
            <div className="text-xs mb-2" style={{ color: COLORS.dim }}>{k.label}</div>
            <div className="font-mono text-lg font-medium" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <h2 className="font-display text-sm font-semibold mb-3" style={{ color: COLORS.dim }}>INGRESOS COBRADOS · ÚLTIMOS 6 MESES</h2>
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

function MapaTab({ clientes, planById }) {
  const conUbicacion = clientes.filter((c) => c.lat && c.lng);
  const center =
    conUbicacion.length > 0
      ? [conUbicacion[0].lat, conUbicacion[0].lng]
      : DEFAULT_CENTER;
  const colorByEstado = { activo: COLORS.active, moroso: COLORS.danger, suspendido: COLORS.dim };

  return (
    <div>
      <h1 className="font-display text-xl md:text-2xl font-semibold mb-1">Mapa de cobertura</h1>
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
  const [importando, setImportando] = useState(false);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const cols = (results.meta.fields || []).filter((h) => h && h.trim() !== "");
        setHeaders(cols);
        setRows(results.data);
        const auto = {};
        CAMPOS_IMPORTABLES.forEach((c) => {
          const match = cols.find((h) => h.toLowerCase().includes(c.key.replace("_", "")) || h.toLowerCase().includes(c.label.toLowerCase().split(" ")[0]));
          if (match) auto[c.key] = match;
        });
        setMapping(auto);
      },
      error: () => setError("No se pudo leer el archivo. Verifica que sea un CSV válido."),
    });
  };

  const confirmar = async () => {
    if (!mapping.nombre) {
      setError("Debes indicar cuál columna es el nombre del cliente.");
      return;
    }
    setImportando(true);
    setError("");
    const filas = rows.map((r) => {
      const obj = {};
      CAMPOS_IMPORTABLES.forEach((c) => {
        const header = mapping[c.key];
        obj[c.key] = header ? (r[header] || "").trim() : "";
      });
      return obj;
    }).filter((f) => f.nombre);

    const unicos = [];
    const vistos = new Set();
    filas.forEach((f) => {
      const clave = (f.plan || "").toLowerCase().trim();
      if (f.plan && !vistos.has(clave)) {
        vistos.add(clave);
        unicos.push({ nombre: f.plan, precio: parseFloat(f.plan_precio) || 0 });
      }
    });

    const planesActualizados = unicos.length > 0 ? await onEnsurePlanes(unicos) : planes;
    setImportando(false);
    onImport(filas, planesActualizados);
  };

  return (
    <Modal title="Importar clientes desde CSV" onClose={onCancel}>
      {headers.length === 0 ? (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>
            Exporta tus clientes desde WispHub (u otro sistema) como archivo CSV, y súbelo aquí.
          </p>
          <input type="file" accept=".csv" onChange={handleFile} style={{ color: COLORS.text, fontSize: 13 }} />
          {error && <p className="text-xs mt-3" style={{ color: COLORS.danger }}>{error}</p>}
        </div>
      ) : (
        <div>
          <p className="text-xs mb-3" style={{ color: COLORS.dim }}>
            {fileName} · {rows.length} filas detectadas. Indica qué columna corresponde a cada dato (deja "No usar" si no aplica).
          </p>
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
      <Field label="Precio mensual (MXN)">
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
      <Field label="Monto (MXN)">
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
