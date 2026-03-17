"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, TrendingUp } from "lucide-react";

const tabs = [
  { href: "/economia", label: "Economía", icon: TrendingUp },
  { href: "/fondos", label: "Fondos", icon: BarChart3 },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center px-6 border-b"
      style={{
        background: "linear-gradient(90deg, #050B18 0%, #0A1628 100%)",
        borderColor: "rgba(59, 130, 246, 0.2)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 mr-10">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #3B82F6, #06B6D4)" }}
        >
          <span className="text-white font-bold text-sm">R</span>
        </div>
        <span className="font-semibold text-white tracking-wide text-sm hidden sm:block">
          Research Hub
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full font-mono"
          style={{ background: "rgba(59,130,246,0.1)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.2)" }}
        >
          BETA
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                color: active ? "#fff" : "#64748B",
                background: active ? "rgba(59,130,246,0.15)" : "transparent",
                border: active ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
              }}
            >
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </div>

      {/* Right side - date */}
      <div className="ml-auto text-xs font-mono" style={{ color: "#475569" }}>
        {new Date().toLocaleDateString("es-CL", {
          weekday: "short", day: "2-digit", month: "short", year: "numeric"
        }).toUpperCase()}
      </div>
    </nav>
  );
}
