import { Megaphone } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { getAnnouncementById } from "@/server/actions/announcement.actions";
import { AnnouncementComposer } from "../_components/AnnouncementComposer";
import type { CreateAnnouncementInput } from "@/lib/validations/announcement.schema";

/**
 * Phase 3 — Announcement Composer access guard + audience bootstrap.
 */
type CreateAnnouncementPageProps = {
  searchParams?: Promise<{ from?: string }>;
};

function buildDuplicateInitialValues(
  source: CreateAnnouncementInput
): Partial<CreateAnnouncementInput> {
  const titleSuffix = " (Copy)";
  const title =
    source.title.length + titleSuffix.length <= 120
      ? `${source.title}${titleSuffix}`
      : source.title;

  return {
    ...source,
    title,
  };
}

export default async function CreateAnnouncementPage({
  searchParams,
}: CreateAnnouncementPageProps) {
  const { userId } = await auth();
  if (!userId) return null;

  const ctx = await getLocationContext(userId);
  if (ctx.role !== "owner" && ctx.role !== "manager") {
    redirect("/dashboard");
  }

  const configResult = await getKitchenConfig();
  const availableRoles =
    configResult.success && configResult.data ? configResult.data.roles : [];
  const managerRoles =
    configResult.success && configResult.data ? configResult.data.managerRoles : [];

  let initialValues: Partial<CreateAnnouncementInput> | undefined;
  const params = await searchParams;
  const duplicateSourceId = params?.from;
  if (duplicateSourceId) {
    const source = await getAnnouncementById(duplicateSourceId);
    if (source.success) {
      initialValues = buildDuplicateInitialValues({
        title: source.data.title,
        body: source.data.body,
        priority: source.data.priority,
        targetAudience: source.data.targetAudience,
        tags: source.data.tags,
        publishDate: source.data.publishDate,
        expirationDate: source.data.expirationDate,
        attachments: source.data.attachments,
        requiresAcknowledgment: source.data.requiresAcknowledgment,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background/50 px-6 py-4 shadow-sm backdrop-blur-xl sm:px-8 sm:py-5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 opacity-70" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md">
            <Megaphone className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
              New Announcement
            </h1>
            <p className="text-sm text-muted-foreground">
              Draft and publish a staff announcement for your location.
            </p>
          </div>
        </div>
      </div>

      <AnnouncementComposer
        mode={{ kind: "create" }}
        initialValues={initialValues}
        initialAvailableRoles={availableRoles}
        initialManagerRoles={managerRoles}
      />
    </div>
  );
}
