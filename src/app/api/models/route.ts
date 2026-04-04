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

    // Include all major providers — no restrictive filter
    const PROVIDERS = [
      "anthropic", "openai", "google", "meta", "mistral", "deepseek",
      "qwen", "cohere", "nvidia", "microsoft", "x-ai", "moonshot", "kimi",
      "inflection", "perplexity", "together", "fireworks", "groq",
    ];

    const models = (data.data || [])
      .filter((m: { id: string }) => {
        const id = m.id.toLowerCase();
        // Include if from a known provider OR if it's a popular model name
        return PROVIDERS.some(p => id.includes(p)) ||
               id.includes("gpt") || id.includes("claude") || id.includes("gemini") ||
               id.includes("llama") || id.includes("command") || id.includes("phi") ||
               id.includes("yi-") || id.includes("wizard") || id.includes("solar") ||
               id.includes("nemotron") || id.includes("o1") || id.includes("o3") || id.includes("o4");
      })
      .map((m: { id: string; name: string; pricing?: { prompt: string; completion: string } }) => ({
        id: m.id,
        name: m.name || m.id,
        costPer1k: m.pricing?.prompt ? `$${(parseFloat(m.pricing.prompt) * 1000).toFixed(4)}` : "free",
      }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] });
  }
}
