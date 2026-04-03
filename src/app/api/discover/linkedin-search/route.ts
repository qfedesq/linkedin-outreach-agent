import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { decrypt } from "@/lib/encryption";
import { createLinkedInAPI } from "@/lib/linkedin";
import { logActivity } from "@/lib/activity-log";

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

  await logActivity(user.id, "linkedin_search", {
    level: "info",
    message: `Starting LinkedIn search: "${keywords}" (count=${count})`,
  });

  const startTime = Date.now();
  const liAt = decrypt(user.settings.linkedinLiAt);
  const csrf = decrypt(user.settings.linkedinCsrfToken);
  const api = createLinkedInAPI(liAt, csrf);

  try {
    const results = await api.search.searchPeople(keywords, start, count);
    const duration = Date.now() - startTime;

    await logActivity(user.id, "linkedin_search", {
      level: "success",
      message: `LinkedIn search completed: found ${results.length} profiles for "${keywords}"`,
      response: { count: results.length, names: results.map(r => `${r.firstName} ${r.lastName}`).slice(0, 5) },
      success: true,
      duration,
    });

    return NextResponse.json({ results, count: results.length });
  } catch (error) {
    const duration = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : "Unknown error";

    await logActivity(user.id, "linkedin_search", {
      level: "error",
      message: `LinkedIn search failed: ${msg}`,
      success: false,
      errorCode: msg,
      duration,
    });

    return NextResponse.json({ error: msg, results: [] }, { status: 500 });
  }
}
