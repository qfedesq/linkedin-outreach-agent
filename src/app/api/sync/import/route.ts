import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { importFromSheet } from "@/lib/sheets";

export async function POST() {
  const user = await getAuthUser();
  if (!user?.settings?.googleSheetsId || !user.settings.googleServiceAccount) {
    return unauthorized();
  }

  try {
    const rows = await importFromSheet(
      user.settings.googleSheetsId,
      user.settings.googleServiceAccount
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row.linkedinUrl) {
        skipped++;
        continue;
      }

      const normalizedUrl = row.linkedinUrl.toLowerCase().replace(/\/$/, "").split("?")[0];
      const slug = normalizedUrl.match(/linkedin\.com\/in\/([^/?]+)/i)?.[1] || null;

      const existing = await prisma.contact.findFirst({
        where: { linkedinUrl: normalizedUrl, userId: user.id },
      });

      if (existing) {
        await prisma.contact.update({
          where: { id: existing.id },
          data: {
            name: row.name || existing.name,
            position: row.position || existing.position,
            company: row.company || existing.company,
            companyDescription: row.companyDescription || existing.companyDescription,
            connectionMessage: row.connectionMessage || existing.connectionMessage,
            profileFit: row.profileFit || existing.profileFit,
            status: row.status || existing.status,
            notes: row.notes || existing.notes,
          },
        });
        updated++;
      } else {
        try {
          await prisma.contact.create({
            data: {
              name: row.name,
              position: row.position || null,
              company: row.company || null,
              linkedinUrl: normalizedUrl,
              linkedinSlug: slug,
              companyDescription: row.companyDescription || null,
              connectionMessage: row.connectionMessage || null,
              profileFit: row.profileFit || "MEDIUM",
              status: row.status || "TO_CONTACT",
              notes: row.notes || null,
              source: "sheets",
              userId: user.id,
            },
          });
          created++;
        } catch {
          skipped++;
        }
      }
    }

    return NextResponse.json({ total: rows.length, created, updated, skipped });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
