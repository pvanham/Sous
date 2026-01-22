// Schedule status type
export type ScheduleStatus = "DRAFT" | "PUBLISHED";

// Schedule interface matching Mongoose document
export interface ISchedule {
  userId: string;
  weekStartDate: Date;
  status: ScheduleStatus;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

// DTO returned from service layer (without Mongoose internals)
export interface ScheduleDTO {
  id: string;
  userId: string;
  weekStartDate: Date;
  status: ScheduleStatus;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

// Helper function to convert Mongoose document to DTO
export function toScheduleDTO(doc: ISchedule & { _id: unknown }): ScheduleDTO {
  return {
    id: String(doc._id),
    userId: doc.userId,
    weekStartDate: doc.weekStartDate,
    status: doc.status,
    notes: doc.notes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
