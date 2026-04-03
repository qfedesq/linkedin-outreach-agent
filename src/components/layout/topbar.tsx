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
import { LogOut, Menu, Settings } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { useEffect, useState } from "react";
import Link from "next/link";

interface ServiceStatus { linkedin: boolean; apify: boolean; openrouter: boolean }

export function TopBar() {
  const { data: session } = useSession();
  const [services, setServices] = useState<ServiceStatus>({ linkedin: false, apify: false, openrouter: false });

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(data => {
      setServices({ linkedin: !!data.linkedinLiAt, apify: !!data.apifyApiToken, openrouter: !!data.openrouterApiKey });
    }).catch(() => {});
  }, []);

  const connectedCount = Object.values(services).filter(Boolean).length;
  const allConnected = connectedCount === 3;
  const userName = session?.user?.name?.split(" ")[0] || "User";

  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-4 border-b border-border bg-background px-4">
      <Sheet>
        <SheetTrigger>
          <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8">
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-[200px]">
          <Sidebar />
        </SheetContent>
      </Sheet>

      {/* Connection status */}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${allConnected ? "bg-success" : connectedCount > 0 ? "bg-warning" : "bg-muted-foreground"}`} />
        <span className="text-xs font-semibold tracking-tight text-primary">
          {allConnected ? `Connected as ${userName}` : `${connectedCount}/3 services`}
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {/* Service dots */}
        <div className="flex items-center gap-1.5 mr-2">
          {(["linkedin", "apify", "openrouter"] as const).map(s => (
            <span key={s} className={`w-1.5 h-1.5 rounded-full ${services[s] ? "bg-success" : "bg-muted-foreground/30"}`} title={s} />
          ))}
        </div>

        <Link href="/settings">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
            <Settings className="h-4 w-4" />
          </Button>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger>
            <Avatar className="h-7 w-7 border border-border">
              <AvatarImage src={session?.user?.image || ""} />
              <AvatarFallback className="text-[10px]">{userName.charAt(0)}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-xs text-muted-foreground">{session?.user?.email}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut className="mr-2 h-3 w-3" />Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
