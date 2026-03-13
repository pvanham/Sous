import { listLocations } from "@/server/actions/location.actions";
import { InviteManagerForm } from "./_components/InviteManagerForm";
import { auth } from "@clerk/nextjs/server";
import { getLocationContext } from "@/lib/auth/get-location-context";

export default async function TeamSettingsPage() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const ctx = await getLocationContext(userId);
  
  // For safety, protect the page from non-owners at the page level too
  if (ctx.role !== "owner") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team Settings</h1>
          <p className="text-muted-foreground mt-2">
            Only Organization Owners can manage the team and send metadata invitations.
          </p>
        </div>
      </div>
    );
  }

  const result = await listLocations();
  const locations = result.success ? result.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team Settings</h1>
        <p className="text-muted-foreground">
          Invite managers to help run your kitchen locations.
        </p>
      </div>
      
      <InviteManagerForm locations={locations} />
    </div>
  );
}
