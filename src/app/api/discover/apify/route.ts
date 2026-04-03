import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { logActivity } from "@/lib/activity-log";

export const maxDuration = 180;

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.apifyApiToken) return unauthorized();

  const body = await request.json();
  const { keywords, geography, maxResults = 25 } = body;
  const token = decrypt(user.settings.apifyApiToken);

  await logActivity(user.id, "apify_scrape", {
    level: "info",
    message: `Starting Apify scrape: "${keywords}" (geo=${geography}, max=${maxResults})`,
  });

  const startTime = Date.now();

  try {
    await logActivity(user.id, "apify_scrape", {
      level: "debug",
      message: "Calling Apify actor harvestapi~linkedin-profile-search...",
    });

    const runResponse = await fetch(
      "https://api.apify.com/v2/acts/harvestapi~linkedin-profile-search/runs?waitForFinish=120",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          keyword: keywords,
          location: geography || "",
          maxProfiles: maxResults,
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

    await logActivity(user.id, "apify_scrape", {
      level: "info",
      message: `Apify actor completed. Dataset: ${datasetId}. Fetching results...`,
      duration: Date.now() - startTime,
    });

    if (!datasetId) {
      await logActivity(user.id, "apify_scrape", {
        level: "error",
        message: "No dataset returned from Apify",
        success: false,
      });
      return NextResponse.json({ error: "No dataset returned from Apify" }, { status: 500 });
    }

    const dataResponse = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?format=json`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!dataResponse.ok) {
      return NextResponse.json({ error: `Failed to fetch results: ${dataResponse.status}` }, { status: 500 });
    }

    const profiles = await dataResponse.json();

    await logActivity(user.id, "apify_scrape", {
      level: "info",
      message: `Apify returned ${Array.isArray(profiles) ? profiles.length : 0} raw profiles. Processing...`,
    });

    if (!Array.isArray(profiles) || profiles.length === 0) {
      await logActivity(user.id, "apify_scrape", {
        level: "warning",
        message: "Apify returned 0 profiles. Actor may need different input format or no results matched.",
        success: true,
        duration: Date.now() - startTime,
      });
      return NextResponse.json({ total: 0, created: 0, skipped: 0 });
    }

    let created = 0;
    let skipped = 0;

    for (const profile of profiles) {
      const profileUrl = (profile.profileUrl || profile.url || profile.linkedinUrl || profile.link || "")
        .toLowerCase().replace(/\/$/, "").split("?")[0];
      if (!profileUrl.includes("linkedin.com/in/")) {
        skipped++;
        continue;
      }

      const slug = profileUrl.match(/linkedin\.com\/in\/([^/?]+)/i)?.[1] || null;
      const name = (profile.fullName || profile.name || `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Unknown");

      try {
        await prisma.contact.create({
          data: {
            name,
            position: profile.title || profile.headline || profile.currentJobTitle || profile.position || null,
            company: profile.companyName || profile.company || profile.currentCompany || null,
            linkedinUrl: profileUrl.replace(/^https?:\/\/(www\.)?linkedin\.com/, "https://www.linkedin.com"),
            linkedinSlug: slug,
            companyDescription: profile.about || profile.summary || null,
            source: "apify",
            userId: user.id,
          },
        });
        created++;
        await logActivity(user.id, "apify_scrape", {
          level: "success",
          message: `Saved: ${name} — ${profile.title || "?"} @ ${profile.companyName || profile.company || "?"}`,
        });
      } catch {
        skipped++;
      }
    }

    await logActivity(user.id, "apify_scrape", {
      level: "success",
      message: `Apify scrape complete: ${created} saved, ${skipped} skipped, ${profiles.length} total`,
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
