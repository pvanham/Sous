// Re-export shared types from @sous/types — the wire shape lives in
// `packages/types/src/index.ts` and is consumed identically by both
// the web app and the mobile app.
export type {
  ExchangeShiftStatus,
  ExchangeShiftDTO,
} from "@sous/types";

import type { ExchangeShiftDTO, ExchangeShiftStatus } from "@sous/types";

// ── Server-coupled: Mongoose document interface ──────────────
//
// All foreign-key fields are typed as `unknown` so this file (which
// is imported by both `apps/web/src/types` consumers and the
// model file) never reaches into `mongoose`. The model maps
// `unknown → Types.ObjectId` at the schema definition layer.
export interface IExchangeShift {
  orgId: unknown;
  locationId: unknown;
  shiftId: unknown;
  scheduleId: unknown;
  staffId: unknown;
  droppedByName: string;
  pickedUpByStaffId?: unknown | null;
  pickedUpByName?: string | null;
  start: Date;
  end: Date;
  station: string;
  status: ExchangeShiftStatus;
  reason: string;
  approvedByClerkUserId?: string | null;
  approvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Convert a lean Mongoose document into the wire-safe DTO.
 *
 * `pickedUpByStaffId` is stringified only when present so we never
 * emit `"null"` to the client.
 */
export function toExchangeShiftDTO(
  doc: IExchangeShift & { _id: unknown }
): ExchangeShiftDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    shiftId: String(doc.shiftId),
    scheduleId: String(doc.scheduleId),
    staffId: String(doc.staffId),
    droppedByName: doc.droppedByName,
    pickedUpByStaffId:
      doc.pickedUpByStaffId == null ? null : String(doc.pickedUpByStaffId),
    pickedUpByName: doc.pickedUpByName ?? null,
    start: doc.start,
    end: doc.end,
    station: doc.station,
    status: doc.status,
    reason: doc.reason,
    approvedByClerkUserId: doc.approvedByClerkUserId ?? null,
    approvedAt: doc.approvedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
