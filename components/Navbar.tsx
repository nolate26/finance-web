"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, TrendingUp, Building2, Globe2, LineChart, FileText } from "lucide-react";

const tabs = [
  { href: "/economia", label: "Market", icon: TrendingUp },
  { href: "/fondos", label: "Funds", icon: BarChart3 },
  { href: "/chile", label: "Chile", icon: Building2 },
  { href: "/latam", label: "LatAm", icon: Globe2 },
  { href: "/projections", label: "Projections", icon: LineChart },
  { href: "/presentations", label: "Presentations", icon: FileText },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6"
      style={{
        background: "rgba(255,255,255,0.97)",
        borderBottom: "1px solid rgba(15,23,42,0.08)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
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
      <div className="flex items-center gap-0.5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <button
              key={href}
              type="button"
              onClick={() => router.push(href)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
              style={{
                color: active ? "#1E3A8A" : "#64748B",
                background: active ? "rgba(43,92,224,0.10)" : "transparent",
                border: active
                  ? "1px solid rgba(43,92,224,0.25)"
                  : "1px solid transparent",
                cursor: "pointer",
                outline: "none",
                fontFamily: "'Figtree', sans-serif",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.color = "#1E3A8A";
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(43,92,224,0.06)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.color = "#64748B";
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      {/* RIGHT — date + BETA badge */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span
          className="font-mono"
          style={{ fontSize: 11, color: "#94A3B8", letterSpacing: "0.04em" }}
        >
          {new Date()
            .toLocaleDateString("en-US", {
              weekday: "short",
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
            .toUpperCase()}
        </span>
        <span
          style={{
            fontSize: 9,
            padding: "2px 7px",
            borderRadius: 20,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 500,
            letterSpacing: "0.06em",
            background: "rgba(43,92,224,0.08)",
            color: "#2B5CE0",
            border: "1px solid rgba(43,92,224,0.20)",
            flexShrink: 0,
          }}
        >
          BETA
        </span>
      </div>
    </nav>
  );
}
