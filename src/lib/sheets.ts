import { google } from "googleapis";
import { decrypt } from "@/lib/encryption";

const STATUS_MAP: Record<string, string> = {
  TO_CONTACT: "To Contact",
  INVITED: "Invited",
  CONNECTED: "Connected",
  FOLLOWED_UP: "Followed Up",
  REPLIED: "Replied",
  MEETING_BOOKED: "Meeting Booked",
  UNRESPONSIVE: "Unresponsive",
};

const REVERSE_STATUS_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_MAP).map(([k, v]) => [v, k])
);

const FIT_MAP: Record<string, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const REVERSE_FIT_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(FIT_MAP).map(([k, v]) => [v, k])
);

function getAuth(serviceAccountJson: string) {
  const credentials = JSON.parse(decrypt(serviceAccountJson));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export interface SheetRow {
  name: string;
  position: string;
  company: string;
  linkedinUrl: string;
  companyDescription: string;
  connectionMessage: string;
  profileFit: string;
  status: string;
  inviteSentDate: string;
  connectedDate: string;
  followupSentDate: string;
  notes: string;
}

export async function importFromSheet(
  sheetsId: string,
  serviceAccountJson: string
): Promise<SheetRow[]> {
  const auth = getAuth(serviceAccountJson);
  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetsId,
    range: "Sheet1!A2:L",
  });

  const rows = response.data.values || [];

  return rows.map((row) => ({
    name: row[0] || "",
    position: row[1] || "",
    company: row[2] || "",
    linkedinUrl: row[3] || "",
    companyDescription: row[4] || "",
    connectionMessage: row[5] || "",
    profileFit: REVERSE_FIT_MAP[row[6]] || "MEDIUM",
    status: REVERSE_STATUS_MAP[row[7]] || "TO_CONTACT",
    inviteSentDate: row[8] || "",
    connectedDate: row[9] || "",
    followupSentDate: row[10] || "",
    notes: row[11] || "",
  }));
}

export async function exportToSheet(
  sheetsId: string,
  serviceAccountJson: string,
  rows: SheetRow[]
): Promise<void> {
  const auth = getAuth(serviceAccountJson);
  const sheets = google.sheets({ version: "v4", auth });

  // Write header
  const header = [
    "#", "Name", "Position", "Company", "LinkedIn URL",
    "Company Description", "Connection Message", "Profile Fit",
    "Status", "Invite Sent Date", "Connected Date",
    "Follow-up Sent Date", "Notes",
  ];

  const values = rows.map((row, i) => [
    i + 1,
    row.name,
    row.position,
    row.company,
    row.linkedinUrl,
    row.companyDescription,
    row.connectionMessage,
    FIT_MAP[row.profileFit] || row.profileFit,
    STATUS_MAP[row.status] || row.status,
    row.inviteSentDate,
    row.connectedDate,
    row.followupSentDate,
    row.notes,
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetsId,
    range: "Sheet1!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [header, ...values],
    },
  });
}

export async function testSheetsConnection(
  sheetsId: string,
  serviceAccountJson: string
): Promise<{ success: boolean; title?: string; error?: string }> {
  try {
    const auth = getAuth(serviceAccountJson);
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.get({
      spreadsheetId: sheetsId,
    });
    return { success: true, title: response.data.properties?.title || "" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
