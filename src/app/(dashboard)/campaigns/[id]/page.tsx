"use client";

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Trash2, Users, Send, UserCheck, Inbox } from "lucide-react";

interface Campaign {
  id: string; name: string; description: string | null;
  icpDefinition: string | null; strategyNotes: string | null;
  calendarUrl: string | null; dailyInviteLimit: number;
  followupDelayDays: number; isActive: boolean;
}

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contactCount, setContactCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then(r => r.json())
      .then(d => { setCampaign(d.campaign); setContactCount(d.contactCount || 0); })
      .catch(() => toast.error("Campaign not found"))
      .finally(() => setLoading(false));
  }, [id]);

  const save = async () => {
    if (!campaign) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaign),
      });
      if (res.ok) toast.success("Campaign saved");
      else toast.error("Failed to save");
    } catch { toast.error("Failed"); }
    finally { setSaving(false); }
  };

  const deleteCampaign = async () => {
    if (!confirm("Delete this campaign? Contacts won't be deleted.")) return;
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    toast.success("Deleted");
    window.location.href = "/chat";
  };

  if (loading) return <div className="py-20 text-center text-muted-foreground">Loading...</div>;
  if (!campaign) return <div className="py-20 text-center text-muted-foreground">Campaign not found</div>;

  const u = (field: string, value: unknown) => setCampaign(prev => prev ? { ...prev, [field]: value } : prev);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">Campaign Configuration</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={campaign.isActive ? "default" : "secondary"} className="cursor-pointer" onClick={() => u("isActive", !campaign.isActive)}>
            {campaign.isActive ? "Active" : "Paused"}
          </Badge>
          <Button variant="ghost" size="icon" onClick={deleteCampaign} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center"><Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" /><p className="text-lg font-bold">{contactCount}</p><p className="text-[10px] text-muted-foreground">Contacts</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><Send className="h-4 w-4 mx-auto mb-1 text-blue-500" /><p className="text-lg font-bold">0</p><p className="text-[10px] text-muted-foreground">Invited</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><UserCheck className="h-4 w-4 mx-auto mb-1 text-green-500" /><p className="text-lg font-bold">0</p><p className="text-[10px] text-muted-foreground">Connected</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><Inbox className="h-4 w-4 mx-auto mb-1 text-purple-500" /><p className="text-lg font-bold">0</p><p className="text-[10px] text-muted-foreground">Replied</p></CardContent></Card>
      </div>

      {/* Campaign Config */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
          <CardDescription>These settings are specific to this campaign. API keys and model are shared across all campaigns (configured in Settings).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Campaign Name</Label><Input value={campaign.name} onChange={e => u("name", e.target.value)} /></div>
            <div className="space-y-2"><Label>Calendar Booking URL</Label><Input value={campaign.calendarUrl || ""} onChange={e => u("calendarUrl", e.target.value)} placeholder="https://calendar.app.google/..." /></div>
          </div>
          <div className="space-y-2">
            <Label>Campaign Description</Label>
            <Textarea value={campaign.description || ""} onChange={e => u("description", e.target.value)} placeholder="What is this campaign about? Product, value prop, target market..." rows={3} />
          </div>
          <div className="space-y-2">
            <Label>ICP Definition (Ideal Customer Profile)</Label>
            <Textarea value={campaign.icpDefinition || ""} onChange={e => u("icpDefinition", e.target.value)}
              placeholder="TIER 1 (HIGH): Specialty lenders, RBF, invoice finance...&#10;TIER 2 (MEDIUM): SMB lending, bridge lending...&#10;TIER 3 (LOW): Digital banks, credit card issuers...&#10;&#10;TARGET ROLES: CEO, CFO, Head of Capital Markets...&#10;DISQUALIFY: Pure VC, traditional banks..."
              rows={6} />
            <p className="text-[10px] text-muted-foreground">The agent uses this to score contacts as HIGH/MEDIUM/LOW fit. Be specific about industries, roles, and signals.</p>
          </div>
          <div className="space-y-2">
            <Label>Strategy Notes (agent reads these)</Label>
            <Textarea value={campaign.strategyNotes || ""} onChange={e => u("strategyNotes", e.target.value)}
              placeholder="Messaging tone, what to emphasize, what to avoid...&#10;Example: Be casual, mention specific company details, never use 'I came across your profile'..."
              rows={4} />
            <p className="text-[10px] text-muted-foreground">The agent reads these notes when generating messages. Update them as you learn what works.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Daily Invite Limit</Label><Input type="number" value={campaign.dailyInviteLimit} onChange={e => u("dailyInviteLimit", parseInt(e.target.value) || 20)} /></div>
            <div className="space-y-2"><Label>Follow-up Delay (days)</Label><Input type="number" value={campaign.followupDelayDays} onChange={e => u("followupDelayDays", parseInt(e.target.value) || 3)} /></div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving} size="lg" className="w-full">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Campaign
      </Button>
    </div>
  );
}
