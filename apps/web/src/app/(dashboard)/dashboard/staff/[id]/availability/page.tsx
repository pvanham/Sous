import { redirect } from "next/navigation";

interface AvailabilityPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Availability now lives on the consolidated staff detail page
 * (`/dashboard/staff/[id]`) under the "Availability" tab. This route is
 * kept as a permanent redirect so existing links keep working.
 */
export default async function AvailabilityPage({
  params,
}: AvailabilityPageProps) {
  const { id } = await params;
  redirect(`/dashboard/staff/${id}?tab=availability`);
}
