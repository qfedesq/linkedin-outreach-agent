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

export default function ResponsesPage() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ scanned: number; matches: { contact: Contact; lastMessage: string }[] } | null>(null);
  const [replied, setReplied] = useState<Contact[]>([]);

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
                <div key={contact.id} className="flex items-center justify-between border rounded-md p-3">
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
