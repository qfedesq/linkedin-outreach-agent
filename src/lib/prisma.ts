import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const url = process.env.DATABASE_URL || "file:./prisma/dev.db";

  // For SQLite/libSQL (local dev)
  if (url.startsWith("file:") || url.startsWith("libsql:")) {
    const adapter = new PrismaLibSql({ url });
    return new PrismaClient({ adapter });
  }

  // For Postgres (Vercel) — use @prisma/adapter-pg
  // When deploying to Vercel with Postgres, install @prisma/adapter-pg
  // and update this block. For now, default to libSQL.
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
