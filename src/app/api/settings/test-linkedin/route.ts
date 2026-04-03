import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { createLinkedIn } from "@/lib/linkedin-provider";

export async function POST() {
  const user = await getAuthUser();
  if (!user?.settings) return unauthorized();

  const client = createLinkedIn(user.settings);
  if (!client) {
    return NextResponse.json({ success: false, error: "Unipile not configured. Add API Key and Account ID in Settings." });
  }

  const result = await client.testConnection();
  return NextResponse.json({
    success: result.success,
    profile: result.success ? { name: result.profile } : undefined,
    error: result.error,
  });
}
