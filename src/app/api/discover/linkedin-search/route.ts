import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { decrypt } from "@/lib/encryption";
import { createLinkedInAPI } from "@/lib/linkedin";

export const maxDuration = 30;

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.linkedinLiAt || !user.settings.linkedinCsrfToken) {
    return NextResponse.json({ error: "LinkedIn cookie not configured", results: [] }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body", results: [] }, { status: 400 });
  }

  const { keywords, start = 0, count = 10 } = body;

  if (!keywords) {
    return NextResponse.json({ error: "Keywords required", results: [] }, { status: 400 });
  }

  const liAt = decrypt(user.settings.linkedinLiAt);
  const csrf = decrypt(user.settings.linkedinCsrfToken);
  const api = createLinkedInAPI(liAt, csrf);

  try {
    const results = await api.search.searchPeople(keywords, start, count);
    return NextResponse.json({ results, count: results.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg, results: [] }, { status: 500 });
  }
}
