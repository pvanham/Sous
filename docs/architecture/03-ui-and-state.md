# UI and State Management

This document outlines how the user interface interacts with the backend in the Sous application. We strictly separate UI components into "Dumb" and "Smart" components, and use TanStack Query alongside Server Actions for data fetching and state management.

## 1. Smart vs Dumb Components

| Type | Location | Characteristics |
|------|----------|-----------------|
| Dumb | `src/components/ui/` | Props in, UI out. No side effects. Uses shadcn/ui. |
| Smart | `_components/*.tsx` | Connects to state, calls queries/mutations. |

### Feature Component Structure
A standard feature directory within the dashboard looks like this:

```
dashboard/[feature]/_components/
├── FeatureGrid.tsx        # Main orchestrating component (client)
├── FeatureHeader.tsx      # Header with actions
├── FeatureCard.tsx        # Individual item display
├── FeatureFormDialog.tsx  # Create/Edit form
├── FeatureFilters.tsx     # Filter controls
└── FeatureEmptyState.tsx  # Empty state display
```

## 2. Server Components vs Client Components

**Server Components (Default)**
- Used for initial data loading, routing, and static rendering.
- Defined in `page.tsx` or `layout.tsx`.
- *Rule*: Never use hooks (`useState`, `useEffect`) here.

**Client Components (`"use client"`)**
- Used for interactive elements and TanStack Query data fetching.
- Defined in `_components/*.tsx`.

## 3. TanStack Query Patterns

We use TanStack Query v5 for client-side state management, caching, and data fetching via Server Actions.

### Query Key Factory
Always define a consistent query key structure at the top of the component or in a shared file:

```typescript
const shiftKeys = {
  all: ["shifts"] as const,
  bySchedule: (id: string) => [...shiftKeys.all, "schedule", id] as const,
  byStaff: (id: string) => [...shiftKeys.all, "staff", id] as const,
};
```

### Fetching Data
```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { getExamples } from "@/server/actions/example.actions";

export function ExampleList() {
  const { data: examples, isLoading, error } = useQuery({
    queryKey: exampleKeys.all,
    queryFn: async () => {
      const result = await getExamples();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{/* Render examples */}</div>;
}
```

### Mutating Data (with Optimistic Updates)
Use TanStack Query's `onMutate` to provide instant UI feedback before the server responds:

1. Cancel outgoing refetches
2. Snapshot previous value
3. Optimistically update local cache
4. Rollback `onError` using snapshot
5. Invalidate `onSettled` to sync with server

```typescript
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createExample } from "@/server/actions/example.actions";
import { toast } from "sonner";

export function ExampleForm() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: createExample,
    
    // 1. Optimistic Update
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: exampleKeys.all });
      const previous = queryClient.getQueryData(exampleKeys.all);
      
      queryClient.setQueryData(exampleKeys.all, (old: ExampleDTO[] = []) => [
        ...old,
        { ...newData, id: `temp-${Date.now()}` }, // Fake ID temporarily
      ]);
      
      return { previous }; // Snapshot for rollback
    },
    
    // 2. Rollback on Error
    onError: (err, _, context) => {
      queryClient.setQueryData(exampleKeys.all, context?.previous);
      toast.error("Failed to create");
    },
    
    // 3. Success Notification
    onSuccess: (result) => {
      if (result.success) toast.success("Created!");
      else toast.error(result.error);
    },
    
    // 4. Sync with Server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: exampleKeys.all });
    },
  });

  return <button onClick={() => createMutation.mutate({ name: "New" })}>Create</button>;
}
```

## 4. Zod Validation

We co-locate Zod schemas and their inferred TypeScript types in `src/lib/validations/`. These schemas are shared between the frontend (react-hook-form) and backend (Server Actions) for end-to-end validation.

```typescript
// src/lib/validations/staff.schema.ts
import { z } from "zod";

export const staffSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address"),
});

// Extract types
export type StaffInput = z.infer<typeof staffSchema>;

// Partial schema for updates
export const updateStaffSchema = staffSchema.partial();
export type StaffUpdateInput = z.infer<typeof updateStaffSchema>;
```

### Frontend Validation Example
```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { staffSchema, type StaffInput } from "@/lib/validations/staff.schema";

const form = useForm<StaffInput>({ 
  resolver: zodResolver(staffSchema) 
});
```
