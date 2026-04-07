"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Send, RefreshCw } from "lucide-react";

interface BatchItem {
  id: string;
  contactId: string;
  draftMessage: string;
  approved: boolean;
  skipped: boolean;
  sent: boolean;
  sendResult: string | null;
  editedMessage: string | null;
  contact: {
    id: string;
    name: string;
    position: string | null;
    company: string | null;
    profileFit: string;
  };
}

export default function InvitesPage() {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [sendProgress, setSendProgress] = useState(0);

  const prepareBatch = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/invites/prepare", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      setBatchId(data.batch.id);
      setItems(data.items);
      toast.success(`Prepared ${data.items.length} invites`);
    } catch {
      toast.error("Failed to prepare batch");
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (id: string, updates: Partial<BatchItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const sendBatch = async () => {
    if (!batchId) return;
    setSending(true);
    setSendProgress(0);

    // First update approvals
    await fetch(`/api/invites/${batchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "APPROVED",
        items: items.map((i) => ({
          id: i.id,
          approved: i.approved,
          skipped: !i.approved,
          editedMessage: i.editedMessage,
        })),
      }),
    });

    const approved = items.filter((i) => i.approved);

    // Send one at a time via send-next
    for (let i = 0; i < approved.length; i++) {
      try {
        const res = await fetch(`/api/invites/${batchId}/send-next`, { method: "POST" });
        const data = await res.json();

        if (data.done) break;

        setSendProgress(i + 1);

        if (data.item) {
          updateItem(data.item.id, { sent: true, sendResult: data.item.sendResult });
        }
      } catch {
        break;
      }
    }

    setSending(false);
    toast.success("Batch sending complete");
  };

  const approvedCount = items.filter((i) => i.approved).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invite Batches</h1>
          <p className="text-muted-foreground">Prepare and send connection requests</p>
        </div>
        <Button onClick={prepareBatch} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Prepare New Batch
        </Button>
      </div>

      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {approvedCount} of {items.length} approved
              {sending && ` — Sending ${sendProgress}/${approvedCount}...`}
            </p>
            <Button onClick={sendBatch} disabled={sending || approvedCount === 0}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Approve & Send ({approvedCount})
            </Button>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => (
              <Card key={item.id} className={item.sent ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-muted-foreground">#{idx + 1}</span>
                      <CardTitle className="text-base">{item.contact.name}</CardTitle>
                      <span className="text-sm text-muted-foreground">
                        {item.contact.position} @ {item.contact.company}
                      </span>
                      <Badge
                        variant="secondary"
                        className={
                          item.contact.profileFit === "HIGH"
                            ? "bg-green-100 text-green-700"
                            : item.contact.profileFit === "MEDIUM"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-700"
                        }
                      >
                        {item.contact.profileFit}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      {item.sent && (
                        <Badge variant={item.sendResult === "success" ? "secondary" : "destructive"}>
                          {item.sendResult}
                        </Badge>
                      )}
                      <Switch
                        checked={item.approved}
                        onCheckedChange={(checked) => updateItem(item.id, { approved: checked })}
                        disabled={item.sent}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <Textarea
                      value={item.editedMessage || item.draftMessage}
                      onChange={(e) => updateItem(item.id, { editedMessage: e.target.value })}
                      disabled={item.sent}
                      rows={2}
                      className="text-sm"
                    />
                    <span className="absolute right-2 bottom-2 text-xs text-muted-foreground">
                      {(item.editedMessage || item.draftMessage).length}/300
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {items.length === 0 && !loading && (
          <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Click &quot;Prepare New Batch&quot; to generate personalized connection notes for your contacts.
            Contacts must be enriched first (have profileId).
          </CardContent>
        </Card>
      )}
    </div>
  );
}
