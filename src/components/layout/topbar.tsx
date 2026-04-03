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

interface ServiceStatus {
  linkedin: boolean;
  apify: boolean;
  openrouter: boolean;
}

export function TopBar() {
  const { data: session } = useSession();
  const [services, setServices] = useState<ServiceStatus>({
    linkedin: false,
    apify: false,
    openrouter: false,
  });

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setServices({
          linkedin: !!data.linkedinLiAt,
          apify: !!data.apifyApiToken,
          openrouter: !!data.openrouterApiKey,
        });
      })
      .catch(() => {});
  }, []);

  const connectedCount = Object.values(services).filter(Boolean).length;
  const allConnected = connectedCount === 3;

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
          <span className={`h-2 w-2 rounded-full ${allConnected ? "bg-green-500" : connectedCount > 0 ? "bg-yellow-500" : "bg-gray-400"}`} />
          <span className="text-xs">
            {allConnected ? "Connected" : connectedCount > 0 ? `${connectedCount}/3` : "Not configured"}
          </span>
        </Badge>

        {/* Individual service indicators */}
        <div className="hidden md:flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${services.linkedin ? "bg-green-500" : "bg-gray-300"}`} title="LinkedIn" />
          <span className={`h-1.5 w-1.5 rounded-full ${services.apify ? "bg-green-500" : "bg-gray-300"}`} title="Apify" />
          <span className={`h-1.5 w-1.5 rounded-full ${services.openrouter ? "bg-green-500" : "bg-gray-300"}`} title="OpenRouter" />
        </div>

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
