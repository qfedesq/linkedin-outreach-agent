export { LinkedInClient } from "./client";
export { ProfilesAPI } from "./profiles";
export { InvitationsAPI } from "./invitations";
export { MessagingAPI } from "./messaging";
export { ConnectionsAPI } from "./connections";
export { SearchAPI } from "./search";
export { rateLimiter } from "./rate-limiter";
export * from "./types";

import { LinkedInClient } from "./client";
import { ProfilesAPI } from "./profiles";
import { InvitationsAPI } from "./invitations";
import { MessagingAPI } from "./messaging";
import { ConnectionsAPI } from "./connections";
import { SearchAPI } from "./search";

export function createLinkedInAPI(liAt: string, csrfToken: string) {
  const client = new LinkedInClient(liAt, csrfToken);
  return {
    client,
    profiles: new ProfilesAPI(client),
    invitations: new InvitationsAPI(client),
    messaging: new MessagingAPI(client),
    connections: new ConnectionsAPI(client),
    search: new SearchAPI(client),
  };
}
