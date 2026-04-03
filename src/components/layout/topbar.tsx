"use client";

import { useSession, signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Link2, LogOut, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { useEffect, useState } from "react";

type CookieStatus = "valid" | "warning" | "expired" | "unknown";

export function TopBar() {
  const { data: session } = useSession();
  const [cookieStatus, setCookieStatus] = useState<CookieStatus>("unknown");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (!data.linkedinLiAt) {
          setCookieStatus("unknown");
        } else if (data.linkedinCookieValid) {
          if (data.linkedinLastValidated) {
            const hoursAgo =
              (Date.now() - new Date(data.linkedinLastValidated).getTime()) /
              (1000 * 60 * 60);
            setCookieStatus(hoursAgo > 24 ? "warning" : "valid");
          } else {
            setCookieStatus("valid");
          }
        } else {
          // Cookie exists but not validated yet — show as valid (user just saved it)
          setCookieStatus("valid");
        }
      })
      .catch(() => setCookieStatus("unknown"));
  }, []);

  const statusColor = {
    valid: "bg-green-500",
    warning: "bg-yellow-500",
    expired: "bg-red-500",
    unknown: "bg-gray-400",
  }[cookieStatus];

  const statusLabel = {
    valid: "Connected",
    warning: "Check cookie",
    expired: "Expired",
    unknown: "Not configured",
  }[cookieStatus];

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-background px-4 lg:px-6">
      <Sheet>
        <SheetTrigger>
          <Button variant="ghost" size="icon" className="lg:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64">
          <Sidebar />
        </SheetContent>
      </Sheet>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <Badge variant="outline" className="gap-1.5 py-1">
          <Link2 className="h-3 w-3" />
          <span className={`h-2 w-2 rounded-full ${statusColor}`} />
          <span className="text-xs">{statusLabel}</span>
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={session?.user?.image || ""} />
                <AvatarFallback>
                  {session?.user?.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-xs text-muted-foreground">
              {session?.user?.email}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
