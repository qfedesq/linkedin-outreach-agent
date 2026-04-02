import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";
import { LinkedInClient } from "@/lib/linkedin/client";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  let liAt = body.liAt;

  // If no liAt provided, use stored one
  if (!liAt && user.settings?.linkedinLiAt) {
    liAt = decrypt(user.settings.linkedinLiAt);
  }

  if (!liAt) {
    return NextResponse.json(
      { success: false, error: "No LinkedIn cookie provided" },
      { status: 400 }
    );
  }

  try {
    const { csrfToken, authInfo } = await LinkedInClient.validateAndInit(liAt);

    // Update settings with validated cookie info
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

    return NextResponse.json({
      success: true,
      profile: {
        name: `${authInfo.firstName} ${authInfo.lastName}`,
        headline: authInfo.headline,
        publicIdentifier: authInfo.publicIdentifier,
      },
    });
  } catch (error) {
    // Mark as invalid
    if (user.settings) {
      await prisma.userSettings.update({
        where: { userId: user.id },
        data: { linkedinCookieValid: false },
      });
    }

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Validation failed",
    });
  }
}
