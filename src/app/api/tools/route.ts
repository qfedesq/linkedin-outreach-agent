import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

// GET /api/tools — list active dynamic tools for authenticated user
export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const tools = await prisma.dynamicTool.findMany({
    where: { userId: user.id, isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      handlerType: true,
      parameters: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ tools });
}

// DELETE /api/tools?name=xxx — deactivate a tool by name
export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const tool = await prisma.dynamicTool.findFirst({ where: { userId: user.id, name } });
  if (!tool) return NextResponse.json({ error: "Tool not found" }, { status: 404 });

  await prisma.dynamicTool.update({ where: { id: tool.id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
