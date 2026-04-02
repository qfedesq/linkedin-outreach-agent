import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { exportToSheet } from "@/lib/sheets";

export async function POST() {
  const user = await getAuthUser();
  if (!user?.settings?.googleSheetsId || !user.settings.googleServiceAccount) {
    return unauthorized();
  }

  try {
    const contacts = await prisma.contact.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    const rows = contacts.map((c) => ({
      name: c.name,
      position: c.position || "",
      company: c.company || "",
      linkedinUrl: c.linkedinUrl,
      companyDescription: c.companyDescription || "",
      connectionMessage: c.connectionMessage || "",
      profileFit: c.profileFit,
      status: c.status,
      inviteSentDate: c.inviteSentDate?.toISOString().split("T")[0] || "",
      connectedDate: c.connectedDate?.toISOString().split("T")[0] || "",
      followupSentDate: c.followupSentDate?.toISOString().split("T")[0] || "",
      notes: c.notes || "",
    }));

    await exportToSheet(
      user.settings.googleSheetsId,
      user.settings.googleServiceAccount,
      rows
    );

    return NextResponse.json({ exported: contacts.length });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
