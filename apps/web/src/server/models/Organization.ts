import mongoose, { Schema, Document, Model } from "mongoose";

// Organization interface
export interface IOrganization {
  ownerId: string; // Clerk userId of the owner
  name: string;
  subscriptionTier: "free" | "pro" | "enterprise";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Document interface (with Mongoose document methods)
export interface IOrganizationDocument extends IOrganization, Document {}

// Main Organization schema
const OrganizationSchema = new Schema<IOrganizationDocument>(
  {
    ownerId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 100,
    },
    subscriptionTier: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      default: "free",
      required: true,
    },
    stripeCustomerId: {
      type: String,
      sparse: true,
    },
    stripeSubscriptionId: {
      type: String,
      sparse: true,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    currentPeriodEnd: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: "organizations",
  }
);

// Singleton pattern for Next.js HMR compatibility
const Organization: Model<IOrganizationDocument> =
  mongoose.models.Organization ||
  mongoose.model<IOrganizationDocument>("Organization", OrganizationSchema);

export default Organization;
