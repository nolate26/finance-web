"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, TrendingUp, Building2 } from "lucide-react";

const tabs = [
  { href: "/economia", label: "Market", icon: TrendingUp },
  { href: "/fondos", label: "Funds", icon: BarChart3 },
  { href: "/companies", label: "Companies", icon: Building2 },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center px-6"
      style={{
        background: "linear-gradient(180deg, #09103A 0%, rgba(9,16,58,0.96) 100%)",
        borderBottom: "1px solid rgba(43,92,224,0.25)",
        backdropFilter: "blur(16px)",
      }}
    >
      {/* Logo mark */}
      <div className="flex items-center gap-3 mr-10">
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            background: "linear-gradient(135deg, #1E4ED8 0%, #2B5CE0 60%, #5080FF 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 12px rgba(43,92,224,0.4)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              color: "#fff",
              fontFamily: "'Figtree', sans-serif",
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: "-0.5px",
              lineHeight: 1,
            }}
          >
            M
          </span>
        </div>
        <div className="hidden sm:flex flex-col" style={{ gap: 0 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.14em",
              color: "#5080FF",
              lineHeight: 1,
              textTransform: "uppercase",
            }}
          >
            Moneda
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#EEF2FF",
              lineHeight: 1.2,
              letterSpacing: "-0.01em",
            }}
          >
            Research Hub
          </span>
        </div>
        <span
          style={{
            fontSize: 9,
            padding: "2px 7px",
            borderRadius: 20,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 500,
            letterSpacing: "0.06em",
            background: "rgba(43,92,224,0.12)",
            color: "#5080FF",
            border: "1px solid rgba(43,92,224,0.25)",
          }}
        >
          BETA
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200"
              style={{
                color: active ? "#EEF2FF" : "#64748B",
                background: active ? "rgba(43,92,224,0.18)" : "transparent",
                border: active
                  ? "1px solid rgba(43,92,224,0.4)"
                  : "1px solid transparent",
              }}
            >
              <Icon size={14} />
              {label}
            </Link>
          );
        })}
      </div>

      {/* Date */}
      <div
        className="ml-auto font-mono"
        style={{ fontSize: 11, color: "#2D3E6E", letterSpacing: "0.04em" }}
      >
        {new Date().toLocaleDateString("en-US", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).toUpperCase()}
      </div>
    </nav>
  );
}
