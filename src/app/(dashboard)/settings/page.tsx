"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Eye, EyeOff, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface Settings {
  unipileApiKey: string;
  unipileAccountId: string;
  apifyApiToken: string;
  openrouterApiKey: string;
  preferredModel: string;
  calendarBookingUrl: string;
  campaignName: string;
  campaignDescription: string;
  icpDefinition: string;
  strategyNotes: string;
  dailyInviteLimit: number;
  followupDelayDays: number;
  autopilotEnabled: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    unipileApiKey: "", unipileAccountId: "",
    apifyApiToken: "", openrouterApiKey: "",
    preferredModel: "anthropic/claude-sonnet-4",
    calendarBookingUrl: "https://calendar.app.google/k8XEhkPnX6sc2GdW9",
    campaignName: "Sky Protocol $100M Facility",
    campaignDescription: "", icpDefinition: "", strategyNotes: "",
    dailyInviteLimit: 20, followupDelayDays: 3, autopilotEnabled: false,
  });
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings?reveal=true")
      .then(r => r.json())
      .then(data => setSettings(prev => ({ ...prev, ...data })))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) toast.success("Settings saved");
      else toast.error("Failed to save");
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const testService = async (id: string, url: string) => {
    setTesting(p => ({ ...p, [id]: true }));
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      setTestResults(p => ({ ...p, [id]: { success: data.success, message: data.success ? (data.profile?.name || data.profile || "Connected") : data.error } }));
    } catch { setTestResults(p => ({ ...p, [id]: { success: false, message: "Failed" } })); }
    finally { setTesting(p => ({ ...p, [id]: false })); }
  };

  const toggle = (k: string) => setShowSecrets(p => ({ ...p, [k]: !p[k] }));

  const SecretInput = ({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type={showSecrets[id] ? "text" : "password"} value={value || ""} onChange={e => onChange(e.target.value)} className="pr-10" />
        <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => toggle(id)}>
          {showSecrets[id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );

  const TestResult = ({ id }: { id: string }) => {
    const r = testResults[id]; if (!r) return null;
    return <div className={`flex items-center gap-2 text-sm ${r.success ? "text-green-500" : "text-red-500"}`}>
      {r.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{r.message}
    </div>;
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure services and campaign parameters</p>
      </div>

      {/* LinkedIn via Unipile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            LinkedIn Connection
            {testResults.linkedin?.success && <Badge className="bg-success/10 text-success border-success/20">Connected</Badge>}
          </CardTitle>
          <CardDescription>Powered by Unipile — persistent session, no manual cookie refresh needed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SecretInput id="unipileApiKey" label="Unipile API Key" value={settings.unipileApiKey || ""} onChange={v => setSettings(p => ({ ...p, unipileApiKey: v }))} />
          <div className="space-y-2">
            <Label>Account ID</Label>
            <Input value={settings.unipileAccountId || ""} onChange={e => setSettings(p => ({ ...p, unipileAccountId: e.target.value }))} placeholder="e.g., CNyD9GLrR5WUtv1UuWbGrQ" />
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={() => testService("linkedin", "/api/settings/test-linkedin")} disabled={testing.linkedin} size="sm">
              {testing.linkedin && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Test Connection
            </Button>
            <TestResult id="linkedin" />
          </div>
        </CardContent>
      </Card>

      {/* Apify */}
      <Card>
        <CardHeader><CardTitle>Apify</CardTitle><CardDescription>Prospect discovery via LinkedIn scraping</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <SecretInput id="apifyApiToken" label="API Token" value={settings.apifyApiToken || ""} onChange={v => setSettings(p => ({ ...p, apifyApiToken: v }))} />
          <div className="flex items-center gap-4">
            <Button onClick={() => testService("apify", "/api/settings/test-apify")} disabled={testing.apify} size="sm">
              {testing.apify && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Test Connection
            </Button>
            <TestResult id="apify" />
          </div>
        </CardContent>
      </Card>

      {/* OpenRouter */}
      <Card>
        <CardHeader><CardTitle>OpenRouter</CardTitle><CardDescription>LLM for message personalization and ICP scoring</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <SecretInput id="openrouterApiKey" label="API Key" value={settings.openrouterApiKey || ""} onChange={v => setSettings(p => ({ ...p, openrouterApiKey: v }))} />
          <div className="space-y-2">
            <Label>Preferred Model</Label>
            <Input value={settings.preferredModel} onChange={e => setSettings(p => ({ ...p, preferredModel: e.target.value }))} />
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={() => testService("openrouter", "/api/settings/test-openrouter")} disabled={testing.openrouter} size="sm">
              {testing.openrouter && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Test Connection
            </Button>
            <TestResult id="openrouter" />
          </div>
        </CardContent>
      </Card>

      {/* Campaign Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign</CardTitle>
          <CardDescription>Define your outreach campaign. The agent uses these to personalize messages.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Campaign Name</Label><Input value={settings.campaignName} onChange={e => setSettings(p => ({ ...p, campaignName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Calendar Booking URL</Label><Input value={settings.calendarBookingUrl} onChange={e => setSettings(p => ({ ...p, calendarBookingUrl: e.target.value }))} /></div>
          </div>
          <div className="space-y-2"><Label>Campaign Description</Label><Textarea value={settings.campaignDescription || ""} onChange={e => setSettings(p => ({ ...p, campaignDescription: e.target.value }))} placeholder="Brief description of the campaign..." rows={3} /></div>
          <div className="space-y-2"><Label>ICP Definition</Label><Textarea value={settings.icpDefinition || ""} onChange={e => setSettings(p => ({ ...p, icpDefinition: e.target.value }))} placeholder="Industries, roles, company sizes, signals..." rows={3} /></div>
          <div className="space-y-2"><Label>Strategy Notes (agent reads these)</Label><Textarea value={settings.strategyNotes || ""} onChange={e => setSettings(p => ({ ...p, strategyNotes: e.target.value }))} placeholder="Tone, messaging style, what to emphasize..." rows={3} /></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label>Daily Invite Limit</Label><Input type="number" value={settings.dailyInviteLimit} onChange={e => setSettings(p => ({ ...p, dailyInviteLimit: parseInt(e.target.value) || 20 }))} /></div>
            <div className="space-y-2"><Label>Follow-up Delay (days)</Label><Input type="number" value={settings.followupDelayDays} onChange={e => setSettings(p => ({ ...p, followupDelayDays: parseInt(e.target.value) || 3 }))} /></div>
            <div className="space-y-2">
              <Label>Agent Autonomy</Label>
              <select value={(settings as unknown as Record<string, string>).autonomyLevel || "training"} onChange={e => setSettings(p => ({ ...p, autonomyLevel: e.target.value } as Settings))} className="w-full bg-card border border-border rounded px-3 py-2 text-sm">
                <option value="training">Training — asks before sending</option>
                <option value="semi">Semi-auto — sends low-risk, asks for invites</option>
                <option value="full">Full auto — executes everything</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} size="lg" className="w-full">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Settings
      </Button>
    </div>
  );
}
