import mongoose, { Schema, Document, Model, Types } from "mongoose";

// Operating hours interface for a single day
export interface IOperatingHours {
  isOpen: boolean;
  open?: string;
  close?: string;
}

// Weekly operating hours type
export interface IWeeklyOperatingHours {
  monday: IOperatingHours;
  tuesday: IOperatingHours;
  wednesday: IOperatingHours;
  thursday: IOperatingHours;
  friday: IOperatingHours;
  saturday: IOperatingHours;
  sunday: IOperatingHours;
}

// AI settings interface
export interface IAISettings {
  monthlyGenerationLimit: number;
  subscriptionTier: "free" | "pro" | "enterprise";
}

// Schedule generation settings interface
export interface IScheduleGenerationSettings {
  allowClopening: boolean;
  minHoursBetweenShifts: number;
  clopeningWarningThresholdHours: number;
  overtimeThresholdHours: number;
  overtimePolicy: "strict" | "avoid" | "allowed";
  softConstraintPriority: ("preferences" | "fairness" | "cost")[];
}

// Main KitchenConfig interface
export interface IKitchenConfig {
  orgId: Types.ObjectId;
  locationId: Types.ObjectId;
  name: string;
  stations: string[];
  roles: string[];
  operatingHours: IWeeklyOperatingHours;
  minTimeOffAdvanceDays: number;
  aiSettings: IAISettings;
  scheduleGenerationSettings: IScheduleGenerationSettings;
  createdAt: Date;
  updatedAt: Date;
}

// Document interface (with Mongoose document methods)
export interface IKitchenConfigDocument extends IKitchenConfig, Document {}

// Operating hours sub-schema
const OperatingHoursSchema = new Schema<IOperatingHours>(
  {
    isOpen: { type: Boolean, required: true, default: false },
    open: { type: String },
    close: { type: String },
  },
  { _id: false }
);

// Main KitchenConfig schema
const KitchenConfigSchema = new Schema<IKitchenConfigDocument>(
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
    stations: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: "At least one station is required",
      },
    },
    roles: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: "At least one role is required",
      },
    },
    operatingHours: {
      monday: { type: OperatingHoursSchema, required: true },
      tuesday: { type: OperatingHoursSchema, required: true },
      wednesday: { type: OperatingHoursSchema, required: true },
      thursday: { type: OperatingHoursSchema, required: true },
      friday: { type: OperatingHoursSchema, required: true },
      saturday: { type: OperatingHoursSchema, required: true },
      sunday: { type: OperatingHoursSchema, required: true },
    },
    minTimeOffAdvanceDays: {
      type: Number,
      default: 7,
      min: 0,
    },
    aiSettings: {
      type: new Schema<IAISettings>(
        {
          monthlyGenerationLimit: {
            type: Number,
            default: 50,
            min: 1,
            max: 1000,
          },
          subscriptionTier: {
            type: String,
            enum: ["free", "pro", "enterprise"],
            default: "free",
          },
        },
        { _id: false }
      ),
      default: () => ({
        monthlyGenerationLimit: 50,
        subscriptionTier: "free",
      }),
    },
    scheduleGenerationSettings: {
      type: new Schema<IScheduleGenerationSettings>(
        {
          allowClopening: {
            type: Boolean,
            default: false,
          },
          minHoursBetweenShifts: {
            type: Number,
            default: 10,
            min: 6,
            max: 16,
          },
          clopeningWarningThresholdHours: {
            type: Number,
            default: 10,
            min: 6,
            max: 16,
          },
          overtimeThresholdHours: {
            type: Number,
            default: 40,
            min: 0,
          },
          overtimePolicy: {
            type: String,
            enum: ["strict", "avoid", "allowed"],
            default: "avoid",
          },
          softConstraintPriority: {
            type: [String],
            enum: ["preferences", "fairness", "cost"],
            default: ["preferences", "fairness", "cost"],
          },
        },
        { _id: false }
      ),
      default: () => ({
        allowClopening: false,
        minHoursBetweenShifts: 10,
        clopeningWarningThresholdHours: 10,
        overtimeThresholdHours: 40,
        overtimePolicy: "avoid",
        softConstraintPriority: ["preferences", "fairness", "cost"],
      }),
    },
  },
  {
    timestamps: true,
  }
);

// Unique constraint: one config per location
KitchenConfigSchema.index({ orgId: 1, locationId: 1 }, { unique: true });

// Singleton pattern for Next.js HMR compatibility
// Prevents "Cannot overwrite model once compiled" error
const KitchenConfig: Model<IKitchenConfigDocument> =
  mongoose.models.KitchenConfig ||
  mongoose.model<IKitchenConfigDocument>("KitchenConfig", KitchenConfigSchema);

export default KitchenConfig;
