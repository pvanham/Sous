import { z } from "zod";

export const inviteManagerSchema = z.object({
  email: z.string().email("Invalid email address"),
  locationId: z.string().min(1, "Location is required"),
});

export type InviteManagerInput = z.infer<typeof inviteManagerSchema>;
