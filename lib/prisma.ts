import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    // Los defaults de Prisma son maxWait 2s / timeout 5s. La forma de array de
    // $transaction ignora el { timeout } por-llamada (solo lee isolationLevel):
    // el batch arranca con esta config del constructor. Subirlo acá es lo único
    // que cubre las cargas masivas de /api/ingest.
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
