"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ChatCampaignRedirect({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = use(params);
  const router = useRouter();
  useEffect(() => { router.replace(`/dashboard/${campaignId}`); }, [router, campaignId]);
  return null;
}
