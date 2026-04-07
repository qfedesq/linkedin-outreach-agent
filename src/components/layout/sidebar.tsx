"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Users, ScrollText, Settings, LayoutDashboard, TrendingUp, Plus, Megaphone, BookOpen,
} from "lucide-react";
import { APP_VERSION } from "@/lib/constants";
import { useEffect, useState } from "react";

interface Campaign { id: string; name: string; isActive: boolean }

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/performance", label: "Analytics", icon: TrendingUp },
];

const bottomItems = [
  { href: "/guide", label: "How to Use", icon: BookOpen },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [inviteCount, setInviteCount] = useState({ sent: 0, max: 20 });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [usage, setUsage] = useState({ totalTokens: 0, totalCost: 0, todayTokens: 0, todayCost: 0, todayLLMCalls: 0, totalLLMCalls: 0 });

  useEffect(() => {
    fetch("/api/contacts?status=INVITED&limit=1")
      .then(r => r.json())
      .then(d => setInviteCount(prev => ({ ...prev, sent: d.total || 0 })))
      .catch(() => {});
    fetch("/api/campaigns")
      .then(r => r.json())
      .then(d => setCampaigns(d.campaigns || []))
      .catch(() => {});
    fetch("/api/usage")
      .then(r => r.json())
      .then(d => setUsage(d))
      .catch(() => {});
  }, [pathname]); // Re-fetch when user navigates (e.g. after toggling campaign status)

  const createCampaign = async () => {
    const name = prompt("Campaign name:");
    if (!name) return;
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.campaign) setCampaigns(prev => [data.campaign, ...prev]);
  };

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-[200px] lg:fixed lg:inset-y-0 bg-sidebar border-r border-sidebar-border">
      <div className="flex items-center h-12 px-4 border-b border-sidebar-border">
        <Link href="/" className="text-sm font-bold tracking-tighter text-foreground">Outreach Agent</Link>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={cn(
              "flex items-center gap-3 px-3 py-2 text-[12px] font-medium tracking-tight transition-all duration-150 rounded",
              isActive ? "bg-accent text-primary border-l-2 border-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}>
              <item.icon className="w-4 h-4" />{item.label}
            </Link>
          );
        })}

        {/* Campaigns section */}
        <div className="pt-3 mt-2 border-t border-sidebar-border">
          <div className="flex items-center justify-between px-3 mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Campaigns</span>
            <button onClick={createCampaign} className="text-muted-foreground hover:text-primary transition-colors" title="New Campaign">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {campaigns.length === 0 && (
            <p className="px-3 text-[10px] text-muted-foreground/50 italic">No campaigns yet</p>
          )}
          {campaigns.map(c => {
            const isActive = pathname === `/dashboard/${c.id}` || pathname === `/campaigns/${c.id}`;
            return (
              <div key={c.id} className={cn(
                "flex items-center gap-1 px-3 py-1.5 text-[11px] rounded transition-colors group",
                isActive ? "bg-accent text-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}>
                <Link href={`/dashboard/${c.id}`} className="flex items-center gap-2 flex-1 min-w-0">
                  <Megaphone className="w-3 h-3 shrink-0" />
                  <span className="truncate">{c.name}</span>
                </Link>
                <Link href={`/campaigns/${c.id}`} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hover:text-primary" title="Campaign settings">
                  <Settings className="w-3 h-3" />
                </Link>
                {c.isActive && <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="mt-auto px-3 pb-3">
        <div className="bg-card rounded-lg p-3 border border-border mb-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 font-bold">Daily Invites</p>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min((inviteCount.sent / inviteCount.max) * 100, 100)}%` }} />
          </div>
          <p className="text-[11px] text-foreground mt-2 font-medium font-mono">{inviteCount.sent}/{inviteCount.max}</p>
        </div>

        <div className="bg-card rounded-lg p-3 border border-border mb-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 font-bold">OpenRouter</p>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Tokens today</span>
              <span className="font-mono text-foreground">{usage.todayTokens > 0 ? `${(usage.todayTokens / 1000).toFixed(1)}k` : "0"}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Cost today</span>
              <span className="font-mono text-foreground">{usage.todayCost > 0 ? `$${usage.todayCost.toFixed(4)}` : "$0"}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Total tokens</span>
              <span className="font-mono text-foreground">{usage.totalTokens > 0 ? `${(usage.totalTokens / 1000).toFixed(1)}k` : "0"}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Total cost</span>
              <span className="font-mono text-foreground">{usage.totalCost > 0 ? `$${usage.totalCost.toFixed(4)}` : "$0"}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Calls today</span>
              <span className="font-mono text-foreground">{usage.todayLLMCalls || 0}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Total calls</span>
              <span className="font-mono text-foreground">{usage.totalLLMCalls || 0}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-sidebar-border pt-2 space-y-0.5">
          {bottomItems.map((item) => (
            <Link key={item.href} href={item.href} className={cn(
              "flex items-center gap-3 px-3 py-2 text-[12px] font-medium tracking-tight transition-all duration-150 rounded",
              pathname.startsWith(item.href) ? "bg-accent text-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}>
              <item.icon className="w-4 h-4" />{item.label}
            </Link>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 px-3 font-mono">V{APP_VERSION}</p>
      </div>
    </aside>
  );
}
