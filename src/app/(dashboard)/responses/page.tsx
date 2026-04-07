"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Inbox, ExternalLink } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  position: string | null;
  company: string | null;
  linkedinUrl: string;
  status: string;
  notes: string | null;
  updatedAt: string;
}

interface ReplyStrategy {
  intent: string;
  strategy: string;
  draft: string;
  cta: string;
  riskFlags: string[];
}

interface MeetingBrief {
  executiveSummary: string;
  likelyPains: string[];
  objectionMap: string[];
  talkTrack: string[];
  cta: string;
}

export default function ResponsesPage() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ scanned: number; matches: { contact: Contact; lastMessage: string }[] } | null>(null);
  const [replied, setReplied] = useState<Contact[]>([]);
  const [loadingStrategyId, setLoadingStrategyId] = useState<string | null>(null);
  const [replyStrategies, setReplyStrategies] = useState<Record<string, ReplyStrategy>>({});
  const [meetingBriefs, setMeetingBriefs] = useState<Record<string, MeetingBrief>>({});
  const [loadingBriefId, setLoadingBriefId] = useState<string | null>(null);

  const fetchReplied = async () => {
    const res = await fetch("/api/inbox/matches");
    const data = await res.json();
    setReplied(data.contacts || []);
  };

  useEffect(() => {
    fetchReplied();
  }, []);

  const scanInbox = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/inbox/scan", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setScanResult(data);
        toast.success(`Scanned ${data.scanned} conversations, found ${data.matches?.length || 0} replies`);
        fetchReplied();
      }
    } catch {
      toast.error("Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchReplied();
  };

  const loadReplyStrategy = async (contact: Contact) => {
    setLoadingStrategyId(contact.id);
    try {
      const res = await fetch("/api/replies/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, messageText: contact.notes || "" }),
      });
      const data = await res.json();
      if (data.result) {
        setReplyStrategies(prev => ({ ...prev, [contact.id]: data.result }));
      } else {
        toast.error(data.error || "Could not draft reply strategy");
      }
    } catch {
      toast.error("Could not draft reply strategy");
    } finally {
      setLoadingStrategyId(null);
    }
  };

  const loadMeetingBrief = async (contact: Contact) => {
    setLoadingBriefId(contact.id);
    try {
      const res = await fetch(`/api/meetings/brief?contactId=${contact.id}`);
      const data = await res.json();
      if (data.brief) {
        setMeetingBriefs(prev => ({ ...prev, [contact.id]: data.brief }));
      } else {
        toast.error(data.error || "Could not prepare meeting brief");
      }
    } catch {
      toast.error("Could not prepare meeting brief");
    } finally {
      setLoadingBriefId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inbox & Responses</h1>
          <p className="text-muted-foreground">Scan LinkedIn inbox for replies from tracked contacts</p>
        </div>
        <Button onClick={scanInbox} disabled={scanning}>
          {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Inbox className="mr-2 h-4 w-4" />}
          Scan Inbox
        </Button>
      </div>

      {scanResult && scanResult.matches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>New Replies Detected</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {scanResult.matches.map((m, idx) => (
              <div key={idx} className="border rounded-md p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{m.contact.name}</span>
                  <span className="text-sm text-muted-foreground">{m.contact.company}</span>
                </div>
                <p className="text-sm text-muted-foreground italic">&ldquo;{m.lastMessage}&rdquo;</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Replies ({replied.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {replied.length === 0 ? (
            <p className="text-sm text-muted-foreground">No replies tracked yet. Run an inbox scan.</p>
          ) : (
            <div className="space-y-3">
              {replied.map((contact) => (
                <div key={contact.id} className="border rounded-md p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline flex items-center gap-1">
                        {contact.name} <ExternalLink className="h-3 w-3" />
                      </a>
                      <span className="text-sm text-muted-foreground">{contact.position} @ {contact.company}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Select value={contact.status} onValueChange={(v) => { if (v) updateStatus(contact.id, v); }}>
                        <SelectTrigger className="w-40 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="REPLIED">Replied</SelectItem>
                          <SelectItem value="MEETING_BOOKED">Meeting Booked</SelectItem>
                          <SelectItem value="UNRESPONSIVE">Unresponsive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => loadReplyStrategy(contact)} disabled={loadingStrategyId === contact.id}>
                      {loadingStrategyId === contact.id ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                      Draft Reply Strategy
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => loadMeetingBrief(contact)} disabled={loadingBriefId === contact.id}>
                      {loadingBriefId === contact.id ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                      Meeting Brief
                    </Button>
                  </div>
                  {replyStrategies[contact.id] && (
                    <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{replyStrategies[contact.id].intent}</Badge>
                        <span className="text-xs text-muted-foreground">{replyStrategies[contact.id].cta}</span>
                      </div>
                      <p className="text-sm text-foreground">{replyStrategies[contact.id].strategy}</p>
                      <div className="rounded-md bg-background px-3 py-2 text-sm">{replyStrategies[contact.id].draft}</div>
                      {replyStrategies[contact.id].riskFlags.length > 0 && (
                        <p className="text-xs text-muted-foreground">Risk flags: {replyStrategies[contact.id].riskFlags.join(", ")}</p>
                      )}
                    </div>
                  )}
                  {meetingBriefs[contact.id] && (
                    <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
                      <p className="text-sm font-medium">Meeting Brief</p>
                      <p className="text-sm text-foreground">{meetingBriefs[contact.id].executiveSummary}</p>
                      <p className="text-xs text-muted-foreground">Likely pains: {meetingBriefs[contact.id].likelyPains.join(" | ")}</p>
                      <p className="text-xs text-muted-foreground">Objections: {meetingBriefs[contact.id].objectionMap.join(" | ")}</p>
                      <p className="text-xs text-muted-foreground">Talk track: {meetingBriefs[contact.id].talkTrack.join(" -> ")}</p>
                      <p className="text-xs text-foreground font-medium">CTA: {meetingBriefs[contact.id].cta}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
