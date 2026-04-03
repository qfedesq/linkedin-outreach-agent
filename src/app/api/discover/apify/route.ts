import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.apifyApiToken) return unauthorized();
  if (!user.settings.linkedinLiAt) {
    return NextResponse.json({ error: "LinkedIn cookie required for Apify scraping" }, { status: 400 });
  }

  const body = await request.json();
  const { keywords, geography, maxResults = 50 } = body;

  const token = decrypt(user.settings.apifyApiToken);
  const liAt = decrypt(user.settings.linkedinLiAt);

  try {
    // Use linkedin-people-search-scraper (searches by keywords, not URLs)
    const runResponse = await fetch(
      "https://api.apify.com/v2/acts/curious_coder~linkedin-people-search-scraper/runs?waitForFinish=180",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cookie: [{ name: "li_at", value: liAt, domain: ".linkedin.com" }],
          proxy: {
            useApifyProxy: true,
            apifyProxyGroups: ["RESIDENTIAL"],
          },
          keyword: keywords,
          location: geography || "",
          maxResults,
          deepScrape: false,
        }),
      }
    );

    if (!runResponse.ok) {
      const errBody = await runResponse.text().catch(() => "");
      return NextResponse.json(
        { error: `Apify error ${runResponse.status}: ${errBody.substring(0, 500)}` },
        { status: 500 }
      );
    }

    const runData = await runResponse.json();
    const datasetId = runData.data?.defaultDatasetId;

    if (!datasetId) {
      return NextResponse.json({ error: "No dataset returned from Apify" }, { status: 500 });
    }

    // Fetch results from dataset
    const dataResponse = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?format=json`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!dataResponse.ok) {
      return NextResponse.json({ error: `Failed to fetch results: ${dataResponse.status}` }, { status: 500 });
    }

    const profiles = await dataResponse.json();

    let created = 0;
    let skipped = 0;

    for (const profile of profiles) {
      // Handle various field names from different actor output formats
      const profileUrl = (profile.profileUrl || profile.url || profile.linkedinUrl || "").toLowerCase().replace(/\/$/, "").split("?")[0];
      if (!profileUrl.includes("linkedin.com/in/")) {
        skipped++;
        continue;
      }

      const slug = profileUrl.match(/linkedin\.com\/in\/([^/?]+)/i)?.[1] || null;
      const name = (profile.fullName || `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Unknown");

      try {
        await prisma.contact.create({
          data: {
            name,
            position: profile.title || profile.headline || profile.currentJobTitle || null,
            company: profile.companyName || profile.company || profile.currentCompany || null,
            linkedinUrl: profileUrl.replace(/^https?:\/\/(www\.)?linkedin\.com/, "https://www.linkedin.com"),
            linkedinSlug: slug,
            companyDescription: profile.companyDescription || profile.about || null,
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
