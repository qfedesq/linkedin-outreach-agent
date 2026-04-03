import { LinkedInClient } from "./client";
import type { MessageResult, Conversation, Message } from "./types";

export class MessagingAPI {
  constructor(private client: LinkedInClient) {}

  async sendMessage(
    recipientUrn: string,
    messageBody: string,
    senderUrn: string
  ): Promise<MessageResult> {
    try {
      const response = await this.client.request("/messaging/conversations", {
        method: "POST",
        body: {
          keyVersion: "LEGACY_INBOX",
          conversationCreate: {
            eventCreate: {
              value: {
                "com.linkedin.voyager.messaging.create.MessageCreate": {
                  attributedBody: {
                    text: messageBody,
                    attributes: [],
                  },
                  attachments: [],
                },
              },
            },
            recipients: [recipientUrn],
            subtype: "MEMBER_TO_MEMBER",
          },
        },
        rateLimitType: "message",
      });

      if (response.ok || response.status === 201) {
        const data = await response.json();
        return {
          success: true,
          conversationId: (data as Record<string, unknown>).id as string,
        };
      }

      return { success: false, error: `${response.status}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async sendMessageToConversation(
    conversationId: string,
    messageBody: string
  ): Promise<MessageResult> {
    try {
      const response = await this.client.request(
        `/messaging/conversations/${conversationId}/events`,
        {
          method: "POST",
          body: {
            eventCreate: {
              value: {
                "com.linkedin.voyager.messaging.create.MessageCreate": {
                  attributedBody: {
                    text: messageBody,
                    attributes: [],
                  },
                  attachments: [],
                },
              },
            },
          },
          rateLimitType: "message",
        }
      );

      if (response.ok || response.status === 201) {
        return { success: true, conversationId };
      }

      return { success: false, error: `${response.status}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getConversations(start = 0, count = 20): Promise<Conversation[]> {
    const data = await this.client.getJson(
      `/messaging/conversations?start=${start}&count=${count}`,
      "global"
    );

    const elements = (data.elements as Record<string, unknown>[]) || [];
    const included = (data.included as Record<string, unknown>[]) || [];

    // Build a map of mini profiles from included
    const profileMap = new Map<string, Record<string, unknown>>();
    for (const item of included) {
      if (
        typeof item.entityUrn === "string" &&
        (item.entityUrn as string).includes("miniProfile")
      ) {
        profileMap.set(item.entityUrn as string, item);
      }
    }

    return elements.map((conv) => {
      const participantRefs = (conv["*participants"] as string[]) || [];
      const events = (conv.events as Record<string, unknown>[]) || [];
      const lastEvent = events[0];

      return {
        entityUrn: (conv.entityUrn || "") as string,
        conversationId: extractConversationId(conv.entityUrn as string),
        lastActivityAt: (conv.lastActivityAt || 0) as number,
        participants: participantRefs.map((ref) => {
          const profile = profileMap.get(ref);
          return {
            entityUrn: ref,
            firstName: (profile?.firstName || "") as string,
            lastName: (profile?.lastName || "") as string,
            publicIdentifier: (profile?.publicIdentifier || "") as string,
          };
        }),
        lastMessage: lastEvent
          ? {
              text: ((lastEvent.eventContent as Record<string, unknown>)?.attributedBody as Record<string, string>)?.text || "",
              senderUrn: (lastEvent.from as Record<string, string>)?.entityUrn || "",
              deliveredAt: (lastEvent.createdAt || 0) as number,
            }
          : undefined,
      };
    });
  }

  async getConversationMessages(
    conversationId: string,
    start = 0,
    count = 20
  ): Promise<Message[]> {
    const data = await this.client.getJson(
      `/messaging/conversations/${conversationId}/events?start=${start}&count=${count}`,
      "global"
    );

    const elements = (data.elements as Record<string, unknown>[]) || [];
    return elements
      .filter((el) => el.subtype === "MEMBER_TO_MEMBER")
      .map((el) => ({
        text: ((el.eventContent as Record<string, unknown>)?.attributedBody as Record<string, string>)?.text || "",
        senderUrn: ((el.from as Record<string, unknown>)?.["com.linkedin.voyager.messaging.MessagingMember"] as Record<string, string>)?.entityUrn || "",
        deliveredAt: (el.createdAt || 0) as number,
      }));
  }
}

function extractConversationId(entityUrn: string): string {
  const match = entityUrn?.match(/conversation:(.+)$/);
  return match ? match[1] : "";
}
