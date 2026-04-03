import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";
import { LinkedInClient } from "@/lib/linkedin/client";
import { logActivity } from "@/lib/activity-log";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  let liAt = body.liAt;

  if (!liAt && user.settings?.linkedinLiAt) {
    liAt = decrypt(user.settings.linkedinLiAt);
  }

  if (!liAt) {
    return NextResponse.json({ success: false, error: "No LinkedIn cookie provided" }, { status: 400 });
  }

  await logActivity(user.id, "test_linkedin", {
    level: "info",
    message: "Testing LinkedIn cookie validity...",
  });

  try {
    const { csrfToken, authInfo } = await LinkedInClient.validateAndInit(liAt);

    await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: {
        linkedinLiAt: encrypt(liAt),
        linkedinCsrfToken: encrypt(csrfToken),
        linkedinProfileUrn: authInfo.profileUrn,
        linkedinCookieValid: true,
        linkedinLastValidated: new Date(),
      },
      create: {
        userId: user.id,
        linkedinLiAt: encrypt(liAt),
        linkedinCsrfToken: encrypt(csrfToken),
        linkedinProfileUrn: authInfo.profileUrn,
        linkedinCookieValid: true,
        linkedinLastValidated: new Date(),
      },
    });

    await logActivity(user.id, "test_linkedin", {
      level: "success",
      message: `LinkedIn connected as ${authInfo.firstName} ${authInfo.lastName} (${authInfo.publicIdentifier})`,
      success: true,
    });

    return NextResponse.json({
      success: true,
      profile: {
        name: `${authInfo.firstName} ${authInfo.lastName}`,
        headline: authInfo.headline,
        publicIdentifier: authInfo.publicIdentifier,
      },
    });
  } catch (error) {
    if (user.settings) {
      await prisma.userSettings.update({
        where: { userId: user.id },
        data: { linkedinCookieValid: false },
      });
    }

    await logActivity(user.id, "test_linkedin", {
      level: "error",
      message: `LinkedIn test failed: ${(error as Error).message}`,
      success: false,
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Validation failed",
    });
  }
}
