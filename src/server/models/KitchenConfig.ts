import mongoose, { Schema, Document, Model } from "mongoose";

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

// Main KitchenConfig interface
export interface IKitchenConfig {
  userId: string;
  name: string;
  stations: string[];
  roles: string[];
  operatingHours: IWeeklyOperatingHours;
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
    userId: {
      type: String,
      required: true,
      unique: true,
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
  },
  {
    timestamps: true,
  }
);

// Singleton pattern for Next.js HMR compatibility
// Prevents "Cannot overwrite model once compiled" error
const KitchenConfig: Model<IKitchenConfigDocument> =
  mongoose.models.KitchenConfig ||
  mongoose.model<IKitchenConfigDocument>("KitchenConfig", KitchenConfigSchema);

export default KitchenConfig;
