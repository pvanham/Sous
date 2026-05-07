import { z } from "zod";
import { viewportContextSchema } from "./viewport-context.schema";

const OBJECTID_REGEX = /^[a-f\d]{24}$/i;

export const chatMessageSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, "Message is required and must be between 1 and 4000 characters.")
      .max(4000, "Message is required and must be between 1 and 4000 characters."),
    conversationId: z
      .string()
      .regex(OBJECTID_REGEX, "Invalid conversation ID format.")
      .optional(),
    viewportContext: viewportContextSchema,
  })
  .strip();

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
