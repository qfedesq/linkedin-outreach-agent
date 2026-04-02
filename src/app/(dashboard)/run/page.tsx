"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Play, Square, Loader2 } from "lucide-react";

interface LogLine {
  time: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

const LOG_COLORS = {
  info: "text-foreground",
  success: "text-green-600",
  warning: "text-yellow-600",
  error: "text-red-600",
};

export default function RunPage() {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (message: string, type: LogLine["type"] = "info") => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { time, message, type }]);
  };

  const runDailyCycle = async () => {
    setRunning(true);
    setLogs([]);
    abortRef.current = false;
    addLog("Starting daily run...");

    try {
      // Create run record
      const startRes = await fetch("/api/run/start", { method: "POST" });
      const { runId: id } = await startRes.json();
      setRunId(id);

      // Phase 1: Check connections
      setPhase("check-connections");
      addLog("Phase 1: Checking connection status for invited contacts...");
      const checkRes = await fetch("/api/followups/check-connections", { method: "POST" });
      const checkData = await checkRes.json();
      addLog(`Phase 1: Checked ${checkData.checked} contacts — ${checkData.newConnections} newly connected, ${checkData.stillPending} pending`, "success");
      if (abortRef.current) throw new Error("Aborted");

      // Update run
      await fetch(`/api/run/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "check-connections",
          connectionsChecked: checkData.checked,
          newConnections: checkData.newConnections,
        }),
      });

      // Phase 2: Check for due follow-ups
      setPhase("followups");
      addLog("Phase 2: Checking for follow-ups due...");
      const dueRes = await fetch("/api/followups/due");
      const dueData = await dueRes.json();
      const dueContacts = dueData.contacts || [];
      addLog(`Phase 2: ${dueContacts.length} contacts due for follow-up`);

      if (dueContacts.length > 0) {
        addLog("Phase 2: Generating follow-up messages...");
        const genRes = await fetch("/api/followups/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactIds: dueContacts.map((c: { id: string }) => c.id) }),
        });
        const genData = await genRes.json();
        const messages = (genData.results || [])
          .filter((r: { message?: string }) => r.message)
          .map((r: { id: string; message: string }) => ({ contactId: r.id, message: r.message }));

        if (messages.length > 0) {
          addLog(`Phase 2: Sending ${messages.length} follow-ups...`);
          const sendRes = await fetch("/api/followups/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages }),
          });
          const sendData = await sendRes.json();
          const sent = (sendData.results || []).filter((r: { success: boolean }) => r.success).length;
          addLog(`Phase 2: ${sent} follow-ups sent`, "success");

          await fetch(`/api/run/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ followupsSent: sent }),
          });
        }
      }

      if (abortRef.current) throw new Error("Aborted");

      // Phase 3: Scan inbox
      setPhase("inbox");
      addLog("Phase 3: Scanning LinkedIn inbox for replies...");
      const inboxRes = await fetch("/api/inbox/scan", { method: "POST" });
      const inboxData = await inboxRes.json();
      if (inboxData.error) {
        addLog(`Phase 3: Inbox scan failed — ${inboxData.error}`, "warning");
      } else {
        addLog(`Phase 3: Scanned ${inboxData.scanned} conversations, ${inboxData.matches?.length || 0} new replies`, "success");
        await fetch(`/api/run/${id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newReplies: inboxData.matches?.length || 0 }),
        });
      }

      // Complete
      await fetch(`/api/run/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED", completedAt: new Date().toISOString() }),
      });

      setPhase(null);
      addLog("Daily run complete!", "success");
      toast.success("Daily run completed");
    } catch (error) {
      addLog(`Run failed: ${(error as Error).message}`, "error");
      if (runId) {
        await fetch(`/api/run/${runId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "FAILED", errorLog: (error as Error).message }),
        });
      }
    } finally {
      setRunning(false);
      setPhase(null);
    }
  };

  const abort = () => {
    abortRef.current = true;
    addLog("Aborting...", "warning");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Daily Run</h1>
          <p className="text-muted-foreground">Execute the full daily outreach cycle</p>
        </div>
        <div className="flex gap-2">
          {running ? (
            <Button variant="destructive" onClick={abort}>
              <Square className="mr-2 h-4 w-4" />
              Abort
            </Button>
          ) : (
            <Button onClick={runDailyCycle}>
              <Play className="mr-2 h-4 w-4" />
              Run Daily Cycle
            </Button>
          )}
        </div>
      </div>

      {running && phase && (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <Badge>{phase}</Badge>
          <span className="text-sm text-muted-foreground">Running...</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Execution Log</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] rounded-md border bg-muted/30 p-4" ref={scrollRef}>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Click &ldquo;Run Daily Cycle&rdquo; to start. The cycle will:
                1) Check connection status, 2) Send follow-ups, 3) Scan inbox for replies.
              </p>
            ) : (
              <div className="space-y-1 font-mono text-sm">
                {logs.map((log, idx) => (
                  <div key={idx} className={LOG_COLORS[log.type]}>
                    <span className="text-muted-foreground">[{log.time}]</span> {log.message}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
