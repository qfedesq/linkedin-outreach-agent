"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, UserCheck, Send, RefreshCw } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  position: string | null;
  company: string | null;
  connectedDate: string | null;
}

interface FollowupDraft {
  id: string;
  contact: Contact;
  message: string;
}

export default function FollowupsPage() {
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ checked: number; newConnections: number; expired: number; stillPending: number } | null>(null);
  const [dueContacts, setDueContacts] = useState<Contact[]>([]);
  const [drafts, setDrafts] = useState<FollowupDraft[]>([]);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchDue = async () => {
    const res = await fetch("/api/followups/due");
    const data = await res.json();
    setDueContacts(data.contacts || []);
  };

  useEffect(() => {
    fetchDue();
  }, []);

  const checkConnections = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/followups/check-connections", { method: "POST" });
      const data = await res.json();
      setCheckResult(data);
      toast.success(`${data.newConnections} new connections found`);
      fetchDue();
    } catch {
      toast.error("Check failed");
    } finally {
      setChecking(false);
    }
  };

  const generateFollowups = async () => {
    setGenerating(true);
    try {
      const ids = dueContacts.map((c) => c.id);
      const res = await fetch("/api/followups/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: ids }),
      });
      const data = await res.json();
      setDrafts(
        (data.results || [])
          .filter((r: { message?: string }) => r.message)
          .map((r: { id: string; contact: Contact; message: string }) => ({
            id: r.id,
            contact: r.contact,
            message: r.message,
          }))
      );
      toast.success(`Generated ${data.results?.length || 0} follow-up messages`);
    } catch {
      toast.error("Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const sendFollowups = async () => {
    setSending(true);
    try {
      const messages = drafts.map((d) => ({ contactId: d.id, message: d.message }));
      const res = await fetch("/api/followups/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const data = await res.json();
      const sent = (data.results || []).filter((r: { success: boolean }) => r.success).length;
      toast.success(`${sent} follow-ups sent`);
      setDrafts([]);
      fetchDue();
    } catch {
      toast.error("Sending failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Follow-ups</h1>
        <p className="text-muted-foreground">Check connections and send follow-up messages</p>
      </div>

      {/* Check Connections */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Check Connection Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={checkConnections} disabled={checking}>
            {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Check All Pending Invites
          </Button>
          {checkResult && (
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-md bg-muted">
                <p className="text-lg font-bold">{checkResult.checked}</p>
                <p className="text-xs text-muted-foreground">Checked</p>
              </div>
              <div className="p-3 rounded-md bg-green-50">
                <p className="text-lg font-bold text-green-600">{checkResult.newConnections}</p>
                <p className="text-xs text-muted-foreground">New Connections</p>
              </div>
              <div className="p-3 rounded-md bg-muted">
                <p className="text-lg font-bold">{checkResult.stillPending}</p>
                <p className="text-xs text-muted-foreground">Still Pending</p>
              </div>
              <div className="p-3 rounded-md bg-red-50">
                <p className="text-lg font-bold text-red-600">{checkResult.expired}</p>
                <p className="text-xs text-muted-foreground">Expired</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Follow-ups Due */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Follow-ups Due ({dueContacts.length})</span>
            <div className="flex gap-2">
              <Button onClick={generateFollowups} disabled={generating || dueContacts.length === 0} size="sm">
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Generate Messages
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {drafts.length > 0 ? (
            <div className="space-y-4">
              {drafts.map((draft) => (
                <div key={draft.id} className="border rounded-md p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{draft.contact.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {draft.contact.position} @ {draft.contact.company}
                    </span>
                  </div>
                  <Textarea
                    value={draft.message}
                    onChange={(e) =>
                      setDrafts((prev) =>
                        prev.map((d) => (d.id === draft.id ? { ...d, message: e.target.value } : d))
                      )
                    }
                    rows={3}
                    className="text-sm"
                  />
                </div>
              ))}
              <Button onClick={sendFollowups} disabled={sending}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send All Follow-ups
              </Button>
            </div>
          ) : dueContacts.length > 0 ? (
            <div className="space-y-2">
              {dueContacts.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-sm text-muted-foreground">{c.position} @ {c.company}</span>
                  <Badge variant="outline" className="text-xs">
                    Connected {c.connectedDate ? new Date(c.connectedDate).toLocaleDateString() : ""}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No follow-ups due at this time</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
