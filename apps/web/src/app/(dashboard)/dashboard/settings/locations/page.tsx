import { listLocations } from "@/server/actions/location.actions";
import { CreateLocationDialog } from "./_components/CreateLocationDialog";
import { Store, Clock, Phone } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { getLocationContext } from "@/lib/auth/get-location-context";

export default async function LocationsSettingsPage() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const ctx = await getLocationContext(userId);
  
  // Protect the page from non-owners at the page level too
  if (ctx.role !== "owner") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Locations</h1>
          <p className="text-muted-foreground mt-2">
            Only Organization Owners can manage locations.
          </p>
        </div>
      </div>
    );
  }

  const result = await listLocations();
  const locations = result.success ? result.data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Locations</h1>
          <p className="text-muted-foreground">
            Manage your restaurants across your organization.
          </p>
        </div>
        <CreateLocationDialog />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {locations.map((loc) => (
          <div
            key={loc.id}
            className="flex flex-col gap-2 p-4 border border-stone-200 dark:border-white/10 rounded-lg bg-white dark:bg-stone-900/50 shadow-sm"
          >
            <div className="flex items-center gap-2 pb-2">
              <div className="bg-stone-100 dark:bg-white/5 p-2 rounded-md">
                <Store className="h-4 w-4 text-stone-600 dark:text-stone-400" />
              </div>
              <h3 className="font-semibold text-base">{loc.name}</h3>
            </div>
            
            <div className="flex flex-col gap-1.5 text-sm text-stone-600 dark:text-stone-400">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                <span>{loc.timezone}</span>
              </div>
              
              {loc.twilioPhoneNumber && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{loc.twilioPhoneNumber}</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {locations.length === 0 && (
          <div className="col-span-full border border-dashed border-stone-300 dark:border-white/20 p-8 rounded-lg text-center">
            <Store className="h-8 w-8 mx-auto text-stone-400 mb-3" />
            <p className="text-stone-600 dark:text-stone-300 font-medium">No locations found</p>
            <p className="text-stone-500 text-sm mt-1">Create a location to manage your operations</p>
          </div>
        )}
      </div>
    </div>
  );
}
