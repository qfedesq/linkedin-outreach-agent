"use client";

import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Menu, Settings, Sun, Moon } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";

interface ServiceStatus { linkedin: boolean; openrouter: boolean }

export function TopBar() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [services, setServices] = useState<ServiceStatus>({ linkedin: false, openrouter: false });

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(data => {
      setServices({ linkedin: !!data?.unipileApiKey, openrouter: !!data?.openrouterApiKey });
    }).catch(() => setServices({ linkedin: false, openrouter: false }));
  }, []);

  const connectedCount = Object.values(services).filter(Boolean).length;
  const allConnected = connectedCount === 2;
  const userName = session?.user?.name?.split(" ")[0] || "User";

  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-4 border-b border-border bg-background px-4">
      <Sheet>
        <SheetTrigger>
          <span className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <Menu className="h-4 w-4" />
          </span>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-[200px]"><Sidebar /></SheetContent>
      </Sheet>

      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${allConnected ? "bg-success" : connectedCount > 0 ? "bg-warning" : "bg-muted-foreground"}`} />
        <span className="text-xs font-semibold tracking-tight text-primary">
          {allConnected ? `Connected as ${userName}` : `${connectedCount}/2 services`}
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 mr-2">
          {(["linkedin", "openrouter"] as const).map(s => (
            <span key={s} className={`w-1.5 h-1.5 rounded-full ${services[s] ? "bg-success" : "bg-muted-foreground/30"}`} title={s} />
          ))}
        </div>

        {/* Theme toggle */}
        {mounted && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        )}

        <Link href="/settings">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><Settings className="h-4 w-4" /></Button>
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
            <DropdownMenuItem onClick={() => signOut()}><LogOut className="mr-2 h-3 w-3" />Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
