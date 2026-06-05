import { notFound } from "next/navigation";
import { getStaffById } from "@/server/actions/staff.actions";
import { getStaffAvailability } from "@/server/actions/staff-availability.actions";
import { getTimeOffRequestsByStaff } from "@/server/actions/time-off-request.actions";
import { listSkillChangeRequests } from "@/server/actions/skill-change-request.actions";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { StaffDetail } from "./_components/StaffDetail";

interface StaffDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function StaffDetailPage({
  params,
}: StaffDetailPageProps) {
  const { id: staffId } = await params;

  // One round-trip for everything the detail page needs. The backend is
  // already staff-centric, so a single page can own profile, availability,
  // time-off, and skill-change review without bouncing between routes.
  const [
    staffResult,
    availabilityResult,
    timeOffResult,
    skillChangeResult,
    configResult,
  ] = await Promise.all([
    getStaffById(staffId),
    getStaffAvailability({ staffId }),
    getTimeOffRequestsByStaff({ staffId }),
    listSkillChangeRequests({ staffId, status: "pending" }),
    getKitchenConfig(),
  ]);

  if (!staffResult.success || !staffResult.data) {
    notFound();
  }

  const staff = staffResult.data;
  const availability = availabilityResult.success ? availabilityResult.data : [];
  const timeOffRequests = timeOffResult.success ? timeOffResult.data : [];
  const skillChangeRequests = skillChangeResult.success
    ? skillChangeResult.data
    : [];
  const roles =
    configResult.success && configResult.data ? configResult.data.roles : [];
  const stations =
    configResult.success && configResult.data
      ? configResult.data.stations
      : [];
  const minTimeOffAdvanceDays =
    configResult.success && configResult.data
      ? configResult.data.minTimeOffAdvanceDays
      : 7;

  return (
    <StaffDetail
      initialStaff={staff}
      initialAvailability={availability}
      initialTimeOffRequests={timeOffRequests}
      initialSkillChangeRequests={skillChangeRequests}
      roles={roles}
      stations={stations}
      minTimeOffAdvanceDays={minTimeOffAdvanceDays}
    />
  );
}
