import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { getLocationContext } from "@/lib/auth/get-location-context";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/dashboard");

  // Kitchen is the natural landing page, but shift leads can't open it —
  // notifications is the only settings surface available to them.
  const ctx = await getLocationContext(userId);
  redirect(
    ctx.role === "shift_lead"
      ? "/dashboard/settings/notifications"
      : "/dashboard/settings/kitchen",
  );
}
