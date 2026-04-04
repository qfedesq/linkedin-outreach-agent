import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { getSessionUsage } from "@/lib/llm";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  return NextResponse.json(getSessionUsage());
}
