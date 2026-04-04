import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { getAgentStatus } from "@/lib/agent-status";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  return NextResponse.json({ steps: getAgentStatus(user.id) });
}
