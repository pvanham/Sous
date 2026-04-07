import mongoose, { Schema, Document, Model, Types } from "mongoose";

// Location interface
export interface ILocation {
  orgId: Types.ObjectId; // Reference to Organization
  name: string;
  timezone: string; // IANA timezone (e.g., "America/New_York")
  twilioPhoneNumber?: string; // E.164 format, optional
  createdAt: Date;
  updatedAt: Date;
}

// Document interface (with Mongoose document methods)
export interface ILocationDocument extends ILocation, Document {}

// Main Location schema
const LocationSchema = new Schema<ILocationDocument>(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 100,
    },
    timezone: {
      type: String,
      required: true,
      default: "America/New_York",
      validate: {
        validator: (v: string) => {
          // Basic IANA timezone format validation
          try {
            Intl.DateTimeFormat(undefined, { timeZone: v });
            return true;
          } catch {
            return false;
          }
        },
        message: "Invalid IANA timezone",
      },
    },
    twilioPhoneNumber: {
      type: String,
      sparse: true, // Allow null/undefined, but unique when set
      set: (v: string | undefined) => {
        if (!v) return undefined;
        // Normalize to E.164 format
        const cleaned = v.replace(/[\s\-\(\)]/g, "");
        return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
      },
    },
  },
  {
    timestamps: true,
    collection: "locations",
  }
);

// Unique phone number per organization (if set)
LocationSchema.index(
  { orgId: 1, twilioPhoneNumber: 1 },
  { unique: true, sparse: true }
);

// Singleton pattern for Next.js HMR compatibility
const Location: Model<ILocationDocument> =
  mongoose.models.Location ||
  mongoose.model<ILocationDocument>("Location", LocationSchema);

export default Location;
