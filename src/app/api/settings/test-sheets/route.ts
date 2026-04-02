import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { testSheetsConnection } from "@/lib/sheets";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const sheetsId = body.sheetsId || user.settings?.googleSheetsId;
  const serviceAccount = body.serviceAccount || user.settings?.googleServiceAccount;

  if (!sheetsId || !serviceAccount) {
    return NextResponse.json(
      { success: false, error: "Missing Sheets ID or service account" },
      { status: 400 }
    );
  }

  const result = await testSheetsConnection(sheetsId, serviceAccount);
  return NextResponse.json(result);
}
