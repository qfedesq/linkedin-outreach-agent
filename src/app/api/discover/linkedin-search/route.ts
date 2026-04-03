import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { requireLinkedIn } from "@/lib/linkedin-provider";
import { logActivity } from "@/lib/activity-log";

export const maxDuration = 30;

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings) return unauthorized();

  let linkedin;
  try { linkedin = requireLinkedIn(user.settings); } catch (e) {
    return NextResponse.json({ error: (e as Error).message, results: [] }, { status: 400 });
  }

  const body = await request.json();
  const { keywords, count = 10 } = body;
  if (!keywords) return NextResponse.json({ error: "Keywords required", results: [] }, { status: 400 });

  await logActivity(user.id, "linkedin_search", {
    level: "info", message: `Searching LinkedIn via Unipile: "${keywords}" (count=${count})`,
  });

  try {
    const results = await linkedin.searchPeople(keywords, count);
    const items = results?.items || results?.data || [];

    await logActivity(user.id, "linkedin_search", {
      level: "success", message: `Unipile search: found ${items.length} results for "${keywords}"`, success: true,
    });

    return NextResponse.json({ results: items, count: items.length });
  } catch (error) {
    await logActivity(user.id, "linkedin_search", {
      level: "error", message: `Unipile search failed: ${(error as Error).message}`, success: false,
    });
    return NextResponse.json({ error: (error as Error).message, results: [] }, { status: 500 });
  }
}
