import { z } from "zod";

export const viewportContextSchema = z
  .object({
    /** The location/restaurant the user is currently viewing */
    locationId: z
      .string()
      .trim()
      .min(1, "locationId is required"),
    /** The active week's schedule ID (if viewing a schedule) */
    scheduleId: z.string().trim().optional(),
    /** The specific staff member selected (if any) */
    staffId: z.string().trim().optional(),
    /** The day-of-week in focus (0-6), if applicable */
    focusedDay: z.number().int().min(0).max(6).optional(),
    /** The current page/view name in the UI */
    activeView: z
      .enum(["schedule", "staff", "settings", "dashboard", "availability"])
      .optional(),
  })
  .strip();

export type ViewportContext = z.infer<typeof viewportContextSchema>;
