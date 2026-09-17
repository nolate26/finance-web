"use client";

import { FONT_SECONDARY } from "@/lib/patriaTheme";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  BarChart3, TrendingUp, Building2, Globe2,
  FileText, BookOpen, Sigma, Newspaper,
  ShieldCheck, LogOut, ChevronDown, CalendarRange,
  Menu, X, DatabaseZap,
} from "lucide-react";

type Tab = { href: string; label: string; icon: typeof Sigma };

// La navegación son TRES píldoras independientes, no una sola corrida de botones.
// El agrupamiento es semántico, no alfabético:
//   1. Lo que produce el equipo: estimaciones, fondos, reuniones, presentaciones.
//   2. Los datos que consulta: mercado, países, empresas, análisis.
//   3. La coordinación interna, sola y al extremo derecho.
// Las rutas (href) no cambiaron nunca: sólo las etiquetas visibles.
// `title` sólo se usa en el cajón móvil: ahí los grupos se apilan en vertical y
// sin un encabezado el agrupamiento —que en escritorio lo comunica la separación
// entre píldoras— se perdería del todo.
const NAV_GROUPS: { title: string; tabs: Tab[] }[] = [
  {
    title: "Team output",
    tabs: [
      { href: "/estimates",     label: "Analyst Estimates",     icon: Sigma      },
      { href: "/fondos",        label: "Moneda Funds",          icon: BarChart3  },
      { href: "/research",      label: "Company Meetings",      icon: Newspaper  },
      { href: "/presentations", label: "Research PPT Database", icon: FileText   },
    ],
  },
  {
    title: "Market data",
    tabs: [
      { href: "/economia",      label: "Market Data",           icon: TrendingUp },
      { href: "/chile",         label: "Chile",                 icon: Building2  },
      { href: "/latam",         label: "LatAm / Brazil",        icon: Globe2     },
      { href: "/companies",     label: "Company Info",          icon: BookOpen   },
      { href: "/extract",       label: "Extract Data",          icon: DatabaseZap },
    ],
  },
  {
    title: "Internal",
    tabs: [
      { href: "/planning",      label: "Team Planning",         icon: CalendarRange },
    ],
  },
];

const ALL_TABS: Tab[] = NAV_GROUPS.flatMap((g) => g.tabs);

// Vista por defecto de la app: es a donde vuelve el logo, que hace de botón "home".
const HOME_HREF = NAV_GROUPS[0].tabs[0].href;   // /estimates

/** Pestaña activa según la ruta. Coincide por prefijo para que /companies/XYZ
 *  siga marcando "Company Info". */
function activeTabOf(pathname: string): Tab | null {
  return ALL_TABS.find((t) => pathname === t.href || pathname.startsWith(t.href + "/")) ?? null;
}

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

