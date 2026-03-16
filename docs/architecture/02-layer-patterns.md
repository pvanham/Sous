# Layer Patterns (The 3-Layer Architecture)

This is the **most important rule** in the codebase. All data flows through exactly three layers to ensure separation of concerns, type safety, and centralized business logic.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      UI LAYER                                │
│  src/app/*, src/components/*                                │
│  • React Server/Client Components                           │
│  • useQuery for reads, useMutation for writes               │
│  • NO database imports, NO business logic                   │
└─────────────────────────────┬───────────────────────────────┘
                              │ Server Actions (RPC)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     ACTION LAYER                             │
│  src/server/actions/*                                       │
│  • Auth checks: auth() from Clerk                           │
│  • Validation: Zod schemas                                  │
│  • DB Connection: await dbConnect()                         │
│  • Location Context: await getLocationContext()             │
│  • Calls Service Layer only                                 │
│  • Returns: ActionResponse<T>                               │
└─────────────────────────────┬───────────────────────────────┘
                              │ Service calls
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVICE LAYER                             │
│  src/server/services/*                                      │
│  • ONLY place Mongoose models are imported                  │
│  • Pure business logic (overlap checks, math, etc.)         │
│  • Context Scoping: Always queries by orgId + locationId    │
│  • Returns DTOs (plain objects), NEVER Mongoose docs        │
└─────────────────────────────────────────────────────────────┘
```

## 1. The Service Layer
The Service Layer is the only place Mongoose models are imported. It is responsible for pure business logic and converting database documents into plain Data Transfer Objects (DTOs) for the UI.

### Active Services in Codebase:
- `organization.service.ts`
- `location.service.ts`
- `organization-member.service.ts`
- `kitchen-config.service.ts`
- `staff.service.ts`
- `schedule.service.ts`
- `shift.service.ts`
- `staff-availability.service.ts`
- `labor-requirement.service.ts`
- `time-off-request.service.ts`
- `ai-usage.service.ts`
- **AI Services**: `scheduling-agent.service.ts`, `candidate.service.ts`, `cp-solver.service.ts`, `schedule-validator.service.ts`

*(Note: `message.service.ts` and `notification.service.ts` are planned for Phase 4)*

### Example Service Pattern
```typescript
import { Types } from "mongoose";
import Example from "@/server/models/Example";
import { toExampleDTO } from "@/types/example";

export const ExampleService = {
  async create(orgId: string, locationId: string, data: ExampleInput) {
    // 1. Business Logic / DB Call
    const doc = await Example.create({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      ...data,
    });
    
    // 2. Return plain DTO
    return toExampleDTO(doc);
  }
};
```

## 2. The Action Layer
The Action Layer acts as the bridge between the UI and the Backend Services. It handles authentication, validation, and passes data to the correct Service.

### Active Actions in Codebase:
- `organization.actions.ts`
- `location.actions.ts`
- `kitchen-config.actions.ts`
- `staff.actions.ts`
- `schedule.actions.ts`
- `shift.actions.ts`
- `staff-availability.actions.ts`
- `labor-requirement.actions.ts`
- `time-off-request.actions.ts`
- `schedule-generation.actions.ts`
- `user.actions.ts`
- `invitation.actions.ts`

*(Note: `message.actions.ts` is planned for Phase 4)*

### Example Action Pattern
```typescript
"use server";

import { auth } from "@clerk/nextjs/server";
import { exampleSchema } from "@/lib/validations/example.schema";
import { ExampleService } from "@/server/services/example.service";
import { getLocationContext } from "@/lib/auth/get-location-context";
import type { ActionResponse } from "@/lib/safe-action";

export async function createExample(input: unknown): Promise<ActionResponse<ExampleDTO>> {
  // 1. Auth check
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  // 2. Validation
  const parsed = exampleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  // 3. Context (connects to DB, resolves orgId + locationId)
  const ctx = await getLocationContext(userId);

  // 4. Service Call
  try {
    const result = await ExampleService.create(ctx.orgId, ctx.locationId, parsed.data);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: "Failed to create" };
  }
}
```

## 3. Location Context Resolver
Because users might manage multiple locations, all actions retrieve the `locationId` context based on the current user before performing operations. This guarantees security.

```typescript
// src/lib/auth/get-location-context.ts
export async function getLocationContext(clerkUserId: string) {
  await dbConnect();
  
  const member = await OrganizationMember.findOne({ clerkUserId });
  const location = await Location.findOne({ orgId: member.orgId });
  
  return {
    orgId: member.orgId.toString(),
    locationId: location._id.toString(),
    clerkUserId,
    role: member.role
  };
}
```
