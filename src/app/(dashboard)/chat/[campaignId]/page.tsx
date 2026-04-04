"use client";

import { use } from "react";
import ChatPage from "../chat-client";

export default function CampaignChatPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = use(params);
  return <ChatPage campaignId={campaignId} />;
}
