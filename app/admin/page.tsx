"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ShieldCheck, UserPlus, Trash2, KeyRound, Loader2, X, Check, AlertTriangle,
} from "lucide-react";

// ── Design tokens (match the app) ───────────────────────────────────────────────
const TEXT1  = "#0F172A";
const TEXT2  = "#64748B";
const TEXT3  = "#94A3B8";
const BORDER = "rgba(15,23,42,0.08)";
const BLUE   = "#2B5CE0";
const RED    = "#B91C1C";
const GREEN  = "#15803D";
const CARD: React.CSSProperties = {
  background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 12,
  boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
};

interface AdminUser {
  id:    string;
  email: string;
  name:  string | null;
  role:  string;
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "8px 11px", borderRadius: 8, border: `1px solid ${BORDER}`,
  background: "#F8FAFF", fontSize: 13, color: TEXT1, outline: "none",
};

function RoleBadge({ role }: { role: string }) {
  const admin = role === "admin";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
      padding: "3px 9px", borderRadius: 6,
      background: admin ? "rgba(43,92,224,0.10)" : "rgba(100,116,139,0.10)",
      border: `1px solid ${admin ? "rgba(43,92,224,0.28)" : "rgba(100,116,139,0.24)"}`,
      color: admin ? "#1E3A8A" : "#475569",
    }}>
      {admin && <ShieldCheck size={11} />}
      {role}
    </span>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [users,   setUsers]   = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [notice,  setNotice]  = useState<string | null>(null);

  // Create form
  const [nEmail,    setNEmail]    = useState("");
  const [nName,     setNName]     = useState("");
  const [nPassword, setNPassword] = useState("");
  const [nRole,     setNRole]     = useState("user");
  const [creating,  setCreating]  = useState(false);

  // Redirect non-admins once the session is resolved.
  useEffect(() => {
    if (status === "loading") return;
    if (!isAdmin) router.replace("/");
  }, [status, isAdmin, router]);

  const loadUsers = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d: { users?: AdminUser[]; error?: string }) => {
        if (d.error) throw new Error(d.error);
        setUsers(d.users ?? []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (isAdmin) loadUsers(); }, [isAdmin, loadUsers]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  }

  async function createUser() {
    setError(null);
    if (!nEmail.trim() || !nPassword) { setError("Email y contraseña son obligatorios."); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: nEmail, name: nName, password: nPassword, role: nRole }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo crear.");
      setNEmail(""); setNName(""); setNPassword(""); setNRole("user");
      flash(`Usuario ${d.user.email} creado.`);
      loadUsers();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function changeRole(u: AdminUser, role: string) {
    if (role === u.role) return;
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ role }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo actualizar.");
      flash(`Rol de ${u.email} → ${role}.`);
      loadUsers();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function resetPassword(u: AdminUser) {
    const pwd = window.prompt(`Nueva contraseña para ${u.email} (mín. 6 caracteres):`);
    if (pwd == null) return;
    if (pwd.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ password: pwd }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo actualizar.");
      flash(`Contraseña de ${u.email} actualizada.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteUser(u: AdminUser) {
    if (!window.confirm(`¿Eliminar al usuario ${u.email}? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo eliminar.");
      flash(`Usuario ${u.email} eliminado.`);
      loadUsers();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // ── Guard states ──────────────────────────────────────────────────────────
  if (status === "loading" || (!isAdmin && status !== "unauthenticated")) {
    return (
      <div className="max-w-[1100px] mx-auto px-6 py-10" style={{ display: "flex", justifyContent: "center" }}>
        <Loader2 size={20} style={{ color: BLUE, animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }
  if (!isAdmin) return null;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div className="max-w-[1100px] mx-auto px-6 py-6">

        {/* Header */}
        <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: "rgba(43,92,224,0.08)", border: "1px solid rgba(43,92,224,0.16)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ShieldCheck size={19} style={{ color: BLUE }} />
          </div>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 800, color: TEXT1, letterSpacing: "-0.03em", margin: 0 }}>
              Administración
            </h1>
            <p style={{ fontSize: 12, color: TEXT2, marginTop: 3 }}>
              Gestión de usuarios y roles del Research Hub
            </p>
          </div>
        </div>

        {/* Notice / error */}
        {notice && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14, padding: "9px 13px", borderRadius: 9, background: "rgba(21,128,61,0.07)", border: "1px solid rgba(21,128,61,0.20)", color: GREEN, fontSize: 12.5 }}>
            <Check size={14} /> {notice}
          </div>
        )}
        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14, padding: "9px 13px", borderRadius: 9, background: "rgba(185,28,28,0.06)", border: "1px solid rgba(185,28,28,0.20)", color: RED, fontSize: 12.5 }}>
            <AlertTriangle size={14} /> {error}
            <button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: RED, cursor: "pointer", display: "flex" }}><X size={14} /></button>
          </div>
        )}

        {/* Create user card */}
        <div style={{ ...CARD, padding: "18px 20px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <UserPlus size={15} style={{ color: BLUE }} />
            <h2 style={{ fontSize: 14, fontWeight: 700, color: TEXT1, margin: 0 }}>Crear usuario</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1fr 0.7fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: TEXT2, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Email</label>
              <input value={nEmail} onChange={(e) => setNEmail(e.target.value)} placeholder="usuario@patria.com" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: TEXT2, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Nombre</label>
              <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Opcional" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: TEXT2, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Contraseña</label>
              <input type="text" value={nPassword} onChange={(e) => setNPassword(e.target.value)} placeholder="mín. 6" style={{ ...inputStyle, fontFamily: "JetBrains Mono, monospace" }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: TEXT2, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Rol</label>
              <select value={nRole} onChange={(e) => setNRole(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <button
              onClick={createUser}
              disabled={creating}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "9px 18px", borderRadius: 8, border: "none",
                background: creating ? "rgba(43,92,224,0.5)" : BLUE, color: "#fff",
                fontSize: 13, fontWeight: 700, cursor: creating ? "not-allowed" : "pointer",
                whiteSpace: "nowrap", height: 38,
              }}
            >
              {creating ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <UserPlus size={14} />}
              Crear
            </button>
          </div>
        </div>

        {/* Users table */}
        <div style={{ ...CARD, overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${BORDER}`, background: "#F8FAFF" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: TEXT1 }}>
              Usuarios {users.length > 0 && <span style={{ color: TEXT3, fontWeight: 500 }}>· {users.length}</span>}
            </span>
          </div>

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
              <Loader2 size={18} style={{ color: BLUE, animation: "spin 0.8s linear infinite" }} />
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: TEXT3, fontSize: 13 }}>No hay usuarios.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.2fr 130px auto", gap: "0 14px" }}>
              {/* Header row */}
              <div style={{ display: "contents" }}>
                {["Email", "Nombre", "Rol", "Acciones"].map((h) => (
                  <div key={h} style={{ padding: "9px 20px", fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: TEXT3, textTransform: "uppercase", borderBottom: `1px solid ${BORDER}`, textAlign: h === "Acciones" ? "right" : "left" }}>
                    {h}
                  </div>
                ))}
              </div>

              {users.map((u) => {
                const isSelf = session?.user?.id === u.id;
                return (
                  <div key={u.id} style={{ display: "contents" }}>
                    <div style={{ padding: "11px 20px", fontSize: 13, color: TEXT1, fontWeight: 600, borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
                      {isSelf && <span style={{ fontSize: 9, color: TEXT3, background: "rgba(15,23,42,0.05)", padding: "1px 6px", borderRadius: 5, flexShrink: 0 }}>tú</span>}
                    </div>
                    <div style={{ padding: "11px 20px", fontSize: 13, color: TEXT2, borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center" }}>
                      {u.name || <span style={{ color: TEXT3 }}>—</span>}
                    </div>
                    <div style={{ padding: "11px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value)}
                        disabled={isSelf}
                        title={isSelf ? "No puedes cambiar tu propio rol" : "Cambiar rol"}
                        style={{
                          appearance: "none", padding: "4px 8px", borderRadius: 6,
                          border: `1px solid ${BORDER}`, background: isSelf ? "#F1F5F9" : "#fff",
                          fontSize: 11, fontWeight: 600, color: TEXT1,
                          cursor: isSelf ? "not-allowed" : "pointer",
                        }}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                      <RoleBadge role={u.role} />
                    </div>
                    <div style={{ padding: "11px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                      <button
                        onClick={() => resetPassword(u)}
                        title="Resetear contraseña"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT2, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                      >
                        <KeyRound size={12} /> Password
                      </button>
                      <button
                        onClick={() => deleteUser(u)}
                        disabled={isSelf}
                        title={isSelf ? "No puedes eliminar tu propia cuenta" : "Eliminar usuario"}
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 30, height: 30, borderRadius: 7,
                          border: `1px solid ${isSelf ? BORDER : "rgba(185,28,28,0.20)"}`,
                          background: isSelf ? "#F1F5F9" : "rgba(185,28,28,0.05)",
                          color: isSelf ? TEXT3 : RED,
                          cursor: isSelf ? "not-allowed" : "pointer",
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
