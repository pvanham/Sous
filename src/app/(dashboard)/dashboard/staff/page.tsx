import { listStaffPaginated } from "@/server/actions/staff.actions";
import { StaffTable } from "./_components/StaffTable";
import { StaffCsvUploadButton } from "./_components/StaffCsvUploadButton";
import { AddStaffButton } from "./_components/AddStaffButton";
import { Users } from "lucide-react";

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
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background/50 px-6 py-4 shadow-sm backdrop-blur-xl sm:px-8 sm:py-5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 opacity-70" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
                Staff Directory
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage your team members and their skills.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AddStaffButton />
            <StaffCsvUploadButton />
          </div>
        </div>
      </div>

      <StaffTable initialData={initialData} />
    </div>
  );
}
