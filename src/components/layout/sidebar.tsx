"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Activity,
  Search,
  Send,
  UserCheck,
  Inbox,
  Users,
  RefreshCw,
  ScrollText,
  Settings,
  MessageSquare,
} from "lucide-react";
import { APP_VERSION } from "@/lib/constants";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Agent Chat", icon: MessageSquare },
  { href: "/command", label: "Command Center", icon: Activity },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/invites", label: "Invites", icon: Send },
  { href: "/followups", label: "Follow-ups", icon: UserCheck },
  { href: "/responses", label: "Inbox", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/sync", label: "Sync", icon: RefreshCw },
];

const bottomItems = [
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [inviteCount, setInviteCount] = useState({ sent: 0, max: 20 });

  useEffect(() => {
    fetch("/api/contacts?status=INVITED&limit=1")
      .then(r => r.json())
      .then(d => setInviteCount(prev => ({ ...prev, sent: d.total || 0 })))
      .catch(() => {});
  }, []);

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-[200px] lg:fixed lg:inset-y-0 bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center h-12 px-4 border-b border-sidebar-border">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-tighter text-foreground">Outreach Agent</span>
        </Link>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-[12px] font-medium tracking-tight transition-all duration-150 rounded",
                isActive
                  ? "bg-accent text-primary border-l-2 border-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto px-3 pb-3">
        {/* Invite usage tracker */}
        <div className="bg-card rounded-lg p-3 border border-border mb-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 font-bold">Daily Invites</p>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min((inviteCount.sent / inviteCount.max) * 100, 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-foreground mt-2 font-medium font-mono">
            {inviteCount.sent}/{inviteCount.max} invites
          </p>
        </div>

        {/* Bottom nav */}
        <div className="border-t border-sidebar-border pt-2 space-y-0.5">
          {bottomItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-[12px] font-medium tracking-tight transition-all duration-150 rounded",
                  isActive
                    ? "bg-accent text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground mt-2 px-3 font-mono">V{APP_VERSION}</p>
      </div>
    </aside>
  );
}
