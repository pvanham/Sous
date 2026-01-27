import { z } from "zod";

// Validate IANA timezone
const isValidTimezone = (tz: string): boolean => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// E.164 phone number regex (international format)
const e164Regex = /^\+[1-9]\d{1,14}$/;

// Schema for creating a location
export const createLocationSchema = z.object({
  name: z
    .string()
    .min(2, "Location name must be at least 2 characters")
    .max(100, "Location name must be at most 100 characters"),
  timezone: z
    .string()
    .refine(isValidTimezone, "Invalid IANA timezone")
    .default("America/New_York"),
  twilioPhoneNumber: z
    .string()
    .regex(e164Regex, "Phone number must be in E.164 format (e.g., +15551234567)")
    .optional(),
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;

// Schema for updating a location
export const updateLocationSchema = z.object({
  name: z
    .string()
    .min(2, "Location name must be at least 2 characters")
    .max(100, "Location name must be at most 100 characters")
    .optional(),
  timezone: z
    .string()
    .refine(isValidTimezone, "Invalid IANA timezone")
    .optional(),
  twilioPhoneNumber: z
    .string()
    .regex(e164Regex, "Phone number must be in E.164 format (e.g., +15551234567)")
    .nullable()
    .optional(),
});

export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
