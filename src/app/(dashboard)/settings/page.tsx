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
  linkedinLiAt: string;
  linkedinCookieValid: boolean;
  linkedinLastValidated: string | null;
  linkedinProfileUrn: string | null;
  apifyApiToken: string;
  openrouterApiKey: string;
  googleSheetsId: string;
  googleServiceAccount: string;
  calendarBookingUrl: string;
  preferredModel: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    linkedinLiAt: "",
    linkedinCookieValid: false,
    linkedinLastValidated: null,
    linkedinProfileUrn: null,
    apifyApiToken: "",
    openrouterApiKey: "",
    googleSheetsId: "",
    googleServiceAccount: "",
    calendarBookingUrl: "https://calendar.app.google/k8XEhkPnX6sc2GdW9",
    preferredModel: "anthropic/claude-sonnet-4",
  });
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [saving, setSaving] = useState(false);
  const [linkedinProfile, setLinkedinProfile] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings((prev) => ({ ...prev, ...data }));
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) toast.success("Settings saved");
      else toast.error("Failed to save settings");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const testLinkedin = async () => {
    setTesting((prev) => ({ ...prev, linkedin: true }));
    try {
      const res = await fetch("/api/settings/test-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liAt: settings.linkedinLiAt !== "••••••••" ? settings.linkedinLiAt : undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setLinkedinProfile(data.profile.name);
        setTestResults((prev) => ({ ...prev, linkedin: { success: true, message: `Connected as ${data.profile.name}` } }));
      } else {
        setTestResults((prev) => ({ ...prev, linkedin: { success: false, message: data.error } }));
      }
    } catch {
      setTestResults((prev) => ({ ...prev, linkedin: { success: false, message: "Connection failed" } }));
    } finally {
      setTesting((prev) => ({ ...prev, linkedin: false }));
    }
  };

  const testApify = async () => {
    setTesting((prev) => ({ ...prev, apify: true }));
    try {
      const res = await fetch("/api/settings/test-apify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: settings.apifyApiToken !== "••••••••" ? settings.apifyApiToken : undefined }),
      });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, apify: { success: data.success, message: data.success ? "Connected" : data.error } }));
    } catch {
      setTestResults((prev) => ({ ...prev, apify: { success: false, message: "Connection failed" } }));
    } finally {
      setTesting((prev) => ({ ...prev, apify: false }));
    }
  };

  const testOpenRouter = async () => {
    setTesting((prev) => ({ ...prev, openrouter: true }));
    try {
      const res = await fetch("/api/settings/test-openrouter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settings.openrouterApiKey !== "••••••••" ? settings.openrouterApiKey : undefined }),
      });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, openrouter: { success: data.success, message: data.success ? "Connected" : data.error } }));
    } catch {
      setTestResults((prev) => ({ ...prev, openrouter: { success: false, message: "Connection failed" } }));
    } finally {
      setTesting((prev) => ({ ...prev, openrouter: false }));
    }
  };

  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});

  const toggle = async (key: string) => {
    const newState = !showSecrets[key];
    setShowSecrets((prev) => ({ ...prev, [key]: newState }));

    // Fetch decrypted values from server when revealing
    if (newState && !revealedValues[key]) {
      try {
        const res = await fetch("/api/settings?reveal=true");
        const data = await res.json();
        const map: Record<string, string> = {};
        if (data.linkedinLiAt) map.linkedinLiAt = data.linkedinLiAt;
        if (data.apifyApiToken) map.apifyApiToken = data.apifyApiToken;
        if (data.openrouterApiKey) map.openrouterApiKey = data.openrouterApiKey;
        if (data.googleServiceAccount) map.googleServiceAccount = data.googleServiceAccount;
        setRevealedValues((prev) => ({ ...prev, ...map }));
        // Also update settings state so the input shows the real value
        setSettings((prev) => ({ ...prev, ...map }));
      } catch {
        // ignore
      }
    }
  };

  const SecretInput = ({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={id}
            type={showSecrets[id] ? "text" : "password"}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full"
            onClick={() => toggle(id)}
          >
            {showSecrets[id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );

  const TestResult = ({ id }: { id: string }) => {
    const result = testResults[id];
    if (!result) return null;
    return (
      <div className={`flex items-center gap-2 text-sm ${result.success ? "text-green-600" : "text-red-600"}`}>
        {result.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        {result.message}
      </div>
    );
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure credentials and preferences</p>
      </div>

      {/* LinkedIn Cookie */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            LinkedIn Connection
            {settings.linkedinCookieValid && (
              <Badge variant="outline" className="text-green-600 border-green-600">Connected</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Open LinkedIn in Chrome → DevTools (F12) → Application → Cookies → linkedin.com → copy li_at value.
            Cookies typically last 6-12 months on Premium accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SecretInput
            id="linkedinLiAt"
            label="li_at Cookie"
            value={settings.linkedinLiAt || ""}
            onChange={(v) => setSettings((prev) => ({ ...prev, linkedinLiAt: v }))}
          />
          {linkedinProfile && (
            <p className="text-sm text-green-600">Connected as {linkedinProfile}</p>
          )}
          <div className="flex items-center gap-4">
            <Button onClick={testLinkedin} disabled={testing.linkedin} size="sm">
              {testing.linkedin && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Connection
            </Button>
            <TestResult id="linkedin" />
          </div>
        </CardContent>
      </Card>

      {/* Apify */}
      <Card>
        <CardHeader>
          <CardTitle>Apify</CardTitle>
          <CardDescription>API token for LinkedIn prospect scraping</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SecretInput
            id="apifyApiToken"
            label="API Token"
            value={settings.apifyApiToken || ""}
            onChange={(v) => setSettings((prev) => ({ ...prev, apifyApiToken: v }))}
          />
          <div className="flex items-center gap-4">
            <Button onClick={testApify} disabled={testing.apify} size="sm">
              {testing.apify && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Connection
            </Button>
            <TestResult id="apify" />
          </div>
        </CardContent>
      </Card>

      {/* OpenRouter */}
      <Card>
        <CardHeader>
          <CardTitle>OpenRouter</CardTitle>
          <CardDescription>LLM API for message personalization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SecretInput
            id="openrouterApiKey"
            label="API Key"
            value={settings.openrouterApiKey || ""}
            onChange={(v) => setSettings((prev) => ({ ...prev, openrouterApiKey: v }))}
          />
          <div className="space-y-2">
            <Label htmlFor="preferredModel">Preferred Model</Label>
            <Input
              id="preferredModel"
              value={settings.preferredModel}
              onChange={(e) => setSettings((prev) => ({ ...prev, preferredModel: e.target.value }))}
              placeholder="anthropic/claude-sonnet-4"
            />
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={testOpenRouter} disabled={testing.openrouter} size="sm">
              {testing.openrouter && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Connection
            </Button>
            <TestResult id="openrouter" />
          </div>
        </CardContent>
      </Card>

      {/* Google Sheets */}
      <Card>
        <CardHeader>
          <CardTitle>Google Sheets</CardTitle>
          <CardDescription>Sync with your tracker spreadsheet</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="googleSheetsId">Spreadsheet ID</Label>
            <Input
              id="googleSheetsId"
              value={settings.googleSheetsId || ""}
              onChange={(e) => setSettings((prev) => ({ ...prev, googleSheetsId: e.target.value }))}
              placeholder="Extract from the Google Sheets URL"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="googleServiceAccount">Service Account JSON</Label>
            <Textarea
              id="googleServiceAccount"
              value={settings.googleServiceAccount || ""}
              onChange={(e) => setSettings((prev) => ({ ...prev, googleServiceAccount: e.target.value }))}
              placeholder='Paste the full JSON key file content here'
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card>
        <CardHeader>
          <CardTitle>Calendar</CardTitle>
          <CardDescription>Booking link used in follow-up messages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="calendarBookingUrl">Booking URL</Label>
            <Input
              id="calendarBookingUrl"
              value={settings.calendarBookingUrl}
              onChange={(e) => setSettings((prev) => ({ ...prev, calendarBookingUrl: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} size="lg" className="w-full">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Settings
      </Button>
    </div>
  );
}
