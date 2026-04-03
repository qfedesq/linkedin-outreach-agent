import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { logActivity } from "@/lib/activity-log";

export const maxDuration = 300; // 5 min — actor can take a while

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.apifyApiToken) return unauthorized();

  const body = await request.json();
  const { keywords, geography, maxResults = 25 } = body;
  const token = decrypt(user.settings.apifyApiToken);

  // Parse keywords into job title (the actor searches by job title + location)
  const jobTitle = keywords || "CEO";
  const location = geography || "";

  await logActivity(user.id, "apify_scrape", {
    level: "info",
    message: `Starting Apify scrape: title="${jobTitle}", location="${location}", max=${maxResults}`,
  });

  const startTime = Date.now();

  try {
    await logActivity(user.id, "apify_scrape", {
      level: "debug",
      message: "Calling Apify actor apimaestro~linkedin-profile-search-scraper...",
    });

    const runResponse = await fetch(
      "https://api.apify.com/v2/acts/apimaestro~linkedin-profile-search-scraper/runs?waitForFinish=240",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          current_job_title: jobTitle,
          location: location,
          rows: maxResults,
        }),
      }
    );

    if (!runResponse.ok) {
      const errBody = await runResponse.text().catch(() => "");
      await logActivity(user.id, "apify_scrape", {
        level: "error",
        message: `Apify actor returned ${runResponse.status}: ${errBody.substring(0, 200)}`,
        success: false,
        errorCode: `${runResponse.status}`,
        duration: Date.now() - startTime,
      });
      return NextResponse.json(
        { error: `Apify error ${runResponse.status}: ${errBody.substring(0, 500)}` },
        { status: 500 }
      );
    }

    const runData = await runResponse.json();
    const datasetId = runData.data?.defaultDatasetId;
    const runStatus = runData.data?.status;

    await logActivity(user.id, "apify_scrape", {
      level: "info",
      message: `Apify actor ${runStatus}. Dataset: ${datasetId}. Fetching results...`,
      duration: Date.now() - startTime,
    });

    if (!datasetId) {
      return NextResponse.json({ error: "No dataset returned from Apify" }, { status: 500 });
    }

    // If still running, wait a bit more then fetch whatever is available
    if (runStatus === "READY" || runStatus === "RUNNING") {
      await logActivity(user.id, "apify_scrape", {
        level: "warning",
        message: "Actor still running. Fetching partial results...",
      });
    }

    const dataResponse = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?format=json`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!dataResponse.ok) {
      return NextResponse.json({ error: `Failed to fetch results: ${dataResponse.status}` }, { status: 500 });
    }

    const profiles = await dataResponse.json();

    if (!Array.isArray(profiles) || profiles.length === 0) {
      await logActivity(user.id, "apify_scrape", {
        level: "warning",
        message: "Apify returned 0 profiles.",
        success: true,
        duration: Date.now() - startTime,
      });
      return NextResponse.json({ total: 0, created: 0, skipped: 0 });
    }

    await logActivity(user.id, "apify_scrape", {
      level: "info",
      message: `Processing ${profiles.length} profiles from Apify...`,
    });

    let created = 0;
    let skipped = 0;

    for (const profile of profiles) {
      // apimaestro actor returns nested structure: basic_info, experience, etc.
      const basic = profile.basic_info || profile;
      const profileUrl = (basic.profile_url || basic.profileUrl || basic.url || "")
        .toLowerCase().replace(/\/$/, "").split("?")[0];

      if (!profileUrl.includes("linkedin.com/in/")) {
        skipped++;
        continue;
      }

      const slug = profileUrl.match(/linkedin\.com\/in\/([^/?]+)/i)?.[1] || null;
      const name = basic.fullname || basic.fullName || basic.name || `${basic.first_name || ""} ${basic.last_name || ""}`.trim() || "Unknown";
      const position = basic.headline || basic.title || null;

      // Get company from experience if available
      const exp = (profile.experience || [])[0];
      const company = exp?.company_name || exp?.companyName || basic.company || null;

      try {
        await prisma.contact.create({
          data: {
            name,
            position,
            company,
            linkedinUrl: profileUrl.replace(/^https?:\/\/(www\.)?linkedin\.com/, "https://www.linkedin.com"),
            linkedinSlug: slug,
            source: "apify",
            userId: user.id,
          },
        });
        created++;
      } catch {
        skipped++;
      }
    }

    await logActivity(user.id, "apify_scrape", {
      level: "success",
      message: `Apify scrape complete: ${created} new contacts saved, ${skipped} skipped (dupes/invalid), ${profiles.length} total from actor`,
      success: true,
      duration: Date.now() - startTime,
    });

    return NextResponse.json({ total: profiles.length, created, skipped });
  } catch (error) {
    await logActivity(user.id, "apify_scrape", {
      level: "error",
      message: `Apify scrape failed: ${(error as Error).message}`,
      success: false,
      duration: Date.now() - startTime,
    });
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
