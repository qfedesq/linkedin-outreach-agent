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
    campaignName: "",
    campaignDescription: "", icpDefinition: "", strategyNotes: "",
    dailyInviteLimit: 20, followupDelayDays: 3, autopilotEnabled: false,
  });
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>DSN (Server URL)</Label>
              <Input value={(settings as unknown as Record<string, string>).unipileDsn || "https://api17.unipile.com:14777"} onChange={e => setSettings(p => ({ ...p, unipileDsn: e.target.value } as Settings))} placeholder="https://api17.unipile.com:14777" />
            </div>
            <div className="space-y-2">
              <Label>Account ID</Label>
              <Input value={settings.unipileAccountId || ""} onChange={e => setSettings(p => ({ ...p, unipileAccountId: e.target.value }))} placeholder="e.g., CNyD9GLrR5WUtv1UuWbGrQ" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">If the API Key shows wrong after save, clear it, paste the real key, and save again.</p>
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
          <ModelSelector value={settings.preferredModel} onChange={v => setSettings(p => ({ ...p, preferredModel: v }))} />
          <div className="flex items-center gap-4">
            <Button onClick={() => testService("openrouter", "/api/settings/test-openrouter")} disabled={testing.openrouter} size="sm">
              {testing.openrouter && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Test Connection
            </Button>
            <TestResult id="openrouter" />
          </div>
        </CardContent>
      </Card>

      {/* Agent Behavior */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Behavior</CardTitle>
          <CardDescription>Global settings. Campaign-specific config (ICP, strategy) is in each campaign page — click a campaign in the sidebar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Agent Autonomy Level</Label>
            <select value={(settings as unknown as Record<string, string>).autonomyLevel || "training"} onChange={e => setSettings(p => ({ ...p, autonomyLevel: e.target.value } as Settings))} className="w-full bg-card border border-border rounded px-3 py-2 text-sm">
              <option value="training">Training — asks before sending</option>
              <option value="semi">Semi-auto — auto discover/score, asks for sends</option>
              <option value="full">Full auto — executes everything autonomously</option>
            </select>
            <p className="text-[10px] text-muted-foreground">Campaign config (ICP, strategy, calendar) is now per-campaign. Click a campaign in the sidebar to configure it.</p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} size="lg" className="w-full">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Settings
      </Button>

      {/* Knowledge Base */}
      <KnowledgeViewer />
    </div>
  );
}

function ModelSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [models, setModels] = useState<Array<{ id: string; name: string; costPer1k: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/models").then(r => r.json()).then(d => setModels(d.models || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-2">
      <Label>Preferred Model</Label>
      {models.length > 0 ? (
        <select value={value} onChange={e => onChange(e.target.value)} className="w-full bg-card border border-border rounded px-3 py-2 text-sm">
          {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.costPer1k}/1k)</option>)}
        </select>
      ) : (
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder={loading ? "Loading models..." : "anthropic/claude-sonnet-4"} />
      )}
    </div>
  );
}

function KnowledgeViewer() {
  const [knowledge, setKnowledge] = useState<Array<{ id: string; category: string; content: string; source: string; createdAt: string }>>([]);

  useEffect(() => {
    fetch("/api/knowledge").then(r => r.json()).then(d => setKnowledge(d.knowledge || [])).catch(() => {});
  }, []);

  const deleteItem = async (id: string) => {
    await fetch("/api/knowledge", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setKnowledge(prev => prev.filter(k => k.id !== id));
  };

  const catColors: Record<string, string> = {
    message_style: "bg-purple-500/10 text-purple-400",
    icp_insight: "bg-green-500/10 text-green-400",
    strategy: "bg-blue-500/10 text-blue-400",
    correction: "bg-amber-500/10 text-amber-400",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Agent Knowledge Base</span>
          <Badge variant="outline" className="text-[10px]">{knowledge.length} entries</Badge>
        </CardTitle>
        <CardDescription>What the agent has learned from your feedback. This persists across sessions.</CardDescription>
      </CardHeader>
      <CardContent>
        {knowledge.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No knowledge yet. The agent learns when you give corrections in the chat.<br/>
            Try: &ldquo;Remember that we should use a more casual tone&rdquo;
          </p>
        ) : (
          <div className="space-y-2">
            {knowledge.map(k => (
              <div key={k.id} className="flex items-start gap-3 p-2 rounded border border-border hover:bg-accent/30 group">
                <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 shrink-0 mt-0.5 ${catColors[k.category] || "bg-muted"}`}>{k.category}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">{k.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(k.createdAt).toLocaleDateString()} via {k.source}</p>
                </div>
                <button onClick={() => deleteItem(k.id)} className="text-[10px] text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">remove</button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