// ── Cajón de navegación móvil ───────────────────────────────────────────────────
// Bajo 1280px las nueve pestañas no caben: en escritorio la corrida central
// scrollea, pero con el dedo eso significa buscar a ciegas una pestaña de 11px
// dentro de un riel de 30px de alto. Acá los mismos nueve destinos se apilan en
// filas de 46px, agrupados igual que las tres píldoras del escritorio.
function MobileDrawer({
  open, onClose, pathname, onNavigate,
}: {
  open:       boolean;
  onClose:    () => void;
  pathname:   string;
  onNavigate: (href: string) => void;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const user    = session?.user;
  const isAdmin = user?.role === "admin";

  // El cajón cubre la pantalla completa: si el documento sigue scrolleando
  // detrás, el gesto de deslizar dentro del cajón arrastra la página.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Escape cierra, igual que cualquier diálogo de la plataforma.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Navegación"
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "flex-end" }}
    >
      {/* Velo — toque fuera cierra */}
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(13,13,56,0.42)",
          backdropFilter: "blur(2px)",
          animation: "patria-fade-in 0.15s ease-out",
        }}
      />

      <aside
        style={{
          position: "relative",
          width: "min(320px, 86vw)",
          // `100dvh` explícito y no `100%`: en Safari móvil el alto del padre
          // fixed no siempre resuelve el porcentaje a tiempo y la lista de
          // destinos (flex: 1) colapsaba, dejando visible sólo el pie.
          height: "100dvh",
          background: "#fff",
          borderLeft: "1px solid rgba(13,13,56,0.10)",
          boxShadow: "-8px 0 34px rgba(13,13,56,0.18)",
          display: "flex",
          flexDirection: "column",
          animation: "patria-drawer-in 0.18s ease-out",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        {/* Cabecera del cajón */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 14px 12px", borderBottom: "1px solid rgba(13,13,56,0.08)",
          flexShrink: 0,
        }}>
          <Image
            src="/img/moneda_patria.png"
            alt="Moneda Patria"
            height={26} width={130}
            style={{ objectFit: "contain", height: 26, width: "auto" }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar navegación"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: 9, flexShrink: 0,
              background: "rgba(13,13,56,0.04)", border: "1px solid rgba(13,13,56,0.09)",
              cursor: "pointer", color: "#0D0D38",
            }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Destinos — scrollean solos si no caben (teléfono chico en horizontal) */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "10px 10px 14px", minHeight: 0 }}>
          {NAV_GROUPS.map(({ title, tabs }) => (
            <div key={title} style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 9.5, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase",
                color: "rgba(13,13,56,0.40)", padding: "0 8px 6px", fontFamily: FONT,
              }}>
                {title}
              </div>
              {tabs.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <button
                    key={href}
                    type="button"
                    onClick={() => { onNavigate(href); onClose(); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 11, width: "100%",
                      minHeight: 46, padding: "0 10px", marginBottom: 2,
                      borderRadius: 10, textAlign: "left", cursor: "pointer",
                      fontFamily: FONT, fontSize: 13.5,
                      fontWeight:  active ? 700 : 500,
                      color:       active ? "#001EAF" : "#0D0D38",
                      background:  active ? "rgba(32,68,220,0.08)" : "transparent",
                      border:      active ? "1px solid rgba(32,68,220,0.22)" : "1px solid transparent",
                    }}
                  >
                    <Icon size={16} strokeWidth={active ? 2.5 : 2} style={{ flexShrink: 0, color: active ? "#2044DC" : "rgba(13,13,56,0.48)" }} />
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Pie — identidad y sesión. En escritorio esto es el menú del avatar;
            en el cajón va desplegado porque ya hay espacio vertical de sobra. */}
        {user && (
          <div style={{
            flexShrink: 0, borderTop: "1px solid rgba(13,13,56,0.08)", background: "#F5F7FD",
            padding: `12px 14px calc(12px + env(safe-area-inset-bottom))`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
              <span style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isAdmin ? "linear-gradient(135deg,#001EAF,#2044DC)" : "rgba(13,13,56,0.10)",
                color: isAdmin ? "#fff" : "rgba(13,13,56,0.62)",
                fontSize: 12, fontWeight: 800, fontFamily: FONT,
              }}>
                {initialsOf(user.name || user.email || "?")}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0D0D38", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.name || "—"}
                </div>
                <div style={{ fontSize: 10.5, color: "rgba(13,13,56,0.58)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.email}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {isAdmin && (
                <button
                  onClick={() => { onClose(); router.push("/admin"); }}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    minHeight: 38, borderRadius: 9, cursor: "pointer",
                    background: "#fff", border: "1px solid rgba(32,68,220,0.28)",
                    fontSize: 12, fontWeight: 700, color: "#001EAF", fontFamily: FONT,
                  }}
                >
                  <ShieldCheck size={14} /> Admin
                </button>
              )}
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  minHeight: 38, borderRadius: 9, cursor: "pointer",
                  background: "#fff", border: "1px solid rgba(248,72,94,0.28)",
                  fontSize: 12, fontWeight: 700, color: "#F8485E", fontFamily: FONT,
                }}
              >
                <LogOut size={14} /> Salir
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

