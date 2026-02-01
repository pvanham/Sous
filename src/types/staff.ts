// Staff skill type
export interface StaffSkill {
  station: string;
  proficiency: 1 | 2 | 3 | 4 | 5;
}

// Staff interface matching Mongoose document
export interface IStaff {
  orgId: unknown; // ObjectId in document, string after conversion
  locationId: unknown; // ObjectId in document, string after conversion
  name: string;
  email: string;
  phone: string;
  roles: string[];
  skills: StaffSkill[];
  isActive: boolean;
  // Phase 3: Staff constraints for AI scheduling
  maxHoursPerWeek: number;
  minHoursPerWeek: number;
  preferredStations: string[];
  certifications: string[];
  hourlyRate: number;
  createdAt: Date;
  updatedAt: Date;
}

// DTO returned from service layer (without Mongoose internals)
export interface StaffDTO {
  id: string;
  orgId: string;
  locationId: string;
  name: string;
  email: string;
  phone: string;
  roles: string[];
  skills: StaffSkill[];
  isActive: boolean;
  // Phase 3: Staff constraints for AI scheduling
  maxHoursPerWeek: number;
  minHoursPerWeek: number;
  preferredStations: string[];
  certifications: string[];
  hourlyRate: number;
  createdAt: Date;
  updatedAt: Date;
}

// Individual row error for detailed reporting
export interface ImportRowError {
  row: number;
  email: string;
  reason: string;
}

// Import result type for CSV bulk upsert
export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: ImportRowError[];
}

// Parameters for paginated staff list
export interface StaffListParams {
  page: number;
  pageSize: number;
  sortOrder: "asc" | "desc";
  search?: string;
}

// Paginated result for staff list
export interface PaginatedStaffResult {
  staff: StaffDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Helper function to convert Mongoose document to DTO
export function toStaffDTO(doc: IStaff & { _id: unknown }): StaffDTO {
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
    // Phase 3: Staff constraints for AI scheduling
    maxHoursPerWeek: doc.maxHoursPerWeek,
    minHoursPerWeek: doc.minHoursPerWeek,
    preferredStations: doc.preferredStations,
    certifications: doc.certifications,
    hourlyRate: doc.hourlyRate,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
