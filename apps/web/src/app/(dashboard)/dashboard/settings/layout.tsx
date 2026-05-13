import { SettingsNav } from "./_components/SettingsNav";
import { auth } from "@clerk/nextjs/server";
import { getLocationContext } from "@/lib/auth/get-location-context";


export default async function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { userId } = await auth();
  if (!userId) return null;

  const ctx = await getLocationContext(userId);

  return (
    <div className="flex gap-8">
      <SettingsNav role={ctx.role} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
