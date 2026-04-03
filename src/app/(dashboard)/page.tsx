"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Play, Search, Users, ArrowRight, CheckCircle, AlertTriangle, Send, Info } from "lucide-react";

interface Stats { total: number; toContact: number; invited: number; connected: number; followedUp: number; replied: number; meetings: number }

const activities_placeholder = [
  { type: "info", text: "Ready to start outreach", time: "now" },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ total: 0, toContact: 0, invited: 0, connected: 0, followedUp: 0, replied: 0, meetings: 0 });
  const [activities, setActivities] = useState<Array<{ type: string; text: string; time: string }>>(activities_placeholder);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const statuses = ["TO_CONTACT", "INVITED", "CONNECTED", "FOLLOWED_UP", "REPLIED", "MEETING_BOOKED"];
        const results = await Promise.all(
          statuses.map(s => fetch(`/api/contacts?status=${s}&limit=1`).then(r => r.json()).then(d => ({ s, n: d.total || 0 })))
        );
        const total = await fetch("/api/contacts?limit=1").then(r => r.json()).then(d => d.total || 0);
        const m: Record<string, number> = {};
        results.forEach(r => m[r.s] = r.n);
        setStats({
          total, toContact: m.TO_CONTACT || 0, invited: m.INVITED || 0,
          connected: m.CONNECTED || 0, followedUp: m.FOLLOWED_UP || 0,
          replied: m.REPLIED || 0, meetings: m.MEETING_BOOKED || 0,
        });
      } catch {}
    };

    const fetchLogs = async () => {
      try {
        const res = await fetch("/api/logs?limit=10");
        const data = await res.json();
        if (data.logs?.length > 0) {
          setActivities(data.logs.map((l: { action: string; request: string; success: boolean; createdAt: string }) => ({
            type: l.success ? (l.action.includes("error") ? "warning" : "success") : "warning",
            text: l.request || l.action,
            time: new Date(l.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          })));
        }
      } catch {}
    };

    fetchStats();
    fetchLogs();
  }, []);

  const statCards = [
    { label: "Total contacts", value: stats.total },
    { label: "Invited pending", value: stats.invited },
    { label: "Connected", value: stats.connected },
    { label: "Replied", value: stats.replied },
    { label: "Meetings booked", value: stats.meetings },
  ];

  const funnelData = [
    { label: "Contacts", count: stats.total, rate: "--", width: 30 },
    { label: "Invited", count: stats.invited, rate: stats.total > 0 ? `${Math.round((stats.invited / stats.total) * 100)}%` : "--", width: 25 },
    { label: "Connected", count: stats.connected, rate: stats.invited > 0 ? `${Math.round((stats.connected / stats.invited) * 100)}%` : "--", width: 18 },
    { label: "Followed", count: stats.followedUp, rate: stats.connected > 0 ? `${Math.round((stats.followedUp / stats.connected) * 100)}%` : "--", width: 15 },
    { label: "Replied", count: stats.replied, rate: stats.followedUp > 0 ? `${Math.round((stats.replied / stats.followedUp) * 100)}%` : "--", width: 8 },
    { label: "Meetings", count: stats.meetings, rate: stats.replied > 0 ? `${Math.round((stats.meetings / stats.replied) * 100)}%` : "--", width: 4 },
  ];

  const funnelColors = [
    "bg-foreground/10", "bg-primary/20", "bg-warning/20", "bg-tertiary/20", "bg-success/20", "bg-primary/40"
  ];

  return (
    <div className="space-y-8">
      {/* Stat Cards */}
      <section className="flex w-full h-[72px] bg-card rounded border border-border divide-x divide-border overflow-hidden">
        {statCards.map((stat) => (
          <div key={stat.label} className="flex-1 flex flex-col justify-center px-6">
            <span className="text-[28px] font-semibold text-primary tabular-nums tracking-tight font-mono">{stat.value}</span>
            <span className="text-[12px] text-muted-foreground font-medium tracking-tight">{stat.label}</span>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-10 gap-8 items-start">
        {/* Left: Pipeline Funnel */}
        <div className="col-span-6 space-y-6">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Outreach Pipeline</h2>
          <div className="space-y-8">
            <div className="flex h-12 w-full rounded overflow-hidden">
              {funnelData.map((item, i) => (
                <div
                  key={item.label}
                  className={cn("h-full flex items-center px-3 border-r border-background/20", funnelColors[i])}
                  style={{ width: `${item.width}%` }}
                >
                  <span className="font-mono text-[11px] text-foreground">{item.count}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-6 gap-2">
              {funnelData.map((item) => (
                <div key={item.label} className="space-y-1">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold">{item.label}</p>
                  <p className="text-[11px] font-medium text-primary">{item.rate}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Activity Feed */}
        <div className="col-span-4 pl-4 border-l border-border">
          <h2 className="text-sm font-semibold text-foreground mb-6 uppercase tracking-wider">Live Activity</h2>
          <div className="space-y-3">
            {activities.slice(0, 10).map((a, i) => (
              <div key={i} className="flex gap-3">
                <div className={cn(
                  "mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0",
                  a.type === "info" && "bg-primary",
                  a.type === "success" && "bg-success",
                  a.type === "warning" && "bg-warning",
                )} />
                <div className="flex flex-col gap-0.5">
                  <p className="text-[12px] text-foreground leading-snug">{a.text?.substring(0, 80)}</p>
                  <span className="text-[10px] text-muted-foreground">{a.time}</span>
                </div>
              </div>
            ))}
            <Link href="/logs" className="inline-flex items-center mt-2 text-[11px] font-semibold text-primary hover:underline gap-1">
              View all logs <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom: Quick Actions */}
      <div className="fixed bottom-0 left-[200px] right-0 h-14 bg-background border-t border-border px-6 flex items-center gap-4 z-30">
        <Link href="/command">
          <button className="bg-primary text-primary-foreground font-bold text-xs px-4 py-2 rounded flex items-center gap-2 active:scale-95 transition-all">
            <Play className="w-4 h-4 fill-current" /> Run Daily Cycle
          </button>
        </Link>
        <Link href="/command">
          <button className="border border-border text-foreground hover:bg-accent font-semibold text-xs px-4 py-2 rounded flex items-center gap-2">
            <Search className="w-4 h-4" /> Search Prospects
          </button>
        </Link>
        <Link href="/contacts">
          <button className="border border-border text-foreground hover:bg-accent font-semibold text-xs px-4 py-2 rounded flex items-center gap-2">
            <Users className="w-4 h-4" /> View Contacts
          </button>
        </Link>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Status</span>
            <span className="text-[11px] text-success font-medium">All systems operational</span>
          </div>
        </div>
      </div>
    </div>
  );
}
