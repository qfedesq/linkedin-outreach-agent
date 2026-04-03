import { decrypt } from "@/lib/encryption";
import { UnipileLinkedIn } from "@/lib/linkedin-unipile";

const UNIPILE_DSN = "https://api17.unipile.com:14777";

interface UserSettings {
  unipileApiKey?: string | null;
  unipileAccountId?: string | null;
}

export function createLinkedIn(settings: UserSettings): UnipileLinkedIn | null {
  if (!settings.unipileApiKey || !settings.unipileAccountId) return null;

  const apiKey = decrypt(settings.unipileApiKey);
  return new UnipileLinkedIn(UNIPILE_DSN, apiKey, settings.unipileAccountId);
}

export function requireLinkedIn(settings: UserSettings): UnipileLinkedIn {
  const client = createLinkedIn(settings);
  if (!client) throw new Error("Unipile not configured — go to Settings to connect LinkedIn");
  return client;
}
