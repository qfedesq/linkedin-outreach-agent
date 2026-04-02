export interface LinkedInProfile {
  firstName: string;
  lastName: string;
  headline: string;
  locationName: string;
  industryName: string;
  summary: string;
  entityUrn: string;
  profileId: string;
  trackingId: string;
  publicIdentifier: string;
  experience: LinkedInExperience[];
  education: LinkedInEducation[];
}

export interface LinkedInExperience {
  title: string;
  companyName: string;
  locationName?: string;
  description?: string;
  timePeriod?: {
    startDate?: { month: number; year: number };
    endDate?: { month: number; year: number };
  };
}

export interface LinkedInEducation {
  schoolName: string;
  degreeName?: string;
  fieldOfStudy?: string;
}

export interface MiniProfile {
  firstName: string;
  lastName: string;
  headline: string;
  entityUrn: string;
  profileId: string;
  trackingId: string;
  publicIdentifier: string;
  occupation: string;
}

export interface InvitationResult {
  success: boolean;
  error?: string;
}

export interface SentInvitation {
  entityUrn: string;
  invitee: {
    firstName: string;
    lastName: string;
    publicIdentifier: string;
  };
  sentTime: number;
}

export interface MessageResult {
  success: boolean;
  conversationId?: string;
  error?: string;
}

export interface Conversation {
  entityUrn: string;
  conversationId: string;
  lastActivityAt: number;
  participants: ConversationParticipant[];
  lastMessage?: {
    text: string;
    senderUrn: string;
    deliveredAt: number;
  };
}

export interface ConversationParticipant {
  entityUrn: string;
  firstName: string;
  lastName: string;
  publicIdentifier: string;
}

export interface Message {
  text: string;
  senderUrn: string;
  deliveredAt: number;
}

export type ConnectionDistance = "DISTANCE_1" | "DISTANCE_2" | "DISTANCE_3" | "OUT_OF_NETWORK";

export interface ConnectionStatus {
  slug: string;
  distance: ConnectionDistance;
  followable: boolean;
}

export interface Connection {
  entityUrn: string;
  firstName: string;
  lastName: string;
  headline: string;
  publicIdentifier: string;
  connectedAt: number;
}

export interface SearchResult {
  entityUrn: string;
  firstName: string;
  lastName: string;
  headline: string;
  publicIdentifier: string;
  profileId: string;
  trackingId: string;
  location: string;
  connectionDegree: string;
}

export interface SearchFilters {
  geoUrn?: string;
  network?: string;
  industry?: string;
  title?: string;
}

export interface AuthInfo {
  profileUrn: string;
  firstName: string;
  lastName: string;
  headline: string;
  publicIdentifier: string;
}
