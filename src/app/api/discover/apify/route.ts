import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.apifyApiToken) return unauthorized();

  const body = await request.json();
  const { keywords, geography, maxResults = 50 } = body;

  const token = decrypt(user.settings.apifyApiToken);

  try {
    // Start Apify actor run
    const runResponse = await fetch(
      "https://api.apify.com/v2/acts/curious_coder~linkedin-profile-scraper/runs?waitForFinish=120",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          searchKeywords: keywords,
          maxResults,
          location: geography || "",
        }),
      }
    );

    if (!runResponse.ok) {
      return NextResponse.json({ error: `Apify error: ${runResponse.status}` }, { status: 500 });
    }

    const runData = await runResponse.json();
    const datasetId = runData.data?.defaultDatasetId;

    if (!datasetId) {
      return NextResponse.json({ error: "No dataset returned" }, { status: 500 });
    }

    // Fetch results
    const dataResponse = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?format=json`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const profiles = await dataResponse.json();

    let created = 0;
    let skipped = 0;

    for (const profile of profiles) {
      const linkedinUrl = (profile.url || profile.linkedinUrl || "").toLowerCase().replace(/\/$/, "").split("?")[0];
      if (!linkedinUrl.includes("linkedin.com/in/")) {
        skipped++;
        continue;
      }

      const slug = linkedinUrl.match(/linkedin\.com\/in\/([^/?]+)/i)?.[1] || null;

      try {
        await prisma.contact.create({
          data: {
            name: `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || profile.fullName || "Unknown",
            position: profile.title || profile.headline || null,
            company: profile.companyName || profile.company || null,
            linkedinUrl: linkedinUrl.replace(/^https?:\/\/(www\.)?linkedin\.com/, "https://www.linkedin.com"),
            linkedinSlug: slug,
            companyDescription: profile.companyDescription || null,
            source: "apify",
            userId: user.id,
          },
        });
        created++;
      } catch {
        skipped++;
      }
    }

    return NextResponse.json({ total: profiles.length, created, skipped });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
