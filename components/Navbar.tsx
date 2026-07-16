"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3, TrendingUp, Building2, Globe2,
  FileText, Activity, BookOpen, Sigma, Newspaper,
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
const MONO = "var(--font-mono, 'JetBrains Mono', monospace)";

export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6"
      style={{
        background:          "rgba(255,255,255,0.98)",
        borderBottom:        "1px solid rgba(15,23,42,0.09)",
        backdropFilter:      "blur(20px)",
        WebkitBackdropFilter:"blur(20px)",
        boxShadow:           "0 1px 0 rgba(15,23,42,0.05), 0 4px 20px rgba(15,23,42,0.04)",
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
          background:   "rgba(15,23,42,0.045)",
          border:       "1px solid rgba(15,23,42,0.08)",
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
                color:      active ? "#1B2E7E"  : "#475569",
                background: active ? "#FFFFFF"  : "transparent",
                border:     active
                  ? "1px solid rgba(15,23,42,0.11)"
                  : "1px solid transparent",
                boxShadow:  active
                  ? "0 1px 3px rgba(15,23,42,0.10), 0 1px 2px rgba(15,23,42,0.06)"
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
                  el.style.color      = "#1B2E7E";
                  el.style.background = "rgba(43,92,224,0.06)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.color      = "#475569";
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
        <div style={{ width: 1, height: 20, background: "rgba(15,23,42,0.09)" }} />

        <span
          style={{
            fontFamily:    MONO,
            fontSize:      10,
            color:         "#64748B",
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
            background:    "rgba(43,92,224,0.08)",
            color:         "#2B5CE0",
            border:        "1px solid rgba(43,92,224,0.20)",
            flexShrink:    0,
          }}
        >
          BETA
        </span>
      </div>
    </nav>
  );
}
