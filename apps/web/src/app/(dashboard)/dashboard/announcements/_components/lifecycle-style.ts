import type { VariantProps } from "class-variance-authority";

import { badgeVariants } from "@/components/ui/badge";

export type AnnouncementLifecycle = "draft" | "scheduled" | "active" | "expired";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export type LifecycleStyle = {
  spineClass: string;
  dotClass: string;
  emptyBorderClass: string;
  emptyBgClass: string;
  badgeVariant: BadgeVariant;
};

export const LIFECYCLE_STYLE: Record<AnnouncementLifecycle, LifecycleStyle> = {
  draft: {
    spineClass: "before:bg-amber-700/60",
    dotClass: "bg-amber-700",
    emptyBorderClass: "border-amber-700/30",
    emptyBgClass: "bg-amber-700/5",
    badgeVariant: "draft",
  },
  scheduled: {
    spineClass: "before:bg-teal-700/60",
    dotClass: "bg-teal-700",
    emptyBorderClass: "border-teal-700/30",
    emptyBgClass: "bg-teal-700/5",
    badgeVariant: "info",
  },
  active: {
    spineClass: "before:bg-emerald-600/70",
    dotClass: "bg-emerald-600",
    emptyBorderClass: "border-emerald-600/30",
    emptyBgClass: "bg-emerald-600/5",
    badgeVariant: "published",
  },
  expired: {
    spineClass: "before:bg-stone-400/60 dark:before:bg-stone-500/60",
    dotClass: "bg-stone-400 dark:bg-stone-500",
    emptyBorderClass: "border-stone-400/40",
    emptyBgClass: "bg-stone-400/5",
    badgeVariant: "outline",
  },
};
