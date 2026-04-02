import { LinkedInClient } from "./client";
import type { LinkedInProfile, MiniProfile } from "./types";

export class ProfilesAPI {
  constructor(private client: LinkedInClient) {}

  async getProfile(slug: string): Promise<LinkedInProfile> {
    const data = await this.client.getJson(
      `/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(slug)}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`,
      "profile"
    );

    const included = (data.included as Record<string, unknown>[]) || [];

    const profileEntity = included.find(
      (item) =>
        typeof item.entityUrn === "string" &&
        (item.entityUrn as string).includes("fsd_profile")
    ) as Record<string, unknown> | undefined;

    const miniProfileEntity = included.find(
      (item) =>
        typeof item.entityUrn === "string" &&
        (item.entityUrn as string).includes("miniProfile")
    ) as Record<string, unknown> | undefined;

    const experiences = included.filter(
      (item) =>
        typeof item.entityUrn === "string" &&
        (item.entityUrn as string).includes("position")
    );

    const educations = included.filter(
      (item) =>
        typeof item.entityUrn === "string" &&
        (item.entityUrn as string).includes("education")
    );

    const profile: LinkedInProfile = {
      firstName: (profileEntity?.firstName || miniProfileEntity?.firstName || "") as string,
      lastName: (profileEntity?.lastName || miniProfileEntity?.lastName || "") as string,
      headline: (profileEntity?.headline || miniProfileEntity?.occupation || "") as string,
      locationName: (profileEntity?.locationName || "") as string,
      industryName: (profileEntity?.industryName || "") as string,
      summary: (profileEntity?.summary || "") as string,
      entityUrn: (miniProfileEntity?.entityUrn || "") as string,
      profileId: extractProfileId(miniProfileEntity?.entityUrn as string),
      trackingId: (miniProfileEntity?.trackingId || "") as string,
      publicIdentifier: (miniProfileEntity?.publicIdentifier || slug) as string,
      experience: experiences.map((exp) => ({
        title: (exp.title || "") as string,
        companyName: (exp.companyName || "") as string,
        locationName: (exp.locationName || "") as string,
        description: (exp.description || "") as string,
        timePeriod: exp.timePeriod as LinkedInProfile["experience"][0]["timePeriod"],
      })),
      education: educations.map((edu) => ({
        schoolName: (edu.schoolName || "") as string,
        degreeName: (edu.degreeName || "") as string,
        fieldOfStudy: (edu.fieldOfStudy || "") as string,
      })),
    };

    return profile;
  }

  async getMiniProfile(slug: string): Promise<MiniProfile> {
    const data = await this.client.getJson(
      `/identity/profiles/${encodeURIComponent(slug)}/profileView`,
      "profile"
    );

    const included = (data.included as Record<string, unknown>[]) || [];
    const mini = included.find(
      (item) =>
        typeof item.entityUrn === "string" &&
        (item.entityUrn as string).includes("miniProfile")
    ) as Record<string, unknown> | undefined;

    return {
      firstName: (mini?.firstName || "") as string,
      lastName: (mini?.lastName || "") as string,
      headline: (mini?.occupation || "") as string,
      entityUrn: (mini?.entityUrn || "") as string,
      profileId: extractProfileId(mini?.entityUrn as string),
      trackingId: (mini?.trackingId || "") as string,
      publicIdentifier: (mini?.publicIdentifier || slug) as string,
      occupation: (mini?.occupation || "") as string,
    };
  }
}

function extractProfileId(entityUrn: string | undefined): string {
  if (!entityUrn) return "";
  const match = entityUrn.match(/miniProfile:(.+)$/);
  return match ? match[1] : "";
}
