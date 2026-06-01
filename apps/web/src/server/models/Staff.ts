import mongoose, { Schema, Document, Model } from "mongoose";
import type { StaffSkill, StaffAddress, IStaff } from "@/types/staff";

// Document interface (with Mongoose document methods)
export interface IStaffDocument extends IStaff, Document {}

// Skill sub-schema
const SkillSchema = new Schema<StaffSkill>(
  {
    station: {
      type: String,
      required: true,
    },
    proficiency: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
  },
  { _id: false }
);

// Address sub-schema. Embedded on the Staff document so patches can
// replace the whole block in one `$set` and there's no join.
// Top-level `address` is optional — when absent (default), the staff
// member hasn't entered an address yet. To clear an existing address,
// callers send `address: null` which we translate to `$unset`.
const AddressSchema = new Schema<StaffAddress>(
  {
    line1: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    line2: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
    },
    city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    state: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 3,
    },
    postalCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10,
    },
  },
  { _id: false }
);

// Main Staff schema
const StaffSchema = new Schema<IStaffDocument>(
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
    name: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      set: (v: string) => v.replace(/[\s\-\(\)]/g, ""), // Normalize phone numbers
    },
    roles: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: "At least one role is required",
      },
    },
    skills: {
      type: [SkillSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Phase 3: Staff constraints for AI scheduling
    maxHoursPerWeek: {
      type: Number,
      default: 40,
      min: 0,
      max: 168, // 24 * 7
    },
    minHoursPerWeek: {
      type: Number,
      default: 0,
      min: 0,
    },
    preferredStations: {
      type: [String],
      default: [],
    },
    certifications: {
      type: [String],
      default: [],
    },
    hourlyRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    address: {
      type: AddressSchema,
      required: false,
      default: undefined,
    },
    clerkUserId: {
      type: String,
      default: null,
    },
    // Public URL of the staff member's profile picture. Mirrored from
    // Clerk (which hosts the actual file) so we can render avatars in
    // roster / schedule lists without a per-row Clerk API round-trip.
    // `null` indicates the staff member is using the Clerk default
    // avatar; consumers fall back to initials.
    imageUrl: {
      type: String,
      default: null,
    },
    invitationStatus: {
      type: String,
      enum: ["not_invited", "pending", "accepted"],
      default: "not_invited",
    },
    // Set the first time a staff member finishes the mobile onboarding
    // wizard. `null` ⇒ wizard has not been completed yet; a `Date` ⇒
    // completed (AuthGate routes such users straight to the tabs). The
    // value is set server-side via `POST /api/me/onboarding/complete`
    // and is intentionally separate from `invitationStatus`, which
    // tracks the Clerk invitation lifecycle (not in-app setup).
    onboardingCompletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "staff", // Explicit collection name (prevents Mongoose auto-pluralization to "staffs")
  }
);

// Pre-save validation: maxHoursPerWeek must be >= minHoursPerWeek
StaffSchema.pre("save", function () {
  if (this.maxHoursPerWeek < this.minHoursPerWeek) {
    throw new Error(
      "Maximum hours per week must be greater than or equal to minimum hours per week"
    );
  }
});

// Composite unique index: one email per location
StaffSchema.index({ orgId: 1, locationId: 1, email: 1 }, { unique: true });

// Index for SMS lookup (phone number per location)
StaffSchema.index({ orgId: 1, locationId: 1, phone: 1 });

// Sparse index for Clerk user linkage
StaffSchema.index({ clerkUserId: 1 }, { sparse: true });

// Singleton pattern for Next.js HMR compatibility
const Staff: Model<IStaffDocument> =
  mongoose.models.Staff ||
  mongoose.model<IStaffDocument>("Staff", StaffSchema);

export default Staff;
