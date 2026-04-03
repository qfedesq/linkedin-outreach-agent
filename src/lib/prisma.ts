import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const url = process.env.DATABASE_URL || "file:./prisma/dev.db";

  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const adapter = new PrismaPg({ connectionString: url });
    return new PrismaClient({ adapter });
  }

  // SQLite / libSQL for local dev
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
