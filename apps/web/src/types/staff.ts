// Re-export shared types from @sous/types
export type {
  StaffSkill,
  StaffDTO,
  StaffListParams,
  PaginatedStaffResult,
  ImportRowError,
  ImportResult,
} from "@sous/types";

// ── Server-coupled: Mongoose document interface ──────────────

export interface IStaff {
  orgId: unknown;
  locationId: unknown;
  name: string;
  email: string;
  phone: string;
  roles: string[];
  skills: import("@sous/types").StaffSkill[];
  isActive: boolean;
  maxHoursPerWeek: number;
  minHoursPerWeek: number;
  preferredStations: string[];
  certifications: string[];
  hourlyRate: number;
  createdAt: Date;
  updatedAt: Date;
}

// Helper function to convert Mongoose document to DTO
export function toStaffDTO(doc: IStaff & { _id: unknown }): import("@sous/types").StaffDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    name: doc.name,
    email: doc.email,
    phone: doc.phone,
    roles: doc.roles,
    skills: doc.skills,
    isActive: doc.isActive,
    maxHoursPerWeek: doc.maxHoursPerWeek,
    minHoursPerWeek: doc.minHoursPerWeek,
    preferredStations: doc.preferredStations,
    certifications: doc.certifications,
    hourlyRate: doc.hourlyRate,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