// Una píldora = un grupo del navbar. El estilo (fondo claro, borde, radio) es el
// mismo que tenía el contenedor único; lo que cambia es que ahora hay tres.
function NavGroup({
  tabs, pathname, onNavigate,
}: {
  tabs:       Tab[];
  pathname:   string;
  onNavigate: (href: string) => void;
}) {
  return (
    <div
      className="flex items-center flex-shrink-0"
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
            onClick={() => onNavigate(href)}
            className="flex items-center gap-1.5 rounded-lg transition-all duration-150"
            style={{
              // Más ajustado que antes: con diez pestañas y etiquetas largas, el
              // padding original desbordaba el navbar en pantallas de 1440.
              padding:    "6px 10px",
              fontSize:   11.5,
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
            {/* Diez pestañas con etiquetas largas no caben bajo ~1800px. El icono es
                decoración —el agrupamiento ya lo cargan las tres píldoras—, así que
                es lo primero que se suelta para ganar ancho. */}
            <Icon size={12} strokeWidth={active ? 2.5 : 2} className="hidden min-[1800px]:block" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [drawer, setDrawer] = useState(false);

  // La fecha se calcula SÓLO en el cliente, después de hidratar. Calcularla en
  // el render la formatea dos veces —en el servidor (UTC, ICU de Node) y en el
  // navegador (hora de Chile, ICU de Safari)— y cualquier diferencia ("SEP" vs
  // "SEPT", o directamente otro día pasadas las 20h) es un hydration mismatch
  // (#418) para toda la página. Vacío en el servidor = mismo texto en ambos.
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(
      new Date()
        .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        .toUpperCase(),
    );
  }, []);

  const [g1, g2, g3] = NAV_GROUPS;
  const current = activeTabOf(pathname);

  return (
    <nav
      className="nav-root fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-3 min-[1280px]:px-5 gap-2 min-[1280px]:gap-4"
      style={{
        background:          "rgba(255,255,255,0.98)",
        borderBottom:        "1px solid rgba(13,13,56,0.09)",
        backdropFilter:      "blur(20px)",
        WebkitBackdropFilter:"blur(20px)",
        boxShadow:           "0 1px 0 rgba(13,13,56,0.05), 0 4px 20px rgba(13,13,56,0.04)",
      }}
    >
      {/* scrollbarWidth cubre Firefox; WebKit necesita el pseudo-elemento. */}
      <style>{`.nav-root ::-webkit-scrollbar { height: 0; width: 0; }`}</style>

      {/* LEFT — logo: es el botón de "home" y siempre lleva a la vista por defecto.
          El alto baja a 26px bajo 1280px para dejarle ancho al nombre de la vista. */}
      <Link
        href={HOME_HREF}
        aria-label="Inicio — Analyst Estimates"
        className="flex items-center flex-shrink-0"
        style={{ borderRadius: 8, outline: "none", transition: "opacity 0.12s" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
      >
        <Image
          src="/img/moneda_patria.png"
          alt="Moneda Patria"
          height={32}
          width={160}
          className="h-[26px] min-[1280px]:h-8"
          style={{ objectFit: "contain", width: "auto" }}
          priority
        />
      </Link>

      {/* ── CENTRO, bajo 1280px — nombre de la vista actual ─────────────────────
          Reemplaza a las píldoras: con el dedo no se navega desde un riel de
          pestañas de 11px, se navega desde el cajón. Lo que sí hace falta acá es
          saber dónde estás parado. */}
      {current && (
        <span
          className="min-[1280px]:hidden flex items-center gap-1.5 min-w-0"
          style={{
            fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: "#0D0D38",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          <current.icon size={13} strokeWidth={2.5} style={{ flexShrink: 0, color: "#2044DC" }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{current.label}</span>
        </span>
      )}

      {/* CENTER — bloques 1 y 2, dos islas separadas.
          El contenedor es flex-1 con min-w-0 para poder encogerse antes que el logo
          o el menú de usuario; si aun así no cabe, scrollea horizontal en vez de
          romper la barra. */}
      <div
        className="hidden min-[1280px]:flex items-center justify-center flex-1 min-w-0"
        style={{ gap: 22, overflowX: "auto", scrollbarWidth: "none" }}
      >
        <NavGroup tabs={g1.tabs} pathname={pathname} onNavigate={router.push} />
        <NavGroup tabs={g2.tabs} pathname={pathname} onNavigate={router.push} />
      </div>

      {/* ── DERECHA, bajo 1280px — hamburguesa ─────────────────────────────────
          `ml-auto` la pega al borde: el nombre de la vista queda a la izquierda,
          junto al logo, y no flotando en el medio. */}
      <button
        type="button"
        onClick={() => setDrawer(true)}
        aria-label="Abrir navegación"
        aria-expanded={drawer}
        className="min-[1280px]:hidden flex items-center justify-center flex-shrink-0 ml-auto"
        style={{
          width: 40, height: 40, borderRadius: 10,
          background: "rgba(13,13,56,0.04)", border: "1px solid rgba(13,13,56,0.09)",
          cursor: "pointer", color: "#0D0D38",
        }}
      >
        <Menu size={19} />
      </button>

      {/* RIGHT — bloque 3 (Team Planning) + metadatos de sesión */}
      <div className="hidden min-[1280px]:flex items-center gap-3 flex-shrink-0">
        <NavGroup tabs={g3.tabs} pathname={pathname} onNavigate={router.push} />

        {/* Thin divider */}
        <div style={{ width: 1, height: 20, background: "rgba(13,13,56,0.09)" }} />

        {/* La fecha es contexto, no navegación: también se suelta cuando falta ancho. */}
        <span
          className="hidden min-[1800px]:inline"
          style={{
            fontFamily:    MONO,
            fontSize:      10,
            color:         "rgba(13,13,56,0.62)",
            letterSpacing: "0.05em",
          }}
        >
          {today}
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

      <MobileDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        pathname={pathname}
        onNavigate={router.push}
      />
    </nav>
  );
}
