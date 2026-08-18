"use client";

import { FONT_SECONDARY } from "@/lib/patriaTheme";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  BarChart3, TrendingUp, Building2, Globe2,
  FileText, Activity, BookOpen, Sigma, Newspaper,
  ShieldCheck, LogOut, ChevronDown,
} from "lucide-react";

const tabs = [
  { href: "/economia",       label: "Market",           icon: TrendingUp },
  { href: "/fondos",         label: "Funds",            icon: BarChart3  },
  { href: "/chile",          label: "Chile",            icon: Building2  },
  { href: "/latam",          label: "LatAm",            icon: Globe2     },
  { href: "/quant",          label: "Analysis",         icon: Activity   },
  { href: "/quant-analysis", label: "Quant Analysis",   icon: Sigma      },
  { href: "/companies",      label: "Company Profiles", icon: BookOpen   },
  { href: "/research",       label: "Research Notes",   icon: Newspaper  },
  { href: "/presentations",  label: "Presentations",    icon: FileText   },
];

const FONT = "var(--font-sans, 'Figtree', sans-serif)";
const MONO = FONT_SECONDARY;   // Regla 4 — Arial, no monoespaciada

// ── User menu (session + role + logout) ─────────────────────────────────────────
function initialsOf(nameOrEmail: string): string {
  const base = nameOrEmail.trim();
  if (!base) return "?";
  if (base.includes("@")) return base[0]!.toUpperCase();
  const parts = base.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || base[0]!.toUpperCase();
}

function UserMenu() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (status !== "authenticated" || !session?.user) return null;

  const user    = session.user;
  const isAdmin = user.role === "admin";
  const display = user.name || user.email || "Usuario";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2"
        style={{
          padding: "4px 8px 4px 4px", borderRadius: 9,
          background: open ? "rgba(32,68,220,0.08)" : "transparent",
          border: `1px solid ${open ? "rgba(32,68,220,0.22)" : "rgba(13,13,56,0.10)"}`,
          cursor: "pointer", outline: "none", transition: "all 0.12s",
        }}
      >
        <span style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isAdmin ? "linear-gradient(135deg,#001EAF,#2044DC)" : "rgba(13,13,56,0.10)",
          color: isAdmin ? "#fff" : "rgba(13,13,56,0.62)",
          fontSize: 11, fontWeight: 800, fontFamily: FONT,
        }}>
          {initialsOf(display)}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#0D0D38", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {display}
        </span>
        <ChevronDown size={13} style={{ color: "rgba(13,13,56,0.45)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 60,
          minWidth: 230, background: "#fff", borderRadius: 11,
          border: "1px solid rgba(13,13,56,0.10)", boxShadow: "0 12px 34px rgba(13,13,56,0.16)",
          overflow: "hidden",
        }}>
          {/* Identity block */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(13,13,56,0.07)", background: "#F5F7FD" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0D0D38", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.name || "—"}
            </div>
            <div style={{ fontSize: 11, color: "rgba(13,13,56,0.62)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.email}
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8,
              fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
              padding: "2px 8px", borderRadius: 6,
              background: isAdmin ? "rgba(32,68,220,0.10)" : "rgba(13,13,56,0.10)",
              border: `1px solid ${isAdmin ? "rgba(32,68,220,0.28)" : "rgba(13,13,56,0.24)"}`,
              color: isAdmin ? "#001EAF" : "rgba(13,13,56,0.62)",
            }}>
              {isAdmin && <ShieldCheck size={10} />} {user.role}
            </span>
          </div>

          {/* Admin link */}
          {isAdmin && (
            <button
              onClick={() => { setOpen(false); router.push("/admin"); }}
              className="flex items-center gap-2"
              style={{ width: "100%", padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "#0D0D38", textAlign: "left" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.06)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <ShieldCheck size={14} style={{ color: "#2044DC" }} /> Administración
            </button>
          )}

          {/* Logout */}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-2"
            style={{ width: "100%", padding: "10px 14px", background: "transparent", border: "none", borderTop: "1px solid rgba(13,13,56,0.06)", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "#F8485E", textAlign: "left" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(248,72,94,0.05)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6"
      style={{
        background:          "rgba(255,255,255,0.98)",
        borderBottom:        "1px solid rgba(13,13,56,0.09)",
        backdropFilter:      "blur(20px)",
        WebkitBackdropFilter:"blur(20px)",
        boxShadow:           "0 1px 0 rgba(13,13,56,0.05), 0 4px 20px rgba(13,13,56,0.04)",
      }}
    >
      {/* LEFT — logo */}
      <div className="flex items-center flex-shrink-0">
        <Image
          src="/img/moneda_patria.png"
          alt="Moneda Patria"
          height={32}
          width={160}
          style={{ objectFit: "contain", height: 32, width: "auto" }}
          priority
        />
      </div>

      {/* CENTER — navigation tabs */}
      <div
        className="flex items-center"
        style={{
          gap:          2,
          padding:      "3px",
          borderRadius: 11,
          background:   "rgba(13,13,56,0.045)",
          border:       "1px solid rgba(13,13,56,0.08)",
        }}
      >
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <button
              key={href}
              type="button"
              onClick={() => router.push(href)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs transition-all duration-150"
              style={{
                color:      active ? "#0D0D38"  : "rgba(13,13,56,0.62)",
                background: active ? "#FFFFFF"  : "transparent",
                border:     active
                  ? "1px solid rgba(13,13,56,0.11)"
                  : "1px solid transparent",
                boxShadow:  active
                  ? "0 1px 3px rgba(13,13,56,0.10), 0 1px 2px rgba(13,13,56,0.06)"
                  : "none",
                fontWeight: active ? 700 : 500,
                cursor:     "pointer",
                outline:    "none",
                fontFamily: FONT,
                letterSpacing: active ? "-0.01em" : "0",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.color      = "#0D0D38";
                  el.style.background = "rgba(32,68,220,0.06)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.color      = "rgba(13,13,56,0.62)";
                  el.style.background = "transparent";
                }
              }}
            >
              <Icon size={12} strokeWidth={active ? 2.5 : 2} />
              {label}
            </button>
          );
        })}
      </div>

      {/* RIGHT — date + BETA badge */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Thin divider */}
        <div style={{ width: 1, height: 20, background: "rgba(13,13,56,0.09)" }} />

        <span
          style={{
            fontFamily:    MONO,
            fontSize:      10,
            color:         "rgba(13,13,56,0.62)",
            letterSpacing: "0.05em",
          }}
        >
          {new Date()
            .toLocaleDateString("en-GB", {
              day:   "2-digit",
              month: "short",
              year:  "numeric",
            })
            .toUpperCase()}
        </span>

        <span
          style={{
            fontSize:      9,
            padding:       "2px 8px",
            borderRadius:  20,
            fontFamily:    MONO,
            fontWeight:    600,
            letterSpacing: "0.07em",
            background:    "rgba(32,68,220,0.08)",
            color:         "#2044DC",
            border:        "1px solid rgba(32,68,220,0.20)",
            flexShrink:    0,
          }}
        >
          BETA
        </span>

        {/* User menu — session, role badge & logout */}
        <UserMenu />
      </div>
    </nav>
  );
}
