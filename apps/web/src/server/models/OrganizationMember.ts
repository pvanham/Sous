import mongoose, { Schema, Document, Model, Types } from "mongoose";

// Role type for organization members
export type MemberRole = "owner" | "manager" | "shift_lead" | "staff";

// OrganizationMember interface
export interface IOrganizationMember {
  orgId: Types.ObjectId; // Reference to Organization
  locationId: Types.ObjectId | null; // Reference to Location, null for org-wide access
  clerkUserId: string; // Clerk user ID
  role: MemberRole;
  createdAt: Date;
  updatedAt: Date;
}

// Document interface (with Mongoose document methods)
export interface IOrganizationMemberDocument
  extends IOrganizationMember,
    Document {}

// Valid member roles
const MEMBER_ROLES: MemberRole[] = ["owner", "manager", "shift_lead", "staff"];

// Main OrganizationMember schema
const OrganizationMemberSchema = new Schema<IOrganizationMemberDocument>(
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
      default: null,
      index: true,
    },
    clerkUserId: {
      type: String,
      required: true,
      index: true,
    },
    role: {
      type: String,
      required: true,
      enum: MEMBER_ROLES,
      default: "manager",
    },
  },
  {
    timestamps: true,
    collection: "organization_members",
  }
);

// Unique constraint: one membership per user per org-location combination
OrganizationMemberSchema.index(
  { orgId: 1, locationId: 1, clerkUserId: 1 },
  { unique: true }
);

// Singleton pattern for Next.js HMR compatibility
const OrganizationMember: Model<IOrganizationMemberDocument> =
  mongoose.models.OrganizationMember ||
  mongoose.model<IOrganizationMemberDocument>(
    "OrganizationMember",
    OrganizationMemberSchema
  );

export default OrganizationMember;
