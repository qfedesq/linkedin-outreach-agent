"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Users,
  Send,
  UserCheck,
  MessageSquare,
  CalendarCheck,
  AlertCircle,
  Play,
  Search,
  Inbox,
} from "lucide-react";

interface Stats {
  total: number;
  byStatus: Record<string, number>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ total: 0, byStatus: {} });
  const [recentLogs, setRecentLogs] = useState<Array<{ id: string; action: string; success: boolean; createdAt: string; contactId: string | null }>>([]);

  useEffect(() => {
    // Fetch contact stats
    fetch("/api/contacts?limit=1")
      .then((r) => r.json())
      .then((data) => {
        setStats((prev) => ({ ...prev, total: data.total }));
      });

    // Fetch counts by status
    const statuses = ["TO_CONTACT", "INVITED", "CONNECTED", "FOLLOWED_UP", "REPLIED", "MEETING_BOOKED", "UNRESPONSIVE"];
    Promise.all(
      statuses.map((s) =>
        fetch(`/api/contacts?status=${s}&limit=1`)
          .then((r) => r.json())
          .then((data) => ({ status: s, count: data.total }))
      )
    ).then((results) => {
      const byStatus: Record<string, number> = {};
      results.forEach((r) => (byStatus[r.status] = r.count));
      setStats((prev) => ({ ...prev, byStatus }));
    });

    // Fetch recent logs
    fetch("/api/logs?limit=10")
      .then((r) => r.json())
      .then((data) => setRecentLogs(data.logs || []));
  }, []);

  const statusCards = [
    { key: "TO_CONTACT", label: "To Contact", icon: Users, color: "text-gray-600" },
    { key: "INVITED", label: "Invited", icon: Send, color: "text-blue-600" },
    { key: "CONNECTED", label: "Connected", icon: UserCheck, color: "text-green-600" },
    { key: "FOLLOWED_UP", label: "Followed Up", icon: MessageSquare, color: "text-yellow-600" },
    { key: "REPLIED", label: "Replied", icon: Inbox, color: "text-purple-600" },
    { key: "MEETING_BOOKED", label: "Meetings", icon: CalendarCheck, color: "text-emerald-600" },
    { key: "UNRESPONSIVE", label: "Unresponsive", icon: AlertCircle, color: "text-red-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">{stats.total} total contacts in pipeline</p>
        </div>
      </div>

      {/* Pipeline Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {statusCards.map((s) => (
          <Card key={s.key}>
            <CardContent className="p-4 text-center">
              <s.icon className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
              <p className="text-2xl font-bold">{stats.byStatus[s.key] || 0}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/run">
            <Button><Play className="mr-2 h-4 w-4" />Run Daily Cycle</Button>
          </Link>
          <Link href="/discover">
            <Button variant="outline"><Search className="mr-2 h-4 w-4" />Discover Prospects</Button>
          </Link>
          <Link href="/invites">
            <Button variant="outline"><Send className="mr-2 h-4 w-4" />Prepare Invite Batch</Button>
          </Link>
          <Link href="/followups">
            <Button variant="outline"><UserCheck className="mr-2 h-4 w-4" />Run Follow-ups</Button>
          </Link>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet</p>
          ) : (
            <div className="space-y-2">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 text-sm">
                  <Badge variant={log.success ? "secondary" : "destructive"} className="text-xs">
                    {log.action}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
