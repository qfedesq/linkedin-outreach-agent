import { LinkedInClient } from "./client";
import type { SearchResult } from "./types";

export class SearchAPI {
  constructor(private client: LinkedInClient) {}

  async searchPeople(
    keywords: string,
    start = 0,
    count = 10
  ): Promise<SearchResult[]> {
    // Build the search URL — encode the entire query parameter
    const searchUrl = `/search/dash/clusters`
      + `?decorationId=com.linkedin.voyager.dash.deco.search.SearchClusterCollection-175`
      + `&origin=GLOBAL_SEARCH_HEADER`
      + `&q=all`
      + `&query=(keywords:${encodeURIComponent(keywords)},filters:List((key:resultType,value:List(PEOPLE))))`
      + `&start=${start}`
      + `&count=${count}`;

    const response = await this.client.request(searchUrl, { rateLimitType: "search" });

    if (!response.ok) {
      throw new Error(`LinkedIn search returned ${response.status}`);
    }

    let data: Record<string, unknown>;
    try {
      data = await response.json();
    } catch {
      throw new Error("LinkedIn search returned non-JSON response");
    }

    const included = (data.included as Record<string, unknown>[]) || [];

    // Extract miniProfiles
    const miniProfiles = included.filter(
      (item) =>
        typeof item.entityUrn === "string" &&
        (item.entityUrn as string).includes("miniProfile")
    );

    return miniProfiles.map((profile) => ({
      entityUrn: (profile.entityUrn || "") as string,
      firstName: (profile.firstName || "") as string,
      lastName: (profile.lastName || "") as string,
      headline: (profile.occupation || profile.headline || "") as string,
      publicIdentifier: (profile.publicIdentifier || "") as string,
      profileId: extractProfileId(profile.entityUrn as string),
      trackingId: (profile.trackingId || "") as string,
      location: (profile.locationName || "") as string,
      connectionDegree: "",
    }));
  }
}

function extractProfileId(entityUrn: string): string {
  const match = entityUrn?.match(/miniProfile:(.+)$/);
  return match ? match[1] : "";
}
