import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.email !== "federico.ledesma@protofire.io") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const limit = Math.min(parseInt(searchParams.get("limit") || "150"), 300);
  const offset = parseInt(searchParams.get("offset") || "0");
  const type = searchParams.get("type") || "all"; // "all" | "chat" | "execution" | "errors"

  // Fetch from both tables in parallel
  const [chatMessages, execLogs] = await Promise.all([
    type === "execution" || type === "errors" ? Promise.resolve([]) :
      prisma.chatMessage.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 500, // fetch plenty, we'll merge and trim
      }),
    type === "chat" ? Promise.resolve([]) :
      prisma.executionLog.findMany({
        where: {
          userId,
          ...(type === "errors" ? { success: false } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
  ]);

  // Normalize to unified timeline events
  type TimelineEvent =
    | {
        type: "chat";
        id: string;
        createdAt: Date;
        role: string;
        content: string;
        campaignId: string | null;
      }
    | {
        type: "execution";
        id: string;
        createdAt: Date;
        action: string;
        request: string | null;
        response: string | null;
        success: boolean;
        errorCode: string | null;
        duration: number | null;
        contactId: string | null;
      };

  const chatEvents: TimelineEvent[] = chatMessages.map((m) => ({
    type: "chat" as const,
    id: m.id,
    createdAt: m.createdAt,
    role: m.role,
    content: m.content,
    campaignId: m.campaignId,
  }));

  const execEvents: TimelineEvent[] = execLogs.map((e) => ({
    type: "execution" as const,
    id: e.id,
    createdAt: e.createdAt,
    action: e.action,
    request: e.request,
    response: e.response,
    success: e.success,
    errorCode: e.errorCode,
    duration: e.duration,
    contactId: e.contactId,
  }));

  // Merge and sort by createdAt desc
  const allEvents = [...chatEvents, ...execEvents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const total = allEvents.length;
  const paginated = allEvents.slice(offset, offset + limit);

  return NextResponse.json({ events: paginated, total, limit, offset });
}
