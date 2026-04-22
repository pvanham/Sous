import { z } from "zod";

/**
 * Phone number validation schema.
 * Accepts various formats (parentheses, dashes, spaces, plus) but validates
 * that the underlying number has the correct digit count:
 * - 10 digits for US numbers
 * - 11 digits if starting with country code 1
 */
const phoneSchema = z
  .string()
  .min(10, "Phone number must be at least 10 characters")
  .refine(
    (val) => {
      // Strip all non-digit characters
      const digits = val.replace(/\D/g, "");
      // Must have exactly 10 digits (US) or 11 (with country code 1)
      return (
        digits.length === 10 ||
        (digits.length === 11 && digits.startsWith("1"))
      );
    },
    { message: "Phone number must contain 10 digits (or 11 with country code)" }
  );

// Proficiency type
export type Proficiency = 1 | 2 | 3 | 4 | 5;

// Skill schema for individual skill entries
// Using simple number validation for react-hook-form compatibility
export const skillSchema = z.object({
  station: z.string().min(1, "Station name is required"),
  proficiency: z
    .number()
    .int()
    .min(1, "Proficiency must be at least 1")
    .max(5, "Proficiency cannot exceed 5"),
});

// Physical address schema. All fields are trimmed on the server when
// persisted; zod lets empty strings through at this layer so the
// client-side form can distinguish "not entered" from "intentionally
// cleared" before submission.
export const addressSchema = z.object({
  line1: z
    .string()
    .min(1, "Street address is required")
    .max(200, "Street address is too long"),
  line2: z.string().max(200, "Address line 2 is too long").optional(),
  city: z
    .string()
    .min(1, "City is required")
    .max(100, "City is too long"),
  state: z
    .string()
    .min(2, "State must be at least 2 characters")
    .max(3, "State must be at most 3 characters"),
  postalCode: z
    .string()
    .min(3, "Postal code is required")
    .max(10, "Postal code is too long"),
});

// Base staff object schema (without refinements)
// This is used for .partial() and .omit() which don't work on refined schemas
const staffBaseSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters"),
  email: z.string().email("Invalid email address").toLowerCase(),
  phone: phoneSchema,
  roles: z
    .array(z.string().min(1, "Role name cannot be empty"))
    .min(1, "At least one role is required"),
  skills: z.array(skillSchema),
  isActive: z.boolean(),
  // Phase 3: Staff constraints for AI scheduling
  maxHoursPerWeek: z
    .number()
    .int()
    .min(0, "Maximum hours cannot be negative")
    .max(168, "Maximum hours cannot exceed 168 (24*7)")
    .optional()
    .default(40),
  minHoursPerWeek: z
    .number()
    .int()
    .min(0, "Minimum hours cannot be negative")
    .optional()
    .default(0),
  preferredStations: z.array(z.string()).optional().default([]),
  certifications: z.array(z.string()).optional().default([]),
  hourlyRate: z
    .number()
    .min(0, "Hourly rate cannot be negative")
    .optional()
    .default(0),
  // Optional mailing address. Nullable so callers can explicitly
  // clear an existing address through the same update path.
  address: addressSchema.nullable().optional(),
});

// Extended staff schema with optional sendInvite flag for the creation form
const staffWithInviteBaseSchema = staffBaseSchema.extend({
  sendInvite: z.boolean().optional().default(false),
});

// Main staff schema with cross-field validation
// Note: skills and isActive are required to ensure input/output types match
// for react-hook-form compatibility. Use defaultStaffValues for form defaults.
export const staffSchema = staffBaseSchema.refine(
  (data) => {
    const max = data.maxHoursPerWeek ?? 40;
    const min = data.minHoursPerWeek ?? 0;
    return max >= min;
  },
  {
    message:
      "Maximum hours per week must be greater than or equal to minimum hours",
    path: ["maxHoursPerWeek"],
  }
);

// Partial staff schema for updates (uses base schema without refinements)
export const staffUpdateSchema = staffBaseSchema.partial();

// CSV row schema - more flexible for import (skills parsed from string)
export const csvRowSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters"),
  email: z.string().email("Invalid email address").toLowerCase(),
  phone: phoneSchema,
  roles: z.string().min(1, "At least one role is required"), // Comma-separated string
  skills: z.string().optional().default(""), // Format: "Station:Proficiency,Station:Proficiency"
});

// Schema for bulk CSV import - array of staff data (already parsed)
// Uses base schema without refinements since .omit() doesn't work on refined schemas
export const importStaffSchema = z.array(staffBaseSchema.omit({ isActive: true }));

// Schema for paginated staff list params
export const staffListParamsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().optional(),
});

// Staff with invite schema with cross-field validation
export const staffWithInviteSchema = staffWithInviteBaseSchema.refine(
  (data) => {
    const max = data.maxHoursPerWeek ?? 40;
    const min = data.minHoursPerWeek ?? 0;
    return max >= min;
  },
  {
    message:
      "Maximum hours per week must be greater than or equal to minimum hours",
    path: ["maxHoursPerWeek"],
  }
);

// Types inferred from schemas
export type StaffInput = z.infer<typeof staffSchema>;
export type StaffWithInviteInput = z.infer<typeof staffWithInviteSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
export type CsvRowInput = z.infer<typeof csvRowSchema>;
export type ImportStaffInput = z.infer<typeof importStaffSchema>;
export type SkillInput = z.infer<typeof skillSchema>;
export type AddressInput = z.infer<typeof addressSchema>;

// Explicit form values type for react-hook-form compatibility
// This ensures consistent types between the form and zodResolver
export interface StaffFormValues {
  name: string;
  email: string;
  phone: string;
  roles: string[];
  skills: Array<{ station: string; proficiency: number }>;
  isActive: boolean;
  sendInvite?: boolean;
  // Phase 3: Staff constraints for AI scheduling
  maxHoursPerWeek?: number;
  minHoursPerWeek?: number;
  preferredStations?: string[];
  certifications?: string[];
  hourlyRate?: number;
}

// Helper function to parse CSV row into StaffInput format
export function parseCsvRowToStaff(row: CsvRowInput): Omit<StaffInput, "isActive"> {
  // Parse roles from comma-separated string
  const roles = row.roles
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  // Parse skills from "Station:Proficiency,Station:Proficiency" format
  const skills: SkillInput[] = [];
  if (row.skills && row.skills.trim() !== "") {
    const skillPairs = row.skills.split(",").map((s) => s.trim());
    for (const pair of skillPairs) {
      const [station, profStr] = pair.split(":").map((p) => p.trim());
      if (station && profStr) {
        const proficiency = parseInt(profStr, 10);
        if (proficiency >= 1 && proficiency <= 5) {
          skills.push({ station, proficiency: proficiency as 1 | 2 | 3 | 4 | 5 });
        }
      }
    }
  }

  return {
    name: row.name,
    email: row.email.toLowerCase(),
    phone: row.phone,
    roles,
    skills,
    // Phase 3: Use defaults for CSV imports
    maxHoursPerWeek: 40,
    minHoursPerWeek: 0,
    preferredStations: [],
    certifications: [],
    hourlyRate: 0,
  };
}

// Default values for new staff form
export const defaultStaffValues: StaffInput = {
  name: "",
  email: "",
  phone: "",
  roles: [],
  skills: [],
  isActive: true,
  // Phase 3: Staff constraints for AI scheduling
  maxHoursPerWeek: 40,
  minHoursPerWeek: 0,
  preferredStations: [],
  certifications: [],
  hourlyRate: 0,
};
