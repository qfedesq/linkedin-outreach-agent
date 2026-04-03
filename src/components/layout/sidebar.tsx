"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Play,
  Search,
  Send,
  UserCheck,
  Inbox,
  Users,
  RefreshCw,
  ScrollText,
  Settings,
} from "lucide-react";
import { APP_VERSION } from "@/lib/constants";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/run", label: "Run", icon: Play },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/invites", label: "Invites", icon: Send },
  { href: "/followups", label: "Follow-ups", icon: UserCheck },
  { href: "/responses", label: "Inbox", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/sync", label: "Sync", icon: RefreshCw },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 border-r border-border bg-card">
      <div className="flex items-center h-16 px-6 border-b border-border">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">LA</span>
          </div>
          <span className="font-semibold text-lg">LinkedIn Agent</span>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t border-border">
        <span className="text-xs text-muted-foreground">V{APP_VERSION}</span>
      </div>
    </aside>
  );
}
