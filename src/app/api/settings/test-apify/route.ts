import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { decrypt } from "@/lib/encryption";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  let token = body.token;

  if (!token && user.settings?.apifyApiToken) {
    token = decrypt(user.settings.apifyApiToken);
  }

  if (!token) {
    return NextResponse.json({ success: false, error: "No API token provided" }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.apify.com/v2/acts?limit=1", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: `API returned ${response.status}` });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    });
  }
}
