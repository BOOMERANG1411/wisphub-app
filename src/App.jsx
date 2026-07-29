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
} from "lucide-react";

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
    suspendido: { color: COLORS.dim, label: "Suspendido", Icon: SignalMedium },
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

export default function App() {
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
    } else {
      setClientes(c.data || []);
      setPlanes(p.data || []);
      setFacturas(f.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const planById = (id) => planes.find((p) => p.id === id);

  /* ----- Clientes ----- */
  const saveClient = async (form) => {
    const payload = {
      nombre: form.nombre,
      telefono: form.telefono,
      direccion: form.direccion,
      plan_id: form.planId || null,
      estado: form.estado,
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
          <span className="font-display font-semibold text-lg">WispHub</span>
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
              <Button onClick={() => setClientModal({})}>
                <Plus size={16} /> Nuevo cliente
              </Button>
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
                          {c.telefono} · {c.direccion} · {plan ? plan.nombre : "Sin plan"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <EstadoBadge estado={c.estado} />
                        <button
                          onClick={() =>
                            setClientModal({
                              id: c.id,
                              nombre: c.nombre,
                              telefono: c.telefono,
                              direccion: c.direccion,
                              planId: c.plan_id,
                              estado: c.estado,
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
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm">{money(f.monto)}</span>
                        <FacturaBadge estado={f.estado} />
                        {f.estado !== "pagada" && (
                          <Button variant="ghost" onClick={() => markPaid(f.id)}>
                            Marcar pagada
                          </Button>
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
  });
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
