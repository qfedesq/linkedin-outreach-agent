import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { decrypt } from "@/lib/encryption";
import { UnipileLinkedIn } from "@/lib/linkedin-unipile";

const UNIPILE_DSN = "https://api17.unipile.com:14777";

export async function POST() {
  const user = await getAuthUser();
  if (!user?.settings) return unauthorized();

  const { unipileApiKey, unipileAccountId } = user.settings;

  if (!unipileApiKey || !unipileAccountId) {
    return NextResponse.json({
      success: false,
      error: "Unipile not configured. Save your API Key and Account ID first, then test.",
    });
  }

  try {
    const apiKey = decrypt(unipileApiKey);
    const client = new UnipileLinkedIn(UNIPILE_DSN, apiKey, unipileAccountId);
    const result = await client.testConnection();
    return NextResponse.json({
      success: result.success,
      profile: result.success ? { name: result.profile } : undefined,
      error: result.error,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Test failed: ${(error as Error).message}`,
    });
  }
}
