import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth-helpers";

export default async function HomePage() {
  const user = await getAuthUser();

  // New user: no API keys configured yet → show onboarding
  if (user?.settings && !user.settings.openrouterApiKey && !user.settings.unipileApiKey) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}
