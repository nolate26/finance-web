import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BCRYPT_ROUNDS = 10;
const ROLES = ["admin", "user"] as const;

// ── GET — lista de usuarios (solo admin) ────────────────────────────────────────
export async function GET() {
  const deny = await requireAdmin();
  if (deny) return deny;

  try {
    const users = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }],
      select:  { id: true, email: true, name: true, role: true, initials: true },
    });
    return NextResponse.json({ users });
  } catch (err) {
    console.error("[admin/users GET]", err);
    return NextResponse.json({ error: "No se pudieron cargar los usuarios" }, { status: 500 });
  }
}

// ── POST — crear usuario (solo admin) ───────────────────────────────────────────
interface CreateBody {
  email?:    string;
  name?:     string;
  password?: string;
  role?:     string;
  initials?: string;   // sigla del calendario semanal ("DM", "AP")
}

export async function POST(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email    = body.email?.toLowerCase().trim();
  const name     = body.name?.trim() || null;
  const password = body.password ?? "";
  const role     = (body.role ?? "user").trim();

  if (!email || !password) {
    return NextResponse.json({ error: "Email y contraseña son obligatorios" }, { status: 400 });
  }
  if (!ROLES.includes(role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: `Rol inválido (${ROLES.join(" | ")})` }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
  }

  const initials = body.initials?.trim().toUpperCase() || null;
  if (initials && !/^[A-Z]{1,8}$/.test(initials)) {
    return NextResponse.json({ error: "La sigla debe ser 1 a 8 letras" }, { status: 400 });
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data:   { email, name, password: passwordHash, role, initials },
      select: { id: true, email: true, name: true, role: true, initials: true },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // target dice qué índice único chocó: email o initials.
      const target = String((e.meta as { target?: string[] } | undefined)?.target ?? "");
      const msg = target.includes("initials")
        ? "Esa sigla ya la usa otro analista"
        : "Ya existe un usuario con ese email";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    console.error("[admin/users POST]", e);
    return NextResponse.json({ error: "No se pudo crear el usuario" }, { status: 500 });
  }
}
