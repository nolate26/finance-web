// ---------------------------------------------------------------------------
// seed-users.mjs — Reinicia la tabla `users` y crea los 2 usuarios base.
//
// ⚠️  DESTRUCTIVO: borra TODOS los usuarios existentes (y en cascada sus
//     `accounts` / `sessions`) y deja únicamente:
//       • Admin   → gcarbone@patria.com        (role: "admin")
//       • Usuario → nicolas.olate@patria.com   (role: "user")
//
// Requisitos previos:
//   1. Haber aplicado la columna `role` al esquema:  npx prisma db push
//   2. Tener DATABASE_URL en el .env
//
// Uso:
//   node scripts/seed-users.mjs
//
// Replica el patrón de lib/prisma.ts (Prisma 7 con driver adapter pg).
// ---------------------------------------------------------------------------

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

// Usuarios a crear (contraseñas en claro → se hashean con bcrypt).
const USERS = [
  { email: "gcarbone@patria.com",      name: "Guillermo Carbone", password: "Guilleca19",   role: "admin" },
  { email: "nicolas.olate@patria.com", name: "Nicolás Olate",     password: "Pa$$word2017", role: "user"  },
];

const BCRYPT_ROUNDS = 10;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL en el entorno (.env).");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // 1. Reset destructivo — elimina todos los usuarios (cascada a accounts/sessions).
    const { count: deleted } = await prisma.user.deleteMany({});
    console.log(`🗑️  Usuarios eliminados: ${deleted}`);

    // 2. Crear los 2 usuarios con contraseña hasheada.
    for (const u of USERS) {
      const passwordHash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
      const created = await prisma.user.create({
        data: {
          email:    u.email.toLowerCase().trim(),
          name:     u.name,
          password: passwordHash,
          role:     u.role,
        },
        select: { id: true, email: true, role: true },
      });
      console.log(`✅  Creado ${created.role.padEnd(5)} → ${created.email}`);
    }

    const total = await prisma.user.count();
    console.log(`\n🎉  Listo. Total de usuarios en la tabla: ${total}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌  Error en el seed:", err);
  process.exit(1);
});
