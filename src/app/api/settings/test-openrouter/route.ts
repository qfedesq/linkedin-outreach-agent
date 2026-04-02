import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { decrypt } from "@/lib/encryption";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  let key = body.key;

  if (!key && user.settings?.openrouterApiKey) {
    key = decrypt(user.settings.openrouterApiKey);
  }

  if (!key) {
    return NextResponse.json({ success: false, error: "No API key provided" }, { status: 400 });
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (response.ok) {
      const data = await response.json();
      const models = (data.data || []).map((m: { id: string }) => m.id).slice(0, 50);
      return NextResponse.json({ success: true, models });
    }

    return NextResponse.json({ success: false, error: `API returned ${response.status}` });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    });
  }
}
