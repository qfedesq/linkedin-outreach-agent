import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { decrypt } from "@/lib/encryption";
import { UnipileLinkedIn } from "@/lib/linkedin-unipile";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const dsn = body.dsn || (user.settings as Record<string, unknown>)?.unipileDsn || "";
  let apiKey = body.apiKey;

  if (!apiKey && user.settings?.unipileApiKey) {
    apiKey = decrypt(user.settings.unipileApiKey);
  }

  if (!dsn || !apiKey) {
    return NextResponse.json({ success: false, error: "DSN and API key required" }, { status: 400 });
  }

  const client = new UnipileLinkedIn(dsn, apiKey);
  const result = await client.testConnection();
  return NextResponse.json(result);
}
