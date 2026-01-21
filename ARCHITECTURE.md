PROJECT SOUS: ARCHITECTURE CONSTITUTION
1. Directory Structure (Feature-Based)
We avoid the "drawer" method (putting all components in one folder, all hooks in another). We use Feature-Based Architecture where related code lives together.

Plaintext

src/
├── app/
│   ├── (auth)/               # Route Group: Public/Auth pages
│   ├── (dashboard)/          # Route Group: Protected App
│   │   ├── dashboard/
│   │   │   ├── layout.tsx    # Dashboard Shell (Sidebar/Nav)
│   │   │   ├── page.tsx      # Dashboard Home
│   │   │   ├── schedule/     # Feature: Schedule
│   │   │   │   ├── page.tsx
│   │   │   │   └── _components/ # Feature-specific components
│   │   │   └── staff/        # Feature: Staff
│   │       └── inbox/        # Feature: SMS Inbox
│   └── api/                  # Route Handlers (Webhooks only)
├── components/
│   ├── ui/                   # Shadcn Primitives (Button, Input) - Dumb
│   └── shared/               # Global components (ThemeToggle, UserNav)
├── lib/
│   ├── db.ts                 # Mongoose Connection Singleton
│   ├── utils.ts              # cn() and basic helpers
│   └── safe-action.ts        # Server Action Wrapper (Error handling)
├── server/                   # SERVER-SIDE LOGIC (The "Backend")
│   ├── actions/              # Server Actions (Mutations)
│   │   ├── staff.actions.ts
│   │   └── schedule.actions.ts
│   ├── services/             # Business Logic (DB interactions)
│   │   ├── staff.service.ts
│   │   └── ai.service.ts
│   └── models/               # Mongoose Schemas
│       ├── Staff.ts
│       └── Schedule.ts
└── types/                    # Global TS Types
2. The Data Flow Pattern (Strict Unidirectional)
AI agents love to put DB calls directly inside Server Components. Do not allow this. We follow a strict 3-layer architecture.

1. The UI Layer (Client & Server Components)

Responsibility: Rendering, Interaction, Form State.

Rule: NEVER import Mongoose models directly here.

Rule: Use useQuery for reading data (via a fetcher or Server Action passed as initial data).

Rule: Use Server Actions for writing data (Mutations).

2. The Action Layer (src/server/actions)

Responsibility: Validation, Auth Checks, Response Formatting.

Rule: MUST use Zod to validate inputs.

Rule: MUST check auth() (Clerk) before proceeding.

Rule: Calls the Service Layer, never the DB directly.

Rule: Returns a standard ActionResponse<T>:

TypeScript

type ActionResponse<T> = { success: true; data: T } | { success: false; error: string };
3. The Service Layer (src/server/services)

Responsibility: Pure Business Logic & Database Queries.

Rule: This is the ONLY place mongoose.model is imported.

Rule: Pure functions where possible. "Get the staff, calculate overtime, save."

3. Core Design Patterns
A. The "Service Object" Pattern
Instead of scattered functions, group domain logic into services.

TypeScript

// src/server/services/staff.service.ts
export const StaffService = {
  async getAll(kitchenId: string) { ... },
  async create(data: CreateStaffDTO) { ... },
  async findAvailable(date: Date, skill: string) { ... }
};
B. The "Smart vs. Dumb" Component Pattern
Dumb Components (src/components/ui): Props in, UI out. No side effects. No API calls.

Feature Components (_components/ScheduleGrid.tsx): Connect to state. Call useQuery or useMutation. Pass data down to Dumb Components.

C. Zod-First Validation
We share schemas between the Frontend (Forms) and Backend (Actions).

Define schemas in src/lib/validations/*.ts.

Example: staffSchema is used in StaffForm.tsx (via zodResolver) AND staff.actions.ts (via schema.parse()).