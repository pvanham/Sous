import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getStaffById } from "@/server/actions/staff.actions";
import { getStaffAvailability } from "@/server/actions/staff-availability.actions";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { Button } from "@/components/ui/button";
import { AvailabilityGrid } from "./_components/AvailabilityGrid";

interface AvailabilityPageProps {
  params: Promise<{ id: string }>;
}

export default async function AvailabilityPage({
  params,
}: AvailabilityPageProps) {
  const { id: staffId } = await params;

  // Fetch staff member, availability, and kitchen config in parallel
  const [staffResult, availabilityResult, configResult] = await Promise.all([
    getStaffById(staffId),
    getStaffAvailability({ staffId }),
    getKitchenConfig(),
  ]);

  // Handle staff not found
  if (!staffResult.success || !staffResult.data) {
    notFound();
  }

  const staff = staffResult.data;
  const availability = availabilityResult.success ? availabilityResult.data : [];
  const stations = configResult.success && configResult.data 
    ? configResult.data.stations 
    : [];

  return (
    <div className="space-y-6">
      {/* Header with back navigation */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/staff">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {staff.name} - Weekly Availability
          </h1>
          <p className="text-muted-foreground">
            Set availability preferences and scheduling constraints.
          </p>
        </div>
      </div>

      {/* Main availability grid component */}
      <AvailabilityGrid
        staff={staff}
        initialAvailability={availability}
        stations={stations}
      />
    </div>
  );
}
