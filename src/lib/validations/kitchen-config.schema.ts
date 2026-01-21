import { z } from "zod";

// Time format regex: HH:MM (24-hour format)
const timeFormatRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Operating hours schema for a single day
export const operatingHoursSchema = z.object({
  isOpen: z.boolean(),
  open: z
    .string()
    .regex(timeFormatRegex, "Invalid time format. Use HH:MM (e.g., 09:00)")
    .optional()
    .or(z.literal("")),
  close: z
    .string()
    .regex(timeFormatRegex, "Invalid time format. Use HH:MM (e.g., 22:00)")
    .optional()
    .or(z.literal("")),
});

// Days of the week
export const DAYS_OF_WEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

// Operating hours for all days
export const weeklyOperatingHoursSchema = z.object({
  monday: operatingHoursSchema,
  tuesday: operatingHoursSchema,
  wednesday: operatingHoursSchema,
  thursday: operatingHoursSchema,
  friday: operatingHoursSchema,
  saturday: operatingHoursSchema,
  sunday: operatingHoursSchema,
});

// Main kitchen config schema - shared between frontend form and backend validation
export const kitchenConfigSchema = z.object({
  name: z
    .string()
    .min(2, "Restaurant name must be at least 2 characters")
    .max(100, "Restaurant name must be less than 100 characters"),
  stations: z
    .array(z.string().min(1, "Station name cannot be empty"))
    .min(1, "At least one station is required"),
  roles: z
    .array(z.string().min(1, "Role name cannot be empty"))
    .min(1, "At least one role is required"),
  operatingHours: weeklyOperatingHoursSchema,
});

// Type inferred from the schema - used for form input
export type KitchenConfigInput = z.infer<typeof kitchenConfigSchema>;

// Type for operating hours
export type OperatingHours = z.infer<typeof operatingHoursSchema>;

// Default operating hours for form initialization
export const defaultOperatingHours: OperatingHours = {
  isOpen: false,
  open: "09:00",
  close: "22:00",
};

// Default form values
export const defaultKitchenConfigValues: KitchenConfigInput = {
  name: "",
  stations: [""],
  roles: [""],
  operatingHours: {
    monday: { isOpen: true, open: "09:00", close: "22:00" },
    tuesday: { isOpen: true, open: "09:00", close: "22:00" },
    wednesday: { isOpen: true, open: "09:00", close: "22:00" },
    thursday: { isOpen: true, open: "09:00", close: "22:00" },
    friday: { isOpen: true, open: "09:00", close: "22:00" },
    saturday: { isOpen: true, open: "09:00", close: "22:00" },
    sunday: { isOpen: false, open: "09:00", close: "22:00" },
  },
};
