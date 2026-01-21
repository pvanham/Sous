import { listStaffPaginated } from "@/server/actions/staff.actions";
import { StaffTable } from "./_components/StaffTable";
import { StaffCsvUploadButton } from "./_components/StaffCsvUploadButton";
import { AddStaffButton } from "./_components/AddStaffButton";

export default async function StaffPage() {
  // Fetch initial paginated data (page 1, 10 per page, sorted A-Z)
  const result = await listStaffPaginated({
    page: 1,
    pageSize: 10,
    sortOrder: "asc",
  });

  // Default empty result if fetch fails
  const initialData = result.success
    ? result.data
    : { staff: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Directory</h1>
          <p className="text-muted-foreground">
            Manage your team members and their skills.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddStaffButton />
          <StaffCsvUploadButton />
        </div>
      </div>

      <StaffTable initialData={initialData} />
    </div>
  );
}
