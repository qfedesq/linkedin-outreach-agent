import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { decrypt } from "@/lib/encryption";

export async function GET() {
  const user = await getAuthUser();
  if (!user?.settings?.openrouterApiKey) return unauthorized();

  try {
    const apiKey = decrypt(user.settings.openrouterApiKey);
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return NextResponse.json({ models: [] });

    const data = await res.json();
    // Filter to popular/useful models and sort by name
    const models = (data.data || [])
      .filter((m: { id: string }) => {
        const id = m.id.toLowerCase();
        return id.includes("claude") || id.includes("gpt") || id.includes("gemini") ||
               id.includes("llama") || id.includes("mistral") || id.includes("deepseek") ||
               id.includes("qwen");
      })
      .map((m: { id: string; name: string; pricing?: { prompt: string; completion: string } }) => ({
        id: m.id,
        name: m.name || m.id,
        costPer1k: m.pricing ? `$${(parseFloat(m.pricing.prompt) * 1000).toFixed(4)}` : "?",
      }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))
      .slice(0, 50);

    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] });
  }
}
