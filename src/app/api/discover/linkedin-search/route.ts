import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { decrypt } from "@/lib/encryption";
import { createLinkedInAPI } from "@/lib/linkedin";

export const maxDuration = 30; // Allow up to 30s on Vercel Pro

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.linkedinLiAt || !user.settings.linkedinCsrfToken) {
    return unauthorized();
  }

  const body = await request.json();
  const { keywords, filters, start = 0, count = 10 } = body;

  if (!keywords) {
    return NextResponse.json({ error: "Keywords required" }, { status: 400 });
  }

  const liAt = decrypt(user.settings.linkedinLiAt);
  const csrf = decrypt(user.settings.linkedinCsrfToken);
  const api = createLinkedInAPI(liAt, csrf);

  try {
    const results = await api.search.searchPeople(keywords, filters, start, count);
    return NextResponse.json({ results, count: results.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg, results: [] }, { status: 500 });
  }
}
