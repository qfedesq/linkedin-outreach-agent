import { LinkedInClient } from "./client";
import type { SearchResult, SearchFilters } from "./types";

export class SearchAPI {
  constructor(private client: LinkedInClient) {}

  async searchPeople(
    keywords: string,
    filters?: SearchFilters,
    start = 0,
    count = 10
  ): Promise<SearchResult[]> {
    const filterParts: string[] = [
      "(key:resultType,value:List(PEOPLE))",
    ];

    if (filters?.network) {
      filterParts.push(`(key:network,value:List(${filters.network}))`);
    }
    if (filters?.geoUrn) {
      filterParts.push(`(key:geoUrn,value:List(${filters.geoUrn}))`);
    }
    if (filters?.industry) {
      filterParts.push(`(key:industry,value:List(${filters.industry}))`);
    }

    const filtersStr = filterParts.join(",");
    const query = encodeURIComponent(keywords);

    // Try the standard search endpoint
    const data = await this.client.getJson(
      `/search/dash/clusters?decorationId=com.linkedin.voyager.dash.deco.search.SearchClusterCollection-175&origin=GLOBAL_SEARCH_HEADER&q=all&query=(keywords:${query},filters:List(${filtersStr}))&start=${start}&count=${count}`,
      "search"
    );

    // Extract miniProfiles from the included array
    const included = (data.included as Record<string, unknown>[]) || [];

    const miniProfiles = included.filter(
      (item) =>
        typeof item.entityUrn === "string" &&
        (item.entityUrn as string).includes("miniProfile")
    );

    // If no miniProfiles found, try extracting from different response structures
    if (miniProfiles.length === 0) {
      // Some Voyager responses nest profiles differently
      const elements = (data.elements as Record<string, unknown>[]) || [];
      for (const el of elements) {
        const items = (el.items as Record<string, unknown>[]) || [];
        for (const item of items) {
          const entity = item.entity as Record<string, unknown> | undefined;
          if (entity && typeof entity.entityUrn === "string" && (entity.entityUrn as string).includes("miniProfile")) {
            miniProfiles.push(entity);
          }
        }
      }
    }

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
