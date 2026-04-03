"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Search, Sparkles, Plus } from "lucide-react";

const KEYWORD_PRESETS = [
  '"revenue-based financing" founder CEO',
  '"embedded lending" OR "embedded finance" co-founder',
  '"invoice financing" "head of capital" OR CFO',
  '"BNPL" B2B founder CEO',
  '"merchant cash advance" founder',
  '"supply chain finance" "capital markets"',
  '"working capital" fintech CEO founder',
  '"trade finance" fintech "head of"',
  '"specialty lending" "capital markets" director',
];

export default function DiscoverPage() {
  const [keywords, setKeywords] = useState("");
  const [geography, setGeography] = useState("UK");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ total: number; created: number; skipped: number } | null>(null);
  const [scoring, setScoring] = useState(false);

  // Manual add
  const [manualName, setManualName] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualPosition, setManualPosition] = useState("");
  const [manualCompany, setManualCompany] = useState("");

  const runApifyScrape = async () => {
    if (!keywords) {
      toast.error("Enter search keywords");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/discover/apify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, geography }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setResults(data);
        toast.success(`Found ${data.created} new prospects (${data.skipped} duplicates skipped)`);
      }
    } catch {
      toast.error("Scrape failed");
    } finally {
      setLoading(false);
    }
  };

  const scoreAll = async () => {
    setScoring(true);
    try {
      const res = await fetch("/api/contacts?status=TO_CONTACT&limit=50");
      const data = await res.json();
      const ids = data.contacts.filter((c: { profileFit: string }) => c.profileFit === "MEDIUM").map((c: { id: string }) => c.id);
      if (ids.length === 0) {
        toast.info("No unscored contacts");
        return;
      }
      const scoreRes = await fetch("/api/discover/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: ids }),
      });
      const scoreData = await scoreRes.json();
      toast.success(`Scored ${scoreData.results?.length || 0} contacts`);
    } catch {
      toast.error("Scoring failed");
    } finally {
      setScoring(false);
    }
  };

  const addManual = async () => {
    if (!manualName || !manualUrl) {
      toast.error("Name and LinkedIn URL are required");
      return;
    }
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: manualName,
          linkedinUrl: manualUrl,
          position: manualPosition,
          company: manualCompany,
          source: "manual",
        }),
      });
      const data = await res.json();
      if (data.created > 0) {
        toast.success("Contact added");
        setManualName("");
        setManualUrl("");
        setManualPosition("");
        setManualCompany("");
      } else {
        toast.error("Contact already exists");
      }
    } catch {
      toast.error("Failed to add contact");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Discover Prospects</h1>
        <p className="text-muted-foreground">Find and add new contacts to your pipeline</p>
      </div>

      <Tabs defaultValue="apify">
        <TabsList>
          <TabsTrigger value="apify">Apify Scrape</TabsTrigger>
          <TabsTrigger value="search">LinkedIn Search</TabsTrigger>
          <TabsTrigger value="manual">Manual Add</TabsTrigger>
        </TabsList>

        <TabsContent value="apify" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Scrape via Apify</CardTitle>
              <CardDescription>Search LinkedIn profiles using keywords</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Keywords</Label>
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder='e.g., "revenue-based financing" founder CEO'
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {KEYWORD_PRESETS.map((preset) => (
                  <Badge
                    key={preset}
                    variant="outline"
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => setKeywords(preset)}
                  >
                    {preset.length > 40 ? preset.substring(0, 40) + "..." : preset}
                  </Badge>
                ))}
              </div>

              <div className="space-y-2">
                <Label>Geography</Label>
                <div className="flex gap-2">
                  {["UK", "Europe", "US", "APAC"].map((g) => (
                    <Button
                      key={g}
                      variant={geography === g ? "default" : "outline"}
                      size="sm"
                      onClick={() => setGeography(g)}
                    >
                      {g}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button onClick={runApifyScrape} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  Run Scrape
                </Button>
                <Button onClick={scoreAll} disabled={scoring} variant="outline">
                  {scoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Score Unscored Contacts
                </Button>
              </div>

              {results && (
                <div className="p-3 rounded-md bg-muted text-sm">
                  Total found: {results.total} | New: {results.created} | Duplicates skipped: {results.skipped}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>LinkedIn Voyager Search</CardTitle>
              <CardDescription>Search directly via LinkedIn API (requires active cookie)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Keywords</Label>
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder='e.g., fintech lending CEO'
                />
              </div>
              <Button onClick={async () => {
                if (!keywords) { toast.error("Enter keywords"); return; }
                setLoading(true);
                try {
                  const res = await fetch("/api/discover/linkedin-search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ keywords, count: 10 }),
                  });
                  const data = await res.json();
                  if (data.error) { toast.error(data.error); return; }
                  const results = data.results || [];
                  if (results.length === 0) { toast.info("No results found"); return; }
                  // Save results as contacts
                  const contacts = results.map((r: { firstName: string; lastName: string; headline: string; publicIdentifier: string }) => ({
                    name: `${r.firstName} ${r.lastName}`.trim(),
                    position: r.headline || null,
                    linkedinUrl: `https://www.linkedin.com/in/${r.publicIdentifier}`,
                    source: "linkedin_search",
                  }));
                  const saveRes = await fetch("/api/contacts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(contacts),
                  });
                  const saveData = await saveRes.json();
                  toast.success(`Found ${results.length} — saved ${saveData.created} new (${saveData.skipped} duplicates)`);
                } catch { toast.error("Search failed"); }
                finally { setLoading(false); }
              }} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Search LinkedIn
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual">
          <Card>
            <CardHeader>
              <CardTitle>Add Contact Manually</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label>LinkedIn URL *</Label>
                  <Input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="https://linkedin.com/in/johndoe" />
                </div>
                <div className="space-y-2">
                  <Label>Position</Label>
                  <Input value={manualPosition} onChange={(e) => setManualPosition(e.target.value)} placeholder="CEO" />
                </div>
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input value={manualCompany} onChange={(e) => setManualCompany(e.target.value)} placeholder="Acme Corp" />
                </div>
              </div>
              <Button onClick={addManual}>
                <Plus className="mr-2 h-4 w-4" />
                Add Contact
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
