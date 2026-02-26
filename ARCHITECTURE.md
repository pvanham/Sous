# PROJECT SOUS: ARCHITECTURE CONSTITUTION

> The definitive guide to Sous's codebase structure, patterns, and conventions.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Directory Structure](#2-directory-structure)
3. [The 3-Layer Architecture](#3-the-3-layer-architecture)
4. [Data Models](#4-data-models)
5. [Service Layer Patterns](#5-service-layer-patterns)
6. [Action Layer Patterns](#6-action-layer-patterns)
7. [UI Layer Patterns](#7-ui-layer-patterns)
8. [AI/LLM Integration](#8-aillm-integration)
9. [Validation & Types](#9-validation--types)
10. [API Routes](#10-api-routes)
11. [Design Patterns](#11-design-patterns)
12. [Testing Strategy](#12-testing-strategy)

---

## 1. Overview

Sous is a reactive, AI-powered scheduling platform for high-volume kitchens. The architecture prioritizes:

- **Separation of Concerns**: Strict 3-layer architecture prevents spaghetti code
- **Type Safety**: End-to-end TypeScript with Zod validation
- **AI-First Design**: LLM integration at the core, not bolted on
- **Multi-Tenancy**: All data scoped by `orgId` + `locationId` (supports multi-location)

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TanStack Query v5 |
| Styling | Tailwind CSS v4, shadcn/ui |
| Backend | Next.js Server Actions, Mongoose 9 |
| Database | MongoDB Atlas |
| Auth | Clerk |
| AI | OpenAI API (GPT-4o), Vercel AI SDK |
| SMS | Twilio |

---

## 2. Directory Structure

```
src/
├── app/                              # Next.js App Router
│   ├── (auth)/                       # Route Group: Public/Auth
│   │   └── sign-in/[[...sign-in]]/
│   │       └── page.tsx
│   │
│   ├── (dashboard)/                  # Route Group: Protected (Manager/Owner)
│   │   └── dashboard/
│   │       ├── layout.tsx            # Dashboard shell (sidebar, nav)
│   │       ├── page.tsx              # Dashboard home
│   │       │
│   │       ├── schedule/             # Feature: Schedule Management
│   │       │   ├── page.tsx
│   │       │   └── _components/
│   │       │       ├── ScheduleGrid.tsx
│   │       │       ├── ScheduleHeader.tsx
│   │       │       ├── ShiftCard.tsx
│   │       │       ├── ShiftFormDialog.tsx
│   │       │       ├── ViewSwitcher.tsx
│   │       │       ├── StaffGridView.tsx
│   │       │       ├── TimeGridView.tsx
│   │       │       ├── DayStationView.tsx
│   │       │       └── ...
│   │       │
│   │       ├── staff/                # Feature: Staff Management
│   │       │   ├── page.tsx
│   │       │   ├── [id]/
│   │       │   │   └── availability/
│   │       │   │       └── page.tsx
│   │       │   └── _components/
│   │       │       ├── StaffTable.tsx
│   │       │       ├── StaffFormDialog.tsx
│   │       │       └── StaffCsvImportDialog.tsx
│   │       │
│   │       ├── labor/                # Feature: Labor Requirements (Phase 3)
│   │       │   ├── page.tsx
│   │       │   └── _components/
│   │       │
│   │       ├── inbox/                # Feature: SMS Inbox (Phase 4)
│   │       │   ├── page.tsx
│   │       │   └── _components/
│   │       │
│   │       └── settings/             # Feature: Kitchen Configuration
│   │           ├── page.tsx
│   │           └── _components/
│   │               └── KitchenConfigForm.tsx
│   │
│   ├── (staff)/                      # Route Group: Staff Portal (Phase 5)
│   │   ├── layout.tsx
│   │   ├── my-shifts/
│   │   └── my-availability/
│   │
│   ├── api/                          # API Routes (Webhooks ONLY)
│   │   └── webhooks/
│   │       ├── twilio/
│   │       │   └── route.ts
│   │       └── clerk/
│   │           └── route.ts
│   │
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Landing page
│   └── globals.css                   # Global styles
│
├── components/
│   ├── ui/                           # shadcn/ui primitives (dumb components)
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── form.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   ├── time-picker.tsx
│   │   └── ...
│   │
│   └── shared/                       # Global smart components
│       ├── providers.tsx             # Theme, Query, Clerk providers
│       ├── ThemeToggle.tsx
│       └── ErrorFallback.tsx
│
├── lib/
│   ├── db.ts                         # Mongoose connection singleton
│   ├── utils.ts                      # cn() and basic helpers
│   ├── safe-action.ts                # ActionResponse type
│   │
│   ├── auth/                         # Auth utilities
│   │   └── get-location-context.ts   # Resolve orgId + locationId from userId
│   │
│   ├── ai/                           # AI client utilities
│   │   └── openai-client.ts
│   │
│   ├── sms/                          # SMS utilities
│   │   └── twilio-client.ts
│   │
│   ├── utils/                        # Domain-specific utilities
│   │   ├── date.ts                   # date-fns wrappers
│   │   ├── shift-overlap.ts          # Lane assignment algorithm
│   │   └── station-colors.ts         # Station color mapping
│   │
│   └── validations/                  # Zod schemas (shared FE/BE)
│       ├── kitchen-config.schema.ts
│       ├── staff.schema.ts
│       ├── schedule.schema.ts
│       ├── shift.schema.ts
│       ├── labor-requirement.schema.ts
│       ├── staff-availability.schema.ts
│       ├── time-off-request.schema.ts
│       └── message.schema.ts
│
├── server/                           # Server-side logic ("Backend")
│   │
│   ├── models/                       # Mongoose schemas
│   │   ├── Organization.ts           # Tenant container
│   │   ├── Location.ts               # Kitchen location within org
│   │   ├── OrganizationMember.ts     # User-to-location membership
│   │   ├── KitchenConfig.ts
│   │   ├── Staff.ts
│   │   ├── Schedule.ts
│   │   ├── Shift.ts
│   │   ├── LaborRequirement.ts       # Phase 3
│   │   ├── StaffAvailability.ts      # Phase 3
│   │   ├── TimeOffRequest.ts         # Phase 3
│   │   ├── Message.ts                # Phase 4
│   │   └── CoverageRequest.ts        # Phase 4
│   │
│   ├── services/                     # Business logic (DB access)
│   │   ├── organization.service.ts
│   │   ├── location.service.ts
│   │   ├── organization-member.service.ts
│   │   ├── kitchen-config.service.ts
│   │   ├── staff.service.ts
│   │   ├── schedule.service.ts
│   │   ├── shift.service.ts
│   │   ├── labor-requirement.service.ts
│   │   ├── staff-availability.service.ts
│   │   ├── time-off-request.service.ts
│   │   ├── coverage-analyzer.service.ts
│   │   ├── cp-solver.service.ts             # HTTP client for OR-Tools CP-SAT solver
│   │   ├── schedule-validator.service.ts    # Validation + quality scoring
│   │   ├── message.service.ts
│   │   ├── notification.service.ts
│   │   │
│   │   └── ai/                       # AI/LLM services
│   │       ├── scheduling-agent.service.ts  # Orchestrator (solver + AI optimizer)
│   │       ├── message-agent.service.ts
│   │       ├── prompt-builder.ts
│   │       └── prompts/
│   │           ├── schedule-generation.ts   # Optimizer prompts
│   │           └── message-parsing.ts
│   │
│   └── actions/                      # Server Actions
│       ├── organization.actions.ts
│       ├── location.actions.ts
│       ├── kitchen-config.actions.ts
│       ├── staff.actions.ts
│       ├── schedule.actions.ts
│       ├── shift.actions.ts
│       ├── labor-requirement.actions.ts
│       ├── staff-availability.actions.ts
│       ├── time-off-request.actions.ts
│       ├── schedule-generation.actions.ts
│       ├── message.actions.ts
│       └── notification.actions.ts
│
├── types/                            # TypeScript types & DTOs
│   ├── organization.ts
│   ├── location.ts
│   ├── organization-member.ts
│   ├── kitchen-config.ts
│   ├── staff.ts
│   ├── schedule.ts
│   ├── shift.ts
│   ├── labor-requirement.ts
│   ├── staff-availability.ts
│   ├── time-off-request.ts
│   ├── message.ts
│   └── ai-scheduling.ts
│
└── proxy.ts                          # Clerk proxy configuration
```

---

## 3. The 3-Layer Architecture

This is the **most important rule** in the codebase. All data flows through exactly three layers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                               UI LAYER                                       │
│                                                                              │
│   src/app/**/*.tsx              src/components/**/*.tsx                      │
│                                                                              │
│   ┌──────────────────┐          ┌──────────────────┐                        │
│   │ Server Component │          │ Client Component │                        │
│   │                  │          │ "use client"     │                        │
│   │ • Initial data   │          │ • useQuery()     │                        │
│   │ • Static render  │          │ • useMutation()  │                        │
│   │ • No hooks       │          │ • useState()     │                        │
│   └──────────────────┘          └──────────────────┘                        │
│                                                                              │
│   RULES:                                                                     │
│   • NEVER import Mongoose models                                             │
│   • NEVER call database directly                                             │
│   • ONLY call Server Actions for data                                        │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  │ Server Actions (RPC)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ACTION LAYER                                    │
│                                                                              │
│   src/server/actions/*.actions.ts                                           │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ export async function createShift(input: unknown): ActionResponse   │   │
│   │   1. const { userId } = await auth();          // Auth check        │   │
│   │   2. const parsed = schema.safeParse(input);   // Validation        │   │
│   │   3. await dbConnect();                        // DB connection     │   │
│   │   4. const result = await Service.create(...); // Service call      │   │
│   │   5. return { success: true, data: result };   // Response          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   RULES:                                                                     │
│   • MUST call auth() before any operation                                    │
│   • MUST validate with Zod before processing                                 │
│   • MUST call dbConnect() before DB operations                               │
│   • MUST call Service Layer (never DB directly)                              │
│   • MUST return ActionResponse<T>                                            │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  │ Service methods
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             SERVICE LAYER                                    │
│                                                                              │
│   src/server/services/*.service.ts                                          │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ export const ShiftService = {                                       │   │
│   │   async create(userId, data) {                                      │   │
│   │     // Business logic (e.g., overlap check)                         │   │
│   │     const hasOverlap = await this.checkOverlap(...);                │   │
│   │     if (hasOverlap) throw new Error("Overlap");                     │   │
│   │                                                                     │   │
│   │     // Database operation                                           │   │
│   │     const doc = await Shift.create({ userId, ...data });            │   │
│   │                                                                     │   │
│   │     // Return DTO (not Mongoose document)                           │   │
│   │     return toShiftDTO(doc);                                         │   │
│   │   }                                                                 │   │
│   │ };                                                                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   RULES:                                                                     │
│   • ONLY place Mongoose models are imported                                  │
│   • Contains ALL business logic                                              │
│   • Returns DTOs (plain objects), NEVER Mongoose documents                   │
│   • Pure functions where possible                                            │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  │ Mongoose operations
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE                                        │
│                                                                              │
│   MongoDB Atlas                                                              │
│   └── sous (database)                                                        │
│       ├── organizations                                                      │
│       ├── locations                                                          │
│       ├── organization_members                                               │
│       ├── kitchenconfigs                                                     │
│       ├── staff                                                              │
│       ├── schedules                                                          │
│       ├── shifts                                                             │
│       ├── laborrequirements                                                  │
│       ├── staffavailabilities                                                │
│       ├── timeoffrequests                                                    │
│       ├── messages                                                           │
│       └── coveragerequests                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why This Matters

| Without Layers | With Layers |
|----------------|-------------|
| DB calls scattered everywhere | DB calls in one place |
| Auth checks missed | Auth always checked |
| Business logic duplicated | Business logic centralized |
| Hard to test | Easy to test services |
| Mongoose docs leak to UI | Clean DTOs everywhere |

---

## 4. Data Models

### Multi-Tenancy Models (Foundation)

```typescript
// Organization - Tenant container
{
  ownerId: string,          // Clerk user ID of owner
  name: string,
  createdAt: Date,
  updatedAt: Date
}

// Location - Kitchen location within an organization
{
  orgId: ObjectId,          // Reference to Organization
  name: string,
  timezone: string,         // IANA timezone (e.g., "America/New_York")
  twilioPhoneNumber?: string, // E.164 format, optional
  createdAt: Date,
  updatedAt: Date
}

// OrganizationMember - User-to-location membership
{
  orgId: ObjectId,          // Reference to Organization
  locationId: ObjectId?,    // Reference to Location (null = org-wide access)
  clerkUserId: string,      // Clerk user ID
  role: 'owner' | 'manager',
  createdAt: Date,
  updatedAt: Date
}
```

### Current Models (Phase 1-2)

```typescript
// KitchenConfig - Restaurant settings
{
  orgId: ObjectId,          // Reference to Organization
  locationId: ObjectId,     // Reference to Location
  name: string,
  stations: string[],       // ["Grill", "Prep", "Assembly"]
  roles: string[],          // ["Manager", "Cook", "Host"]
  operatingHours: {
    monday: { isOpen: boolean, open: string, close: string },
    // ... other days
  }
}

// Staff - Employee records
{
  orgId: ObjectId,          // Reference to Organization
  locationId: ObjectId,     // Reference to Location
  name: string,
  email: string,
  phone: string,
  roles: string[],          // From KitchenConfig.roles
  skills: [{ station: string, proficiency: 1-5 }],
  isActive: boolean,
  maxHoursPerWeek: number,  // Phase 3
  minHoursPerWeek: number,  // Phase 3
  preferredStations: string[], // Phase 3
  hourlyRate: number,       // Phase 3 - Required for labor cost calculations
  smsConsent: boolean,      // Phase 4 - TCPA compliance, default false
  smsConsentDate?: Date,    // Phase 4 - When consent was given
}

// Schedule - Week container
{
  orgId: ObjectId,          // Reference to Organization
  locationId: ObjectId,     // Reference to Location
  weekStartDate: Date,      // Always a Monday
  status: 'DRAFT' | 'PUBLISHED',
  notes: string
}

// Shift - Individual work assignment
{
  orgId: ObjectId,          // Reference to Organization
  locationId: ObjectId,     // Reference to Location
  scheduleId: ObjectId,
  staffId: ObjectId,
  start: Date,
  end: Date,
  station: string,
  notes: string
}
```

### Phase 3 Models

```typescript
// LaborRequirement - Staffing targets
{
  userId: string,
  dayOfWeek: 0-6,
  station: string,
  startTime: string,
  endTime: string,
  minStaff: number,
  preferredStaff: number,
  priority: 'critical' | 'high' | 'normal' | 'low'
}

// StaffAvailability - When staff can work
{
  userId: string,
  staffId: ObjectId,
  dayOfWeek: 0-6,
  availableFrom: string,
  availableTo: string,
  preference: 'preferred' | 'available' | 'unavailable'
}

// TimeOffRequest - Specific date-range time-off requests
{
  userId: string,
  staffId: ObjectId,
  startDate: Date,
  endDate: Date,
  reason?: string,
  status: 'pending' | 'approved' | 'denied',
  createdAt: Date,
  reviewedAt?: Date,
  reviewedBy?: string
}
```

### Phase 4 Models

```typescript
// Message - SMS records
{
  userId: string,
  staffId: ObjectId,
  from: string,
  to: string,
  body: string,
  direction: 'inbound' | 'outbound',
  status: 'received' | 'processing' | 'handled' | 'escalated',
  intent: 'CALL_OUT' | 'LATE' | 'SHIFT_SWAP' | 'QUESTION' | 'OTHER',
  parsedData: { date, reason, confidence },
  threadId: string
}

// CoverageRequest - Shift coverage tracking
{
  messageId: ObjectId,
  shiftId: ObjectId,
  requestedBy: ObjectId,
  status: 'searching' | 'offered' | 'accepted' | 'declined',
  candidates: [{ staffId, status, offeredAt, respondedAt }],
  acceptedBy: ObjectId
}
```

---

## 5. Service Layer Patterns

### Service Object Pattern

Group related operations into service objects. All services use `(orgId, locationId)` for multi-location scoping:

```typescript
// src/server/services/staff.service.ts
import { Types } from "mongoose";
import Staff from "@/server/models/Staff";
import { toStaffDTO } from "@/types/staff";
import type { StaffDTO, StaffInput } from "@/types/staff";

export const StaffService = {
  /**
   * Get all staff for a location
   */
  async list(orgId: string, locationId: string): Promise<StaffDTO[]> {
    const docs = await Staff.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).sort({ name: 1 }).lean();
    return docs.map(toStaffDTO);
  },

  /**
   * Create a new staff member
   */
  async create(
    orgId: string,
    locationId: string,
    data: StaffInput
  ): Promise<StaffDTO> {
    const doc = await Staff.create({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      ...data,
    });
    return toStaffDTO(doc);
  },

  /**
   * Find available staff for a time slot
   */
  async findAvailable(
    orgId: string,
    locationId: string,
    date: Date,
    startTime: string,
    endTime: string,
    station: string
  ): Promise<StaffDTO[]> {
    // Complex query combining:
    // - Staff skills matching station
    // - Staff availability for day/time
    // - Not already scheduled
    // ...
  },

  /**
   * Delete all staff for a location (testing cleanup)
   */
  async deleteAllByLocation(orgId: string, locationId: string): Promise<number> {
    const result = await Staff.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount;
  },
};
```

### DTO Conversion Pattern

Always convert Mongoose documents to plain DTOs:

```typescript
// src/types/staff.ts
import type { Types, Document } from "mongoose";

// Raw Mongoose document shape
interface StaffDocument {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
  locationId: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  roles: string[];
  skills: Array<{ station: string; proficiency: number }>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Clean DTO for UI
export interface StaffDTO {
  id: string;              // ObjectId → string
  orgId: string;           // ObjectId → string
  locationId: string;      // ObjectId → string
  name: string;
  email: string;
  phone: string;
  roles: string[];
  skills: Array<{ station: string; proficiency: number }>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Converter
export function toStaffDTO(doc: StaffDocument): StaffDTO {
  return {
    id: doc._id.toString(),
    orgId: doc.orgId.toString(),
    locationId: doc.locationId.toString(),
    name: doc.name,
    email: doc.email,
    phone: doc.phone,
    roles: doc.roles,
    skills: doc.skills,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
```

---

## 6. Action Layer Patterns

### Standard Action Template

```typescript
// src/server/actions/example.actions.ts
"use server";

import { auth } from "@clerk/nextjs/server";
import { exampleSchema } from "@/lib/validations/example.schema";
import { ExampleService } from "@/server/services/example.service";
import { getLocationContext } from "@/lib/auth/get-location-context";
import type { ActionResponse } from "@/lib/safe-action";
import type { ExampleDTO } from "@/types/example";

/**
 * Create a new example
 */
export async function createExample(
  input: unknown
): Promise<ActionResponse<ExampleDTO>> {
  // 1. Auth check (REQUIRED)
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  // 2. Validation (REQUIRED)
  const parsed = exampleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  // 3. Get location context (handles DB connection + resolves orgId/locationId)
  const ctx = await getLocationContext(userId);

  // 4. Service call with error handling
  try {
    const result = await ExampleService.create(ctx.orgId, ctx.locationId, parsed.data);
    return { success: true, data: result };
  } catch (error) {
    console.error("createExample error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create",
    };
  }
}

/**
 * Get all examples
 */
export async function getExamples(): Promise<ActionResponse<ExampleDTO[]>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  // Get location context (handles DB connection)
  const ctx = await getLocationContext(userId);

  try {
    const result = await ExampleService.getAll(ctx.orgId, ctx.locationId);
    return { success: true, data: result };
  } catch (error) {
    console.error("getExamples error:", error);
    return { success: false, error: "Failed to fetch" };
  }
}
```

### ActionResponse Type

```typescript
// src/lib/safe-action.ts
export type ActionResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```

---

## 7. UI Layer Patterns

### Client Component with TanStack Query

```typescript
// src/app/(dashboard)/dashboard/example/_components/ExampleList.tsx
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getExamples, createExample, deleteExample } from "@/server/actions/example.actions";
import { toast } from "sonner";

// Consistent query keys
const exampleKeys = {
  all: ["examples"] as const,
  list: () => [...exampleKeys.all, "list"] as const,
  detail: (id: string) => [...exampleKeys.all, "detail", id] as const,
};

export function ExampleList() {
  const queryClient = useQueryClient();

  // Fetch data
  const { data: examples, isLoading, error } = useQuery({
    queryKey: exampleKeys.list(),
    queryFn: async () => {
      const result = await getExamples();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  // Create mutation with optimistic update
  const createMutation = useMutation({
    mutationFn: createExample,
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: exampleKeys.list() });
      const previous = queryClient.getQueryData(exampleKeys.list());
      
      // Optimistic update
      queryClient.setQueryData(exampleKeys.list(), (old: ExampleDTO[] = []) => [
        ...old,
        { ...newData, id: `temp-${Date.now()}` },
      ]);
      
      return { previous };
    },
    onError: (err, _, context) => {
      queryClient.setQueryData(exampleKeys.list(), context?.previous);
      toast.error("Failed to create");
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Created!");
      } else {
        toast.error(result.error);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: exampleKeys.list() });
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {examples?.map((example) => (
        <div key={example.id}>{example.name}</div>
      ))}
    </div>
  );
}
```

### Feature Component Structure

```
_components/
├── FeatureGrid.tsx        # Main orchestrating component (client)
├── FeatureHeader.tsx      # Header with actions
├── FeatureCard.tsx        # Individual item display
├── FeatureFormDialog.tsx  # Create/Edit form
├── FeatureFilters.tsx     # Filter controls
└── FeatureEmptyState.tsx  # Empty state display
```

---

## 8. AI/LLM Integration

### Schedule Generation Architecture (CP Solver)

Schedule generation uses the Google OR-Tools CP-SAT constraint programming solver via a Python FastAPI microservice. The solver finds globally optimal staff assignments across the entire week, respecting availability, skills, hour limits, and clopening constraints.

```
┌─────────────────────────────────────────────────────────────┐
│                     Action Layer                             │
│   schedule-generation.actions.ts                             │
│   message.actions.ts                                         │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Scheduling Service Layer                       │
│                                                              │
│   SchedulingAgentService (orchestrator)                      │
│     │                                                        │
│     ├─ Phase 1: CandidateService pre-fetch (all 7 days)     │
│     │    └─ Hard-filters candidates per slot                 │
│     │                                                        │
│     ├─ Phase 2: CPSolverService.solveWeek()                  │
│     │    └─ OR-Tools CP-SAT via Python microservice          │
│     │       (globally optimal, ~2-10s)                       │
│     │                                                        │
│     └─ ScheduleValidatorService                              │
│          ├─ validate() — hard constraint checks              │
│          ├─ scoreQuality() — quality scoring                 │
│          └─ checkUnderScheduled() — min-hours warnings       │
│                                                              │
│   CandidateService (hard filter layer)                       │
│     └─ Filters: availability, time-off, skills, overlap,    │
│        clopening (10h gap), overtime                         │
│                                                              │
│   CP Solver Microservice (solver/main.py)                    │
│     └─ FastAPI + OR-Tools CP-SAT, runs in Docker             │
└─────────────────────────────────────────────────────────────┘
```

### Key Services

| Service | Purpose |
|---------|---------|
| `CPSolverService` | HTTP client for the OR-Tools CP-SAT solver microservice |
| `SchedulingAgentService` | Orchestrates candidate pre-fetch, solver call, and validation |
| `ScheduleValidatorService` | Hard validation, quality scoring, warnings |
| `CandidateService` | Hard-filters candidates (availability, skills, clopening, etc.) |

### Schedule Generation Flow

```typescript
// src/server/services/ai/scheduling-agent.service.ts
export const SchedulingAgentService = {
  async generateBaseWeekSchedule(context) {
    // Phase 1: Pre-fetch candidates for all 7 days
    const allDayCandidates = await prefetchCandidates(context);

    // Phase 2: CP solver finds optimal assignments across the week
    const weekSchedule = await CPSolverService.solveWeek(weekSolverInput);

    // Validate and score
    const warnings = ScheduleValidatorService.validate(weekSchedule, ...);
    const weekScore = ScheduleValidatorService.scoreWeek(weekSchedule, ...);

    return { days: weekSchedule, metadata, warnings };
  },
};
```

---

## 9. Validation & Types

### Zod Schema Pattern

```typescript
// src/lib/validations/shift.schema.ts
import { z } from "zod";

// Time string format: "HH:MM"
const timeStringSchema = z.string().regex(
  /^([01]\d|2[0-3]):([0-5]\d)$/,
  "Time must be in HH:MM format"
);

// Create shift schema
export const createShiftSchema = z.object({
  staffId: z.string().min(1, "Staff member is required"),
  date: z.coerce.date(),
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  station: z.string().min(1, "Station is required"),
  notes: z.string().max(500).optional(),
}).refine(
  (data) => {
    const start = parseInt(data.startTime.replace(":", ""));
    const end = parseInt(data.endTime.replace(":", ""));
    return start < end;
  },
  { message: "End time must be after start time", path: ["endTime"] }
);

export type CreateShiftInput = z.infer<typeof createShiftSchema>;

// Update shift schema (partial)
export const updateShiftSchema = createShiftSchema.partial();
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
```

### Type Organization

```
src/types/
├── kitchen-config.ts    # KitchenConfigDTO, converter
├── staff.ts             # StaffDTO, StaffInput, converter
├── schedule.ts          # ScheduleDTO, ScheduleStatus, converter
├── shift.ts             # ShiftDTO, converter
├── labor-requirement.ts # LaborRequirementDTO, converter
├── message.ts           # MessageDTO, MessageIntent, converter
└── ai-scheduling.ts     # SchedulingContext, GeneratedSchedule, etc.
```

---

## 10. API Routes

API routes are **only** for external webhooks. All app data uses Server Actions.

```typescript
// src/app/api/webhooks/twilio/route.ts
import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

export async function POST(request: NextRequest) {
  // 1. Validate signature
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const body = await request.text();
  
  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    signature,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`,
    Object.fromEntries(new URLSearchParams(body))
  );

  if (!isValid) {
    return NextResponse.json({ error: "Invalid" }, { status: 401 });
  }

  // 2. Extract message
  const params = new URLSearchParams(body);
  const from = params.get("From") ?? "";
  const messageBody = params.get("Body") ?? "";

  // 3. Process asynchronously (don't block)
  // MessageService.processIncoming(from, messageBody);

  // 4. Return TwiML
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { "Content-Type": "text/xml" } }
  );
}
```

---

## 11. Design Patterns

### A. Service Object Pattern

Group domain logic into cohesive services instead of scattered functions:

```typescript
export const StaffService = {
  getAll: async (userId) => { ... },
  create: async (userId, data) => { ... },
  update: async (userId, id, data) => { ... },
  delete: async (userId, id) => { ... },
  findAvailable: async (userId, date, time, station) => { ... },
};
```

### B. Smart vs Dumb Components

| Type | Location | Characteristics |
|------|----------|-----------------|
| Dumb | `src/components/ui/` | Props in, UI out. No side effects. |
| Smart | `_components/*.tsx` | Connects to state, calls queries/mutations |

### C. Zod-First Validation

Same schema validates both frontend and backend:

```typescript
// Frontend (react-hook-form)
const form = useForm({ resolver: zodResolver(staffSchema) });

// Backend (server action)
const parsed = staffSchema.safeParse(input);
```

### D. Query Key Factory

Consistent query key structure:

```typescript
const shiftKeys = {
  all: ["shifts"] as const,
  bySchedule: (id: string) => [...shiftKeys.all, "schedule", id] as const,
  byStaff: (id: string) => [...shiftKeys.all, "staff", id] as const,
};
```

### E. Optimistic Updates

Update UI immediately, rollback on error:

```typescript
onMutate: async (newData) => {
  await queryClient.cancelQueries({ queryKey });
  const previous = queryClient.getQueryData(queryKey);
  queryClient.setQueryData(queryKey, (old) => [...old, newData]);
  return { previous };
},
onError: (err, _, context) => {
  queryClient.setQueryData(queryKey, context?.previous);
},
```

---

## 12. Testing Strategy

### Verification Scripts

Each phase has a verification script:

```
scripts/
├── test-phase-1.ts   # Kitchen config, staff CRUD, CSV import
├── test-phase-2.ts   # Schedules, shifts, overlap detection
├── test-phase-3.ts   # Labor requirements, AI generation
└── test-phase-4.ts   # Messages, SMS handling
```

### Test Script Pattern

```typescript
// scripts/test-phase-X.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { dbConnect } from "../src/lib/db";
import mongoose from "mongoose";

const TEST_USER_ID = "user_test_phase_X";

async function cleanup() {
  // Delete test data
}

async function testFeature1() {
  // Test implementation
}

async function main() {
  console.log("PHASE X VERIFICATION");
  
  await dbConnect();
  await cleanup();
  
  try {
    await testFeature1();
    await testFeature2();
    console.log("✓ All tests passed");
  } catch (error) {
    console.error("✗ Failed:", error);
    process.exit(1);
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }
}

main();
```

---

## Quick Reference

### File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Model | `PascalCase.ts` | `Staff.ts` |
| Service | `kebab-case.service.ts` | `staff.service.ts` |
| Action | `kebab-case.actions.ts` | `staff.actions.ts` |
| Schema | `kebab-case.schema.ts` | `staff.schema.ts` |
| Types | `kebab-case.ts` | `staff.ts` |
| Component | `PascalCase.tsx` | `StaffTable.tsx` |

### Import Aliases

```typescript
import { dbConnect } from "@/lib/db";
import { StaffService } from "@/server/services/staff.service";
import { createStaff } from "@/server/actions/staff.actions";
import { staffSchema } from "@/lib/validations/staff.schema";
import type { StaffDTO } from "@/types/staff";
import { Button } from "@/components/ui/button";
```

### NPM Scripts

```bash
npm run dev           # Development server
npm run build         # Production build
npm run lint          # ESLint
npm run test:phase-1  # Phase 1 verification
npm run test:phase-2  # Phase 2 verification
```

---

*Last Updated: February 2026*
