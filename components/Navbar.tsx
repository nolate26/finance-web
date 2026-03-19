"use client";

import { usePathname, useRouter } from "next/navigation";
import { BarChart3, TrendingUp, Building2 } from "lucide-react";

const tabs = [
  { href: "/economia", label: "Market", icon: TrendingUp },
  { href: "/fondos", label: "Funds", icon: BarChart3 },
  { href: "/companies", label: "Companies", icon: Building2 },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center px-6"
      style={{
        background: "linear-gradient(180deg, #0A1240 0%, rgba(9,16,58,0.98) 100%)",
        borderBottom: "1px solid rgba(43,92,224,0.32)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* Moneda logo */}
      <div className="flex items-center gap-3 mr-10 flex-shrink-0">
        <img
          src="/moneda-logo.svg"
          alt="Moneda Patria Investments"
          style={{ height: 34, display: "block" }}
        />
        <span
          style={{
            fontSize: 9,
            padding: "2px 7px",
            borderRadius: 20,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 500,
            letterSpacing: "0.06em",
            background: "rgba(43,92,224,0.14)",
            color: "#6699FF",
            border: "1px solid rgba(80,128,255,0.28)",
            flexShrink: 0,
          }}
        >
          BETA
        </span>
      </div>

      {/* Navigation tabs — use router.push for reliable client-side navigation */}
      <div
        className="flex items-center gap-0.5"
        style={{ position: "relative", zIndex: 10, flexShrink: 0 }}
      >
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <button
              key={href}
              type="button"
              onClick={() => router.push(href)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
              style={{
                color: active ? "#FFFFFF" : "#7A8FAD",
                background: active ? "rgba(43,92,224,0.22)" : "transparent",
                border: active
                  ? "1px solid rgba(80,128,255,0.42)"
                  : "1px solid transparent",
                cursor: "pointer",
                outline: "none",
                fontFamily: "'Figtree', sans-serif",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.color = "#C5D4FF";
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(43,92,224,0.08)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.color = "#7A8FAD";
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

      {/* Date — pushed to right */}
      <div
        className="ml-auto font-mono flex-shrink-0"
        style={{ fontSize: 11, color: "#3D5580", letterSpacing: "0.04em" }}
      >
        {new Date()
          .toLocaleDateString("en-US", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
          .toUpperCase()}
      </div>
    </nav>
  );
}
