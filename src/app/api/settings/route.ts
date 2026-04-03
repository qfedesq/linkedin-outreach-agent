import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const settings = user.settings;
  if (!settings) {
    return NextResponse.json({});
  }

  // If ?reveal=true, decrypt and return actual values (for the eye toggle)
  const reveal = request.nextUrl.searchParams.get("reveal") === "true";

  if (reveal) {
    return NextResponse.json({
      linkedinLiAt: settings.linkedinLiAt ? decrypt(settings.linkedinLiAt) : null,
      linkedinCookieValid: settings.linkedinCookieValid,
      linkedinLastValidated: settings.linkedinLastValidated,
      linkedinProfileUrn: settings.linkedinProfileUrn,
      apifyApiToken: settings.apifyApiToken ? decrypt(settings.apifyApiToken) : null,
      openrouterApiKey: settings.openrouterApiKey ? decrypt(settings.openrouterApiKey) : null,
      googleSheetsId: settings.googleSheetsId,
      googleServiceAccount: settings.googleServiceAccount ? decrypt(settings.googleServiceAccount) : null,
      calendarBookingUrl: settings.calendarBookingUrl,
      preferredModel: settings.preferredModel,
    });
  }

  return NextResponse.json({
    linkedinLiAt: settings.linkedinLiAt ? "••••••••" : null,
    linkedinCookieValid: settings.linkedinCookieValid,
    linkedinLastValidated: settings.linkedinLastValidated,
    linkedinProfileUrn: settings.linkedinProfileUrn,
    apifyApiToken: settings.apifyApiToken ? "••••••••" : null,
    openrouterApiKey: settings.openrouterApiKey ? "••••••••" : null,
    googleSheetsId: settings.googleSheetsId,
    googleServiceAccount: settings.googleServiceAccount ? "••••••••" : null,
    calendarBookingUrl: settings.calendarBookingUrl,
    preferredModel: settings.preferredModel,
  });
}

export async function PUT(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (body.linkedinLiAt !== undefined && body.linkedinLiAt !== "••••••••") {
    data.linkedinLiAt = body.linkedinLiAt ? encrypt(body.linkedinLiAt) : null;
    if (!body.linkedinLiAt) {
      data.linkedinCookieValid = false;
      data.linkedinCsrfToken = null;
      data.linkedinProfileUrn = null;
    }
  }
  if (body.apifyApiToken !== undefined && body.apifyApiToken !== "••••••••") {
    data.apifyApiToken = body.apifyApiToken ? encrypt(body.apifyApiToken) : null;
  }
  if (body.openrouterApiKey !== undefined && body.openrouterApiKey !== "••••••••") {
    data.openrouterApiKey = body.openrouterApiKey ? encrypt(body.openrouterApiKey) : null;
  }
  if (body.googleSheetsId !== undefined) {
    data.googleSheetsId = body.googleSheetsId || null;
  }
  if (body.googleServiceAccount !== undefined && body.googleServiceAccount !== "••••••••") {
    data.googleServiceAccount = body.googleServiceAccount
      ? encrypt(body.googleServiceAccount)
      : null;
  }
  if (body.calendarBookingUrl !== undefined) {
    data.calendarBookingUrl = body.calendarBookingUrl;
  }
  if (body.preferredModel !== undefined) {
    data.preferredModel = body.preferredModel;
  }

  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data } as Record<string, unknown> & { userId: string },
  });

  return NextResponse.json({ success: true });
}
