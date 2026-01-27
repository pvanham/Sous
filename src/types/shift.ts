// Shift interface matching Mongoose document (raw)
// Note: ObjectIds in MongoDB become strings after conversion
export interface IShift {
  orgId: unknown; // ObjectId in document, string after conversion
  locationId: unknown; // ObjectId in document, string after conversion
  scheduleId: unknown; // ObjectId in document, string after conversion
  staffId: unknown; // ObjectId in document, string after conversion
  start: Date;
  end: Date;
  station: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

// DTO returned from service layer (without Mongoose internals)
export interface ShiftDTO {
  id: string;
  orgId: string;
  locationId: string;
  scheduleId: string;
  staffId: string;
  start: Date;
  end: Date;
  station: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

// Input type for creating a shift
export interface CreateShiftInput {
  orgId: string;
  locationId: string;
  scheduleId: string;
  staffId: string;
  start: Date;
  end: Date;
  station: string;
  notes?: string;
}

// Input type for updating a shift
export interface UpdateShiftInput {
  start?: Date;
  end?: Date;
  station?: string;
  notes?: string;
}

// Helper function to convert Mongoose document to DTO
export function toShiftDTO(doc: IShift & { _id: unknown }): ShiftDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    scheduleId: String(doc.scheduleId),
    staffId: String(doc.staffId),
    start: doc.start,
    end: doc.end,
    station: doc.station,
    notes: doc.notes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
