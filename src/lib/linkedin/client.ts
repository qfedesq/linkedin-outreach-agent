import { rateLimiter } from "./rate-limiter";
import type { AuthInfo } from "./types";

const VOYAGER_BASE = "https://www.linkedin.com/voyager/api";

function getHeaders(liAtCookie: string, csrfToken: string) {
  return {
    Cookie: `li_at=${liAtCookie}; JSESSIONID="${csrfToken}"`,
    "csrf-token": csrfToken,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/vnd.linkedin.normalized+json+2.1",
    "x-li-lang": "en_US",
    "x-li-track": JSON.stringify({
      clientVersion: "1.13.8839",
      mpVersion: "1.13.8839",
      osName: "web",
      timezoneOffset: 0,
      deviceFormFactor: "DESKTOP",
      mpName: "voyager-web",
    }),
    "x-restli-protocol-version": "2.0.0",
  };
}

export class LinkedInClient {
  private liAt: string;
  private csrfToken: string;

  constructor(liAt: string, csrfToken: string) {
    this.liAt = liAt;
    this.csrfToken = csrfToken;
  }

  async request(
    path: string,
    options: {
      method?: string;
      body?: Record<string, unknown>;
      rateLimitType?: string;
    } = {}
  ): Promise<Response> {
    const { method = "GET", body, rateLimitType = "global" } = options;

    await rateLimiter.acquire(rateLimitType);

    const headers: Record<string, string> = {
      ...getHeaders(this.liAt, this.csrfToken),
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const url = path.startsWith("http") ? path : `${VOYAGER_BASE}${path}`;

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 429) {
      rateLimiter.halt("LinkedIn returned 429 Too Many Requests");
      throw new Error("Rate limited by LinkedIn (429)");
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(`LinkedIn auth error: ${response.status} — cookie may be expired`);
    }

    return response;
  }

  async getJson(path: string, rateLimitType = "global"): Promise<Record<string, unknown>> {
    const response = await this.request(path, { rateLimitType });
    if (!response.ok) {
      throw new Error(`LinkedIn API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  static async validateAndInit(liAt: string): Promise<{
    csrfToken: string;
    authInfo: AuthInfo;
  }> {
    // Generate a CSRF token
    const csrfToken = `ajax:${Math.random().toString(36).substring(2, 12)}`;

    const headers = getHeaders(liAt, csrfToken);
    const response = await fetch(`${VOYAGER_BASE}/me`, { headers });

    if (!response.ok) {
      throw new Error(`LinkedIn cookie validation failed: ${response.status}`);
    }

    // Try to extract JSESSIONID from response cookies
    const setCookie = response.headers.get("set-cookie");
    let extractedCsrf = csrfToken;
    if (setCookie) {
      const match = setCookie.match(/JSESSIONID="?([^";]+)"?/);
      if (match) extractedCsrf = match[1];
    }

    const data = await response.json();

    // Extract profile info from Voyager /me response
    const included = ((data as Record<string, unknown>).included || []) as Record<string, string>[];
    const profile = included.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.entityUrn === "string" &&
        item.entityUrn.includes("miniProfile")
    );

    const authInfo: AuthInfo = {
      profileUrn: profile?.entityUrn || "",
      firstName: profile?.firstName || "",
      lastName: profile?.lastName || "",
      headline: (profile?.occupation as string) || "",
      publicIdentifier: profile?.publicIdentifier || "",
    };

    return { csrfToken: extractedCsrf, authInfo };
  }
}
