"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";

interface LogEntry {
  id: string;
  action: string;
  contactId: string | null;
  success: boolean;
  errorCode: string | null;
  duration: number | null;
  createdAt: string;
  request: string | null;
  response: string | null;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState("all");
  const [successFilter, setSuccessFilter] = useState("all");
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams({ page: page.toString(), limit: "50" });
    if (actionFilter !== "all") params.set("action", actionFilter);
    if (successFilter !== "all") params.set("success", successFilter);

    const res = await fetch(`/api/logs?${params}`);
    const data = await res.json();
    setLogs(data.logs || []);
    setTotal(data.total || 0);
  }, [page, actionFilter, successFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "execution-logs.json";
    a.click();
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Execution Logs</h1>
          <p className="text-muted-foreground">{total} log entries</p>
        </div>
        <Button onClick={exportJSON} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Export JSON
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex gap-3">
            <Select value={actionFilter} onValueChange={(v) => { if (v) { setActionFilter(v); setPage(1); } }}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Action type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="send_invite">Send Invite</SelectItem>
                <SelectItem value="send_message">Send Message</SelectItem>
                <SelectItem value="check_connection">Check Connection</SelectItem>
                <SelectItem value="fetch_profile">Fetch Profile</SelectItem>
                <SelectItem value="scan_inbox">Scan Inbox</SelectItem>
                <SelectItem value="search">Search</SelectItem>
              </SelectContent>
            </Select>
            <Select value={successFilter} onValueChange={(v) => { if (v) { setSuccessFilter(v); setPage(1); } }}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Result" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Success</SelectItem>
                <SelectItem value="false">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs">{new Date(log.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{log.action}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={log.success ? "secondary" : "destructive"}>
                      {log.success ? "OK" : "FAIL"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{log.errorCode}</TableCell>
                  <TableCell className="text-xs">{log.duration ? `${log.duration}ms` : "—"}</TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No logs found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
