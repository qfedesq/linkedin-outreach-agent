import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

export const maxDuration = 180; // Apify actor can take up to 3 min

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.apifyApiToken) return unauthorized();

  const body = await request.json();
  const { keywords, geography, maxResults = 25 } = body;

  const token = decrypt(user.settings.apifyApiToken);

  try {
    // Use free linkedin-profile-search actor (no cookies required)
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
