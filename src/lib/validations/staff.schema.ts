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

// Main staff schema - used for creating/updating staff
// Note: skills and isActive are required to ensure input/output types match
// for react-hook-form compatibility. Use defaultStaffValues for form defaults.
export const staffSchema = z.object({
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
});

// Partial staff schema for updates
export const staffUpdateSchema = staffSchema.partial();

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
export const importStaffSchema = z.array(staffSchema.omit({ isActive: true }));

// Schema for paginated staff list params
export const staffListParamsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().optional(),
});

// Types inferred from schemas
export type StaffInput = z.infer<typeof staffSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
export type CsvRowInput = z.infer<typeof csvRowSchema>;
export type ImportStaffInput = z.infer<typeof importStaffSchema>;
export type SkillInput = z.infer<typeof skillSchema>;

// Explicit form values type for react-hook-form compatibility
// This ensures consistent types between the form and zodResolver
export interface StaffFormValues {
  name: string;
  email: string;
  phone: string;
  roles: string[];
  skills: Array<{ station: string; proficiency: number }>;
  isActive: boolean;
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
};
