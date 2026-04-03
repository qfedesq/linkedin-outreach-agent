import { prisma } from "@/lib/prisma";

export type LogLevel = "info" | "success" | "warning" | "error" | "debug";

export async function logActivity(
  userId: string,
  action: string,
  details: {
    contactId?: string;
    level?: LogLevel;
    message: string;
    request?: Record<string, unknown>;
    response?: Record<string, unknown>;
    success?: boolean;
    errorCode?: string;
    duration?: number;
  }
) {
  try {
    await prisma.executionLog.create({
      data: {
        action,
        contactId: details.contactId || null,
        request: details.message + (details.request ? ` | ${JSON.stringify(details.request)}` : ""),
        response: details.response ? JSON.stringify(details.response) : null,
        success: details.success ?? true,
        errorCode: details.errorCode || null,
        duration: details.duration || null,
        userId,
      },
    });
  } catch {
    // Don't let logging failures break the app
  }
}
