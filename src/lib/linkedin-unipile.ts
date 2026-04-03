/**
 * Unipile LinkedIn API Client
 *
 * Wraps the Unipile REST API for persistent LinkedIn operations.
 * Replaces direct Voyager API calls that fail from cloud servers.
 *
 * Setup:
 * 1. Sign up at unipile.com
 * 2. Connect a LinkedIn account via the Unipile dashboard
 * 3. Get your DSN (e.g. api4.unipile.com:13441) and Access Token
 * 4. Save both in Settings
 */

export class UnipileLinkedIn {
  private baseUrl: string;
  private apiKey: string;
  private accountId: string;

  constructor(dsn: string, apiKey: string, accountId?: string) {
    this.baseUrl = dsn.startsWith("https://") ? dsn : `https://${dsn}`;
    this.apiKey = apiKey;
    this.accountId = accountId || "";
  }

  private async request(path: string, options: { method?: string; body?: unknown } = {}) {
    const { method = "GET", body } = options;
    const headers: Record<string, string> = {
      "X-API-KEY": this.apiKey,
      Accept: "application/json",
    };
    if (body) headers["Content-Type"] = "application/json";

    const response = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Unipile ${response.status}: ${error.title || error.message || JSON.stringify(error)}`);
    }

    return response.json();
  }

  /** List connected accounts */
  async getAccounts() {
    return this.request("/accounts");
  }

  /** Get a LinkedIn user's profile */
  async getProfile(identifier: string) {
    return this.request(`/users/${identifier}?account_id=${this.accountId}`);
  }

  /** Send a LinkedIn connection invitation */
  async sendInvitation(providerProfileId: string, message?: string) {
    return this.request("/users/invite", {
      method: "POST",
      body: {
        account_id: this.accountId,
        provider_id: providerProfileId,
        message: message || undefined,
      },
    });
  }

  /** Start a new chat (send first message to a connection) */
  async sendMessage(recipientProviderIds: string[], text: string) {
    return this.request("/chats", {
      method: "POST",
      body: {
        account_id: this.accountId,
        attendees_ids: recipientProviderIds,
        text,
      },
    });
  }

  /** Send a message in an existing chat */
  async sendMessageToChat(chatId: string, text: string) {
    return this.request(`/chats/${chatId}/messages`, {
      method: "POST",
      body: { text },
    });
  }

  /** Get all chats (inbox) */
  async getChats(limit = 50) {
    return this.request(`/chats?account_id=${this.accountId}&limit=${limit}`);
  }

  /** Get messages from a specific chat */
  async getChatMessages(chatId: string) {
    return this.request(`/chats/${chatId}/messages`);
  }

  /** Search LinkedIn people (via Unipile) */
  async searchPeople(query: string, limit = 10) {
    return this.request(`/linkedin/search?account_id=${this.accountId}&q=${encodeURIComponent(query)}&limit=${limit}&category=people`);
  }

  /** Get own profile */
  async getOwnProfile() {
    return this.request(`/users/me?account_id=${this.accountId}`);
  }

  /** Test connection — returns true if API key and account are valid */
  async testConnection(): Promise<{ success: boolean; profile?: string; error?: string }> {
    try {
      const accounts = await this.getAccounts();
      if (accounts?.items?.length > 0) {
        const account = accounts.items.find((a: { id: string }) => a.id === this.accountId) || accounts.items[0];
        return {
          success: true,
          profile: account.name || account.identifier || "Connected",
        };
      }
      return { success: true, profile: "Connected (no accounts found)" };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}
