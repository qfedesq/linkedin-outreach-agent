import { LinkedInClient } from "./client";
import type { InvitationResult, SentInvitation } from "./types";

export class InvitationsAPI {
  constructor(private client: LinkedInClient) {}

  async sendInvitation(
    profileId: string,
    trackingId: string,
    message: string
  ): Promise<InvitationResult> {
    try {
      const response = await this.client.request("/growth/normInvitations", {
        method: "POST",
        body: {
          emberEntityName: "growth/invitation/norm-invitation",
          invitee: {
            "com.linkedin.voyager.growth.invitation.InviteeProfile": {
              profileId,
            },
          },
          trackingId,
          message: message.substring(0, 300),
        },
        rateLimitType: "invitation",
      });

      if (response.ok || response.status === 201) {
        return { success: true };
      }

      const errorText = await response.text();
      return { success: false, error: `${response.status}: ${errorText}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getSentInvitations(
    start = 0,
    count = 100
  ): Promise<SentInvitation[]> {
    const data = await this.client.getJson(
      `/relationships/sentInvitationViewsByInvitationType?invitationType=CONNECTION&start=${start}&count=${count}`,
      "global"
    );

    const elements = (data.elements as Record<string, unknown>[]) || [];
    return elements.map((el) => {
      const invitee = (el.invitation as Record<string, unknown>)?.invitee as Record<string, unknown> | undefined;
      return {
        entityUrn: (el.entityUrn || "") as string,
        invitee: {
          firstName: ((invitee as Record<string, unknown>)?.firstName || "") as string,
          lastName: ((invitee as Record<string, unknown>)?.lastName || "") as string,
          publicIdentifier: ((invitee as Record<string, unknown>)?.publicIdentifier || "") as string,
        },
        sentTime: (el.sentTime || 0) as number,
      };
    });
  }

  async withdrawInvitation(invitationUrn: string): Promise<void> {
    const urnEncoded = encodeURIComponent(invitationUrn);
    await this.client.request(`/growth/normInvitations/${urnEncoded}`, {
      method: "DELETE",
    });
  }
}
