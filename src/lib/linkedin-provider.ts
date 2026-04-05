import { decrypt } from "@/lib/encryption";
import { UnipileLinkedIn } from "@/lib/linkedin-unipile";

interface UserSettings {
  unipileApiKey?: string | null;
  unipileAccountId?: string | null;
  unipileDsn?: string | null;
}

export function createLinkedIn(settings: UserSettings): UnipileLinkedIn | null {
  if (!settings.unipileApiKey || !settings.unipileAccountId || !settings.unipileDsn) return null;

  const apiKey = decrypt(settings.unipileApiKey);
  return new UnipileLinkedIn(settings.unipileDsn, apiKey, settings.unipileAccountId);
}

export function requireLinkedIn(settings: UserSettings): UnipileLinkedIn {
  const client = createLinkedIn(settings);
  if (!client) throw new Error("Unipile not configured — go to Settings and enter your API Key, DSN, and Account ID");
  return client;
}
