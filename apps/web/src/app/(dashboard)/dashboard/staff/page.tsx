import { listStaffPaginated } from "@/server/actions/staff.actions";
import { listSkillChangeRequests } from "@/server/actions/skill-change-request.actions";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { parseStaffListSearchParams } from "@/lib/staff-list-params";
import { StaffTable } from "./_components/StaffTable";
import { StaffCsvUploadButton } from "./_components/StaffCsvUploadButton";
import { AddStaffButton } from "./_components/AddStaffButton";
import { Users } from "lucide-react";

type StaffPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StaffPage({ searchParams }: StaffPageProps) {
  const rawParams = searchParams ? await searchParams : undefined;
  const listParams = parseStaffListSearchParams(rawParams);

  const [result, skillChangeResult, configResult] = await Promise.all([
    listStaffPaginated(listParams),
    listSkillChangeRequests({ status: "pending" }),
    getKitchenConfig(),
  ]);

  const initialError = result.success ? null : result.error;
  const initialData = result.success
    ? result.data
    : {
        staff: [],
        total: 0,
        page: listParams.page,
        pageSize: listParams.pageSize,
        totalPages: 0,
      };

  const initialSkillChangeRequests = skillChangeResult.success
    ? skillChangeResult.data
    : [];

  const roles =
    configResult.success && configResult.data ? configResult.data.roles : [];
  const stations =
    configResult.success && configResult.data
      ? configResult.data.stations
      : [];

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

      <StaffTable
        initialData={initialData}
        initialParams={listParams}
        initialError={initialError}
        initialSkillChangeRequests={initialSkillChangeRequests}
        roles={roles}
        stations={stations}
      />
    </div>
  );
}
