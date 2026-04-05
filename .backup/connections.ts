import { LinkedInClient } from "./client";
import type { ConnectionStatus, ConnectionDistance, Connection } from "./types";

export class ConnectionsAPI {
  constructor(private client: LinkedInClient) {}

  async getConnectionStatus(slug: string): Promise<ConnectionStatus> {
    const data = await this.client.getJson(
      `/identity/profiles/${encodeURIComponent(slug)}/networkinfo`,
      "profile"
    );

    const d = data as Record<string, unknown>;
    const distObj = d.distance as Record<string, string> | string | undefined;
    const distValue = typeof distObj === "object" && distObj !== null ? distObj.value : distObj;
    return {
      slug,
      distance: (distValue || "OUT_OF_NETWORK") as ConnectionDistance,
      followable: Boolean(d.followable),
    };
  }

  async batchCheckConnections(
    slugs: string[]
  ): Promise<Map<string, ConnectionStatus>> {
    const results = new Map<string, ConnectionStatus>();
    for (const slug of slugs) {
      try {
        const status = await this.getConnectionStatus(slug);
        results.set(slug, status);
      } catch {
        results.set(slug, {
          slug,
          distance: "OUT_OF_NETWORK",
          followable: false,
        });
      }
    }
    return results;
  }

  async getConnections(start = 0, count = 40): Promise<Connection[]> {
    const data = await this.client.getJson(
      `/relationships/dash/connections?start=${start}&count=${count}&sortType=RECENTLY_ADDED`,
      "global"
    );

    const elements = (data.elements as Record<string, unknown>[]) || [];
    const included = (data.included as Record<string, unknown>[]) || [];

    const profileMap = new Map<string, Record<string, unknown>>();
    for (const item of included) {
      if (
        typeof item.entityUrn === "string" &&
        (item.entityUrn as string).includes("miniProfile")
      ) {
        profileMap.set(item.entityUrn as string, item);
      }
    }

    return elements.map((conn) => {
      const profileRef = conn["*connectedMemberResolutionResult"] as string;
      const profile = profileMap.get(profileRef);
      return {
        entityUrn: (conn.entityUrn || "") as string,
        firstName: (profile?.firstName || "") as string,
        lastName: (profile?.lastName || "") as string,
        headline: (profile?.occupation || "") as string,
        publicIdentifier: (profile?.publicIdentifier || "") as string,
        connectedAt: (conn.createdAt || 0) as number,
      };
    });
  }
}
