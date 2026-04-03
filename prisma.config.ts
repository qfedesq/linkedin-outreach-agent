import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Neon via Vercel uses DATABASE1_DATABASE_URL; local dev uses DATABASE_URL
    url:
      process.env["DATABASE1_DATABASE_URL"] ||
      process.env["DATABASE_URL"],
  },
});
