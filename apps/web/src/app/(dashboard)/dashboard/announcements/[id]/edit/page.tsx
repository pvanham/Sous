import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Megaphone } from "lucide-react";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { getAnnouncementById } from "@/server/actions/announcement.actions";
import { AnnouncementComposer } from "../../_components/AnnouncementComposer";
import type { CreateAnnouncementInput } from "@/lib/validations/announcement.schema";

type EditAnnouncementPageProps = {
  params: Promise<{ id: string }>;
};

function toComposerInitialValues(
  source: CreateAnnouncementInput
): Partial<CreateAnnouncementInput> {
  return { ...source };
}

export default async function EditAnnouncementPage({
  params,
}: EditAnnouncementPageProps) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return null;

  const ctx = await getLocationContext(userId);
  if (ctx.role !== "owner" && ctx.role !== "manager") {
    redirect("/dashboard");
  }

  const [announcementResult, configResult] = await Promise.all([
    getAnnouncementById(id),
    getKitchenConfig(),
  ]);
  if (!announcementResult.success) {
    notFound();
  }

  const announcement = announcementResult.data;
  const availableRoles =
    configResult.success && configResult.data ? configResult.data.roles : [];
  const managerRoles =
    configResult.success && configResult.data ? configResult.data.managerRoles : [];

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
              Edit Announcement
            </h1>
            <p className="text-sm text-muted-foreground">
              Update title, audience, timing, and attachments.
            </p>
          </div>
        </div>
      </div>

      <AnnouncementComposer
        mode={{ kind: "edit", announcementId: announcement.id }}
        initialValues={toComposerInitialValues({
          title: announcement.title,
          body: announcement.body,
          priority: announcement.priority,
          targetAudience: announcement.targetAudience,
          tags: announcement.tags,
          publishDate: announcement.publishDate,
          expirationDate: announcement.expirationDate,
          attachments: announcement.attachments,
          requiresAcknowledgment: announcement.requiresAcknowledgment,
        })}
        initialAvailableRoles={availableRoles}
        initialManagerRoles={managerRoles}
      />
    </div>
  );
}
