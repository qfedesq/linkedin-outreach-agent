import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function getDatabaseUrl(): string {
  return (
    process.env.DATABASE1_DATABASE_URL ||
    process.env.DATABASE_URL ||
    ""
  );
}

function createPrismaClient() {
  const url = getDatabaseUrl();
  if (!url) throw new Error("No DATABASE_URL configured");
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
