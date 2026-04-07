"use client";

import { use } from "react";
import DashboardPage from "../dashboard-client";

export default function CampaignDashboardPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = use(params);
  return <DashboardPage campaignId={campaignId} />;
}
