"use client";

import { FONT_SECONDARY } from "@/lib/patriaTheme";

import { useState, FormEvent } from "react";
import { signIn }              from "next-auth/react";
import { useRouter }           from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = "idle" | "loading" | "error";

// ── Component ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [status,   setStatus]   = useState<Status>("idle");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");

    const result = await signIn("credentials", {
      email:    email.trim().toLowerCase(),
      password,
      redirect: false,   // handle redirect manually to show inline error
    });

    if (result?.ok) {
      router.push("/companies");
      router.refresh();          // flush Server Component cache after login
    } else {
      setStatus("error");
    }
  }

  return (
    // Full-screen overlay — sits on top of the Navbar (z-50)
    <div
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         50,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        background:     "#F5F7FD",
      }}
    >
      {/* Card */}
      <div
        style={{
          width:        "100%",
          maxWidth:     420,
          background:   "#FFFFFF",
          borderRadius: 14,
          border:       "1px solid rgba(13,13,56,0.09)",
          boxShadow:    "0 8px 40px rgba(13,13,56,0.09)",
          overflow:     "hidden",
        }}
      >
        {/* Header band */}
        <div
          style={{
            padding:         "28px 36px 24px",
            borderBottom:    "1px solid rgba(13,13,56,0.07)",
            background:      "linear-gradient(135deg, #0D0D38 0%, #001EAF 100%)",
          }}
        >
          <p
            style={{
              fontSize:      10,
              fontWeight:    700,
              letterSpacing: "0.18em",
              color:         "rgba(255,255,255,0.50)",
              marginBottom:  8,
              fontFamily:    FONT_SECONDARY,
            }}
          >
            AGF · RESEARCH HUB
          </p>
          <h1
            style={{
              fontSize:   20,
              fontWeight: 700,
              color:      "#FFFFFF",
              margin:     0,
            }}
          >
            Equity Research Dashboard
          </h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
            Restricted access — authorized users only
          </p>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} style={{ padding: "28px 36px 32px" }}>
          {/* Email */}
          <div style={{ marginBottom: 18 }}>
            <label
              htmlFor="email"
              style={{
                display:       "block",
                fontSize:      11,
                fontWeight:    600,
                color:         "rgba(13,13,56,0.62)",
                marginBottom:  6,
                letterSpacing: "0.05em",
              }}
            >
              EMAIL
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
              placeholder="analyst@fund.com"
              style={{
                width:        "100%",
                padding:      "10px 14px",
                borderRadius: 8,
                border:       `1px solid ${status === "error" ? "rgba(248,72,94,0.40)" : "rgba(13,13,56,0.14)"}`,
                background:   "#F5F7FD",
                fontSize:     13,
                color:        "#0D0D38",
                outline:      "none",
                fontFamily:   FONT_SECONDARY,
                boxSizing:    "border-box",
                transition:   "border-color 0.15s",
              }}
              onFocus={(e) => { if (status !== "error") (e.currentTarget as HTMLElement).style.borderColor = "rgba(32,68,220,0.50)"; }}
              onBlur={(e)  => { if (status !== "error") (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,13,56,0.14)"; }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="password"
              style={{
                display:       "block",
                fontSize:      11,
                fontWeight:    600,
                color:         "rgba(13,13,56,0.62)",
                marginBottom:  6,
                letterSpacing: "0.05em",
              }}
            >
              PASSWORD
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => { setPassword(e.target.value); setStatus("idle"); }}
              placeholder="••••••••"
              style={{
                width:        "100%",
                padding:      "10px 14px",
                borderRadius: 8,
                border:       `1px solid ${status === "error" ? "rgba(248,72,94,0.40)" : "rgba(13,13,56,0.14)"}`,
                background:   "#F5F7FD",
                fontSize:     13,
                color:        "#0D0D38",
                outline:      "none",
                fontFamily:   FONT_SECONDARY,
                boxSizing:    "border-box",
                transition:   "border-color 0.15s",
              }}
              onFocus={(e) => { if (status !== "error") (e.currentTarget as HTMLElement).style.borderColor = "rgba(32,68,220,0.50)"; }}
              onBlur={(e)  => { if (status !== "error") (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,13,56,0.14)"; }}
            />
          </div>

          {/* Error message */}
          {status === "error" && (
            <div
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          7,
                padding:      "9px 12px",
                borderRadius: 7,
                background:   "rgba(248,72,94,0.06)",
                border:       "1px solid rgba(248,72,94,0.18)",
                marginBottom: 20,
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>⚠</span>
              <span style={{ fontSize: 12, color: "#F8485E", fontWeight: 500 }}>
                Invalid email or password.
              </span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={status === "loading"}
            style={{
              width:        "100%",
              padding:      "11px 0",
              borderRadius: 8,
              border:       "none",
              background:   status === "loading"
                ? "rgba(32,68,220,0.55)"
                : "linear-gradient(135deg, #001EAF 0%, #2044DC 100%)",
              color:        "#FFFFFF",
              fontSize:     13,
              fontWeight:   700,
              letterSpacing:"0.03em",
              cursor:       status === "loading" ? "not-allowed" : "pointer",
              transition:   "opacity 0.15s",
              fontFamily:   FONT_SECONDARY,
            }}
          >
            {status === "loading" ? "Authenticating…" : "Sign in"}
          </button>

          {/* Footer note */}
          <p
            style={{
              marginTop:  20,
              fontSize:   11,
              color:      "rgba(13,13,56,0.45)",
              textAlign:  "center",
              lineHeight: 1.5,
            }}
          >
            Access is restricted to authorized personnel.
            <br />
            Contact your administrator if you need access.
          </p>
        </form>
      </div>
    </div>
  );
}
