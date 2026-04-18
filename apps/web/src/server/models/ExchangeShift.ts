import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { IExchangeShift } from "@/types/exchange-shift";
import type { ExchangeShiftStatus } from "@sous/types";

/**
 * Mongoose document for an exchange shift (drop / pickup record).
 *
 * Why a separate model and not a status field on `Shift`?
 *
 *   • The exchange aggregate has its own non-trivial lifecycle and
 *     audit fields (`pickedUpByStaffId`, `approvedByClerkUserId`,
 *     `reason`, `status`). Bolting them onto `Shift` would clutter
 *     the schedule core and force every read of a shift to filter on
 *     a status enum it does not otherwise care about.
 *
 *   • Pickups must be atomic across two documents (re-assign the
 *     `Shift.staffId`, transition the `ExchangeShift.status`) and
 *     using OCC tokens against `ExchangeShift.updatedAt` keeps the
 *     write semantics clean.
 *
 *   • A separate collection means a normal `Shift.find(...)` for the
 *     weekly schedule view never has to know exchange existed; the
 *     mobile exchange tab joins the two only when it needs to.
 */
export interface IExchangeShiftDocument
  extends Omit<
      IExchangeShift,
      | "orgId"
      | "locationId"
      | "shiftId"
      | "scheduleId"
      | "staffId"
      | "pickedUpByStaffId"
    >,
    Document {
  orgId: Types.ObjectId;
  locationId: Types.ObjectId;
  shiftId: Types.ObjectId;
  scheduleId: Types.ObjectId;
  staffId: Types.ObjectId;
  pickedUpByStaffId?: Types.ObjectId | null;
}

const STATUS_VALUES: ExchangeShiftStatus[] = [
  "available",
  "pending_coverage",
  "covered",
  "manager_approved",
  "cancelled",
];

const ExchangeShiftSchema = new Schema<IExchangeShiftDocument>(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    shiftId: {
      type: Schema.Types.ObjectId,
      ref: "Shift",
      required: true,
    },
    scheduleId: {
      type: Schema.Types.ObjectId,
      ref: "Schedule",
      required: true,
    },
    staffId: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },
    droppedByName: {
      type: String,
      required: true,
      maxlength: 200,
    },
    pickedUpByStaffId: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
    },
    pickedUpByName: {
      type: String,
      default: null,
      maxlength: 200,
    },
    start: {
      type: Date,
      required: true,
    },
    end: {
      type: Date,
      required: true,
    },
    station: {
      type: String,
      required: true,
      minlength: 1,
    },
    status: {
      type: String,
      required: true,
      default: "available",
      enum: {
        values: STATUS_VALUES,
        message:
          "Status must be one of: available, pending_coverage, covered, manager_approved, cancelled",
      },
    },
    reason: {
      type: String,
      default: "",
      maxlength: 500,
    },
    approvedByClerkUserId: {
      type: String,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "exchangeshifts",
  }
);

// Tenancy compound index — every list query starts here.
ExchangeShiftSchema.index({ orgId: 1, locationId: 1, status: 1, start: 1 });

// "Show me my drops" — strict equality on staffId.
ExchangeShiftSchema.index({ orgId: 1, locationId: 1, staffId: 1, createdAt: -1 });

// Each Shift can only be on the exchange board once at a time. We
// enforce this with a partial unique index on the OPEN statuses so a
// historical `covered` / `cancelled` row does not block a future drop
// of the same Shift if it gets re-created.
ExchangeShiftSchema.index(
  { shiftId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["available", "pending_coverage"] },
    },
  }
);

// Pre-validate hook: enforce end > start at the model layer too. The
// Zod schema usually catches this, but a misbehaving caller writing
// directly to the service should still trip the model.
ExchangeShiftSchema.pre("validate", function () {
  if (this.end && this.start && this.end <= this.start) {
    this.invalidate("end", "End time must be after start time");
  }
});

// Singleton pattern for Next.js HMR compatibility.
const ExchangeShift: Model<IExchangeShiftDocument> =
  mongoose.models.ExchangeShift ||
  mongoose.model<IExchangeShiftDocument>(
    "ExchangeShift",
    ExchangeShiftSchema
  );

export default ExchangeShift;
