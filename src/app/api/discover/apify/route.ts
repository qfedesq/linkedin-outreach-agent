import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { logActivity } from "@/lib/activity-log";

// POST: Start an Apify run (returns immediately with runId)
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.apifyApiToken) return unauthorized();

  const body = await request.json();
  const { keywords, geography, maxResults = 25 } = body;
  const token = decrypt(user.settings.apifyApiToken);
  const jobTitle = keywords || "CEO";
  const location = geography || "";

  await logActivity(user.id, "apify_scrape", {
    level: "info",
    message: `Starting Apify: title="${jobTitle}", location="${location}", max=${maxResults}`,
  });

  try {
    const runResponse = await fetch(
      "https://api.apify.com/v2/acts/apimaestro~linkedin-profile-search-scraper/runs",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ current_job_title: jobTitle, location, rows: maxResults }),
      }
    );

    if (!runResponse.ok) {
      const errBody = await runResponse.text().catch(() => "");
      await logActivity(user.id, "apify_scrape", { level: "error", message: `Apify start failed: ${errBody.substring(0, 200)}`, success: false });
      return NextResponse.json({ error: `Apify error ${runResponse.status}: ${errBody.substring(0, 300)}` }, { status: 500 });
    }

    const runData = await runResponse.json();
    const runId = runData.data?.id;
    const datasetId = runData.data?.defaultDatasetId;

    await logActivity(user.id, "apify_scrape", {
      level: "success",
      message: `Apify actor started! Run ID: ${runId}. Waiting for results...`,
    });

    return NextResponse.json({ runId, datasetId, status: "RUNNING" });
  } catch (error) {
    await logActivity(user.id, "apify_scrape", { level: "error", message: `Apify failed: ${(error as Error).message}`, success: false });
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// GET: Poll an Apify run status + fetch results if done
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.apifyApiToken) return unauthorized();

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  const datasetId = searchParams.get("datasetId");

  if (!runId || !datasetId) {
    return NextResponse.json({ error: "runId and datasetId required" }, { status: 400 });
  }

  const token = decrypt(user.settings.apifyApiToken);

  try {
    // Check run status
    const checkRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const checkData = await checkRes.json();
    const status = checkData.data?.status || "UNKNOWN";

    if (status === "RUNNING" || status === "READY") {
      return NextResponse.json({ status, message: "Still running..." });
    }

    // Fetch results
    const dataResponse = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?format=json`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const profiles = await dataResponse.json();

    if (!Array.isArray(profiles) || profiles.length === 0) {
      await logActivity(user.id, "apify_scrape", { level: "warning", message: `Apify: 0 profiles (status: ${status})`, success: true });
      return NextResponse.json({ status, total: 0, created: 0, skipped: 0 });
    }

    await logActivity(user.id, "apify_scrape", { level: "info", message: `Apify: ${profiles.length} profiles found. Saving...` });

    let created = 0;
    let skipped = 0;

    for (const profile of profiles) {
      const basic = profile.basic_info || profile;
      const profileUrl = (basic.profile_url || basic.profileUrl || basic.url || "").toLowerCase().replace(/\/$/, "").split("?")[0];
      if (!profileUrl.includes("linkedin.com/in/")) { skipped++; continue; }

      const slug = profileUrl.match(/linkedin\.com\/in\/([^/?]+)/i)?.[1] || null;
      const name = basic.fullname || basic.fullName || basic.name || `${basic.first_name || ""} ${basic.last_name || ""}`.trim() || "Unknown";
      const position = basic.headline || basic.title || null;
      const exp = (profile.experience || [])[0];
      const company = exp?.company_name || exp?.companyName || basic.company || null;

      try {
        await prisma.contact.create({
          data: { name, position, company, linkedinUrl: profileUrl.replace(/^https?:\/\/(www\.)?linkedin\.com/, "https://www.linkedin.com"), linkedinSlug: slug, source: "apify", userId: user.id },
        });
        created++;
      } catch { skipped++; }
    }

    await logActivity(user.id, "apify_scrape", { level: "success", message: `Done! ${created} new, ${skipped} skipped, ${profiles.length} total`, success: true });

    return NextResponse.json({ status, total: profiles.length, created, skipped });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message, status: "FAILED" }, { status: 500 });
  }
}
