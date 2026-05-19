import { z } from "zod";

export const BUSINESS_TYPES = [
  "qsr",
  "fast_casual",
  "fine_dining",
  "catering",
  "bar",
  "cafe",
  "other",
] as const;

export const businessTypeSchema = z.enum(BUSINESS_TYPES);
export type BusinessType = z.infer<typeof businessTypeSchema>;

// Schema for creating an organization
export const createOrganizationSchema = z.object({
  name: z
    .string()
    .min(2, "Organization name must be at least 2 characters")
    .max(100, "Organization name must be at most 100 characters"),
  businessType: businessTypeSchema.optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

// Schema for updating an organization
export const updateOrganizationSchema = z.object({
  name: z
    .string()
    .min(2, "Organization name must be at least 2 characters")
    .max(100, "Organization name must be at most 100 characters")
    .optional(),
  businessType: businessTypeSchema.optional(),
});

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
