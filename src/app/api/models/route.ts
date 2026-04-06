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

    const models = (data.data || [])
      .filter((m: { id: string; supported_parameters?: string[]; description?: string }) => {
        // Only include models that explicitly support tool/function calling
        const params = m.supported_parameters || [];
        const supportsTools = params.includes("tools") || params.includes("tool_choice");

        if (!supportsTools) return false;

        // Exclude known problematic models for tool calling
        const id = m.id.toLowerCase();
        if (id.includes("free") && id.includes("preview")) return false; // Free previews are unreliable
        if (id.includes("instruct") && !id.includes("gpt")) return false; // Instruct models often lack tool support

        return true;
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
