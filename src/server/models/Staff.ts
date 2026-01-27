import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { StaffSkill, IStaff } from "@/types/staff";

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
  },
  {
    timestamps: true,
    collection: "staff", // Explicit collection name (prevents Mongoose auto-pluralization to "staffs")
  }
);

// Composite unique index: one email per location
StaffSchema.index({ orgId: 1, locationId: 1, email: 1 }, { unique: true });

// Index for SMS lookup (phone number per location)
StaffSchema.index({ orgId: 1, locationId: 1, phone: 1 });

// Singleton pattern for Next.js HMR compatibility
const Staff: Model<IStaffDocument> =
  mongoose.models.Staff ||
  mongoose.model<IStaffDocument>("Staff", StaffSchema);

export default Staff;
