"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.push("/");
  }, [session, router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "AccessDenied") {
      setError("Access restricted to Protofire team members (@protofire.io)");
    }
  }, []);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center mb-4">
            <span className="text-primary-foreground font-bold text-lg">LA</span>
          </div>
          <CardTitle className="text-2xl">LinkedIn Outreach Agent</CardTitle>
          <CardDescription>
            Autonomous LinkedIn B2B outreach agent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm text-center">
              {error}
            </div>
          )}
          <Button
            className="w-full"
            size="lg"
            onClick={() => signIn("google", { callbackUrl: "/" })}
          >
            Sign in with Google
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Restricted to @protofire.io accounts
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
