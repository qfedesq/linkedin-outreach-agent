"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string; action: string; contactId: string | null;
  request: string | null; response: string | null;
  success: boolean; errorCode: string | null; duration: number | null; createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  agent_chat: "bg-blue-500/10 text-blue-400", apify_scrape: "bg-orange-500/10 text-orange-400",
  score_contact: "bg-amber-500/10 text-amber-400", prepare_invites: "bg-purple-500/10 text-purple-400",
  send_invite: "bg-green-500/10 text-green-400", send_followup: "bg-pink-500/10 text-pink-400",
  check_connection: "bg-cyan-500/10 text-cyan-400", scan_inbox: "bg-teal-500/10 text-teal-400",
  enrich_contacts: "bg-indigo-500/10 text-indigo-400", agent_learn: "bg-yellow-500/10 text-yellow-400",
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState("all");
  const [successFilter, setSuccessFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams({ page: page.toString(), limit: "30" });
    if (actionFilter !== "all") params.set("action", actionFilter);
    if (successFilter !== "all") params.set("success", successFilter);
    const res = await fetch(`/api/logs?${params}`);
    const data = await res.json();
    setLogs(data.logs || []);
    setTotal(data.total || 0);
  }, [page, actionFilter, successFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "logs.json"; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Execution Logs</h1><p className="text-muted-foreground text-sm">{total} entries</p></div>
        <Button onClick={exportJSON} variant="outline" size="sm"><Download className="mr-2 h-4 w-4" />Export JSON</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex gap-3">
            <Select value={actionFilter} onValueChange={v => { if (v) { setActionFilter(v); setPage(1); } }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="agent_chat">Agent Chat</SelectItem>
                <SelectItem value="apify_scrape">Apify Scrape</SelectItem>
                <SelectItem value="score_contact">Score</SelectItem>
                <SelectItem value="prepare_invites">Prepare Invites</SelectItem>
                <SelectItem value="send_invite">Send Invite</SelectItem>
                <SelectItem value="send_followup">Send Follow-up</SelectItem>
                <SelectItem value="scan_inbox">Scan Inbox</SelectItem>
                <SelectItem value="agent_learn">Agent Learn</SelectItem>
              </SelectContent>
            </Select>
            <Select value={successFilter} onValueChange={v => { if (v) { setSuccessFilter(v); setPage(1); } }}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Result" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Success</SelectItem>
                <SelectItem value="false">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {logs.map(log => (
              <div key={log.id}>
                <div className="flex items-center px-4 py-2.5 hover:bg-accent/30 cursor-pointer transition-colors" onClick={() => toggleExpand(log.id)}>
                  {expanded.has(log.id) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground mr-2 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mr-2 shrink-0" />}
                  <span className="text-xs text-muted-foreground w-36 shrink-0">{new Date(log.createdAt).toLocaleString()}</span>
                  <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0 mx-2", ACTION_COLORS[log.action] || "bg-muted")}>{log.action}</Badge>
                  <Badge variant={log.success ? "secondary" : "destructive"} className="text-[10px] px-1.5 py-0 mx-2">{log.success ? "OK" : "FAIL"}</Badge>
                  <span className="text-xs text-muted-foreground truncate flex-1">{log.request?.substring(0, 80)}</span>
                  {log.duration && <span className="text-[10px] font-mono text-muted-foreground ml-2">{log.duration > 1000 ? `${(log.duration / 1000).toFixed(1)}s` : `${log.duration}ms`}</span>}
                </div>
                {expanded.has(log.id) && (
                  <div className="px-4 pb-3 pt-1 ml-6 border-l-2 border-primary/20 space-y-2 text-xs">
                    <div><span className="text-muted-foreground font-bold">Message:</span><p className="text-foreground mt-0.5 whitespace-pre-wrap">{log.request || "—"}</p></div>
                    {log.response && <div><span className="text-muted-foreground font-bold">Response:</span><p className="text-foreground mt-0.5 whitespace-pre-wrap font-mono text-[11px] bg-muted/30 p-2 rounded max-h-40 overflow-auto">{log.response}</p></div>}
                    {log.errorCode && <div><span className="text-red-400 font-bold">Error:</span> <span className="text-red-400">{log.errorCode}</span></div>}
                    <div className="flex gap-6 text-muted-foreground">
                      {log.duration && <span>Duration: <span className="text-foreground font-mono">{log.duration}ms</span></span>}
                      {log.contactId && <span>Contact: <span className="text-foreground font-mono">{log.contactId.substring(0, 12)}...</span></span>}
                      <span>ID: <span className="text-foreground font-mono">{log.id.substring(0, 12)}...</span></span>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {logs.length === 0 && <div className="py-8 text-center text-muted-foreground text-sm">No logs found</div>}
          </div>
        </CardContent>
      </Card>

      {Math.ceil(total / 30) > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(total / 30)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / 30)} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
