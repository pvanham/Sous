## Phase 6: Production Preparation

**Goal:** Security, access control, mobile experience, and deployment readiness.

**Future Consideration (Post-MVP):** The Phase 5 Inbox currently uses TanStack Query polling for updates. For a truly "reactive" experience where managers see incoming texts instantly, consider adding Server-Sent Events (SSE) or a service like Pusher in a future iteration. Polling is acceptable for MVP.

---

### Sprint 6.1: Role-Based Access Control (RBAC)

**Scope:** Secure the app based on user roles.

**Files to Create/Update:**

- `src/lib/auth/rbac.ts` - Permission definitions
- `src/lib/auth/check-permission.ts` - Permission checker
- Update all server actions with role checks
- `src/types/auth.ts` - Role types

**Role Definitions:**

```typescript
const ROLES = {
  owner: {
    permissions: ["*"], // All permissions
  },
  manager: {
    permissions: [
      "schedule:read",
      "schedule:write",
      "schedule:publish",
      "staff:read",
      "staff:write",
      "inbox:read",
      "inbox:handle",
      "labor:read",
      "labor:write",
    ],
  },
  staff: {
    permissions: [
      "schedule:read:own", // Only own shifts
      "availability:write:own",
    ],
  },
};
```

**Implementation:**

- Store role in Clerk publicMetadata
- Create `checkPermission(userId, permission)` helper
- Add permission checks to all server actions
- Update UI to hide unauthorized actions

> **Context for Cursor:** "Implement RBAC using Clerk public metadata. Create a permissions system with owner/manager/staff roles. Add a `checkPermission` helper that reads the user's role from Clerk and checks against required permission. Update ALL existing server actions to check permissions before proceeding. Return 403 for unauthorized requests."

---

### Sprint 6.2: Staff Self-Service Portal

**Scope:** Mobile-friendly view for staff to see their schedules.

**Files to Create:**

- `src/app/(staff)/layout.tsx` - Staff layout (no sidebar)
- `src/app/(staff)/my-shifts/page.tsx`
- `src/app/(staff)/my-shifts/_components/ShiftList.tsx`
- `src/app/(staff)/my-shifts/_components/ShiftDetail.tsx`
- `src/app/(staff)/my-availability/page.tsx`

**UI Design (Mobile-First):**

```
┌─────────────────────┐
│ My Shifts           │
│ Week of Jan 20      │
├─────────────────────┤
│ Mon Jan 20          │
│ ┌─────────────────┐ │
│ │ 9am - 5pm       │ │
│ │ Grill Station   │ │
│ └─────────────────┘ │
├─────────────────────┤
│ Tue Jan 21          │
│ ┌─────────────────┐ │
│ │ 2pm - 10pm      │ │
│ │ Prep Station    │ │
│ └─────────────────┘ │
└─────────────────────┘
```

**Features:**

- View upcoming shifts
- Update own availability
- Request time off (creates TimeOffRequest for manager approval)
- Claim open shifts

> **Context for Cursor:** "Create a mobile-first staff portal. Use a separate route group `(staff)` with a minimal layout (no sidebar, just header with logout). Staff should see their upcoming shifts in a vertical card list. Add a bottom nav with 'My Shifts' and 'Availability' tabs. Only show shifts belonging to the logged-in staff member. Use RBAC to enforce access."

---

### Sprint 6.3: Settings & Configuration Improvements

**Scope:** Admin settings and environment configuration.

**Files to Create/Update:**

- `src/app/(dashboard)/dashboard/settings/page.tsx` - Enhance
- `src/app/(dashboard)/dashboard/settings/_components/IntegrationSettings.tsx`
- `src/app/(dashboard)/dashboard/settings/_components/NotificationSettings.tsx`
- `src/app/(dashboard)/dashboard/settings/_components/TeamSettings.tsx`

**Settings Sections:**

- **Kitchen Config** (existing)
- **Integrations**: Twilio phone number, OpenAI API key status
- **Notifications**: Enable/disable SMS, reminder timing
- **Team**: Invite managers, manage roles
- **Billing**: (placeholder for future)

> **Context for Cursor:** "Enhance the settings page with tabbed sections. Add an Integrations tab showing connected services (Twilio, OpenAI) with status indicators. Add a Notifications tab for configuring SMS settings (enable shift reminders, reminder time). Add a Team tab for viewing/managing team members and their roles. Use Shadcn Tabs component."

---

### Sprint 6.4: Error Boundaries & Loading States

**Scope:** Production-grade error handling and UX.

**Files to Create:**

- `src/app/error.tsx` - Root error boundary
- `src/app/(dashboard)/error.tsx` - Dashboard error boundary
- `src/app/(dashboard)/dashboard/schedule/error.tsx` - Feature error boundary
- `src/app/(dashboard)/dashboard/schedule/loading.tsx` - Feature loading
- `src/components/shared/ErrorFallback.tsx`
- `src/components/shared/LoadingSkeleton.tsx`

**Error Handling Strategy:**

- Catch errors at feature boundary
- Show user-friendly error message
- Provide retry option
- Log errors to console (or future monitoring service)

**Loading States:**

- Skeleton UI for initial data load
- Inline loading for mutations
- Optimistic updates where appropriate

> **Context for Cursor:** "Add production error handling. Create error.tsx files at root, dashboard, and feature levels that catch and display errors nicely. Create loading.tsx files with skeleton UI for each major feature. Wrap async data fetching in Suspense boundaries. Ensure users see helpful messages, not crashes."

---

### Sprint 6.5: Performance Optimization

**Scope:** Optimize for production performance.

**Tasks:**

- Add database indexes review
- Implement query caching strategy
- Add React Server Component optimizations
- Image optimization (if any)
- Bundle analysis

**Files to Create/Update:**

- `src/lib/cache.ts` - Caching utilities
- Review all Mongoose models for indexes
- Add `loading.tsx` for remaining routes

**Optimizations:**

- TanStack Query cache tuning (staleTime, gcTime)
- Mongoose lean queries where appropriate
- Avoid N+1 queries in list endpoints
- Parallel data fetching

> **Context for Cursor:** "Optimize the app for production. Review all Mongoose models and ensure appropriate indexes exist. Add compound indexes for common query patterns. Review TanStack Query configurations—set appropriate staleTime for infrequently changing data (kitchen config). Use lean() for read-only queries. Identify and fix any N+1 query patterns in the services."

---

### Sprint 6.6: Environment & Deployment Configuration

**Scope:** Prepare for deployment.

**Files to Create:**

- `src/lib/env.ts` - Type-safe environment variables
- `.env.example` - Document required env vars
- `scripts/verify-env.ts` - Validate environment before start
- Update `README.md` with deployment instructions

**Environment Variables:**

```
# Database
MONGODB_URI=

# Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# AI
OPENAI_API_KEY=

# SMS
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# App
NEXT_PUBLIC_APP_URL=
```

**Deployment Checklist:**

- [ ] All env vars documented and validated
- [ ] Database indexes created
- [ ] Clerk webhooks configured
- [ ] Twilio webhooks configured
- [ ] Error monitoring setup (optional)
- [ ] Analytics setup (optional)

> **Context for Cursor:** "Create deployment configuration. Build a type-safe env loader that validates all required variables on startup. Create a verification script that checks environment is complete. Document all env vars in .env.example with descriptions. Update README with deployment instructions for Vercel. Add a health check endpoint at `/api/health`."

---

### Sprint 6.7: Final Testing & Documentation

**Scope:** End-to-end testing and documentation.

**Files to Create:**

- `scripts/test-e2e.ts` - Full integration test
- Update `README.md` - Complete documentation
- `DEPLOYMENT.md` - Deployment guide
- `plans/PHASE-6-COMPLETE.md` - Completion report

**Test Scenarios:**

1. New user signup → Configure kitchen → Add staff → Create schedule
2. AI generates schedule → User refines → Publishes
3. Staff calls out via SMS → AI finds coverage → Shift reassigned
4. Staff views their schedule via mobile portal

**Documentation:**

- Architecture overview
- Local development setup
- Deployment instructions
- API documentation (if external APIs exist)

> **Context for Cursor:** "Create comprehensive documentation. Write a complete README with project overview, tech stack, local setup instructions, and architecture summary. Create DEPLOYMENT.md with step-by-step Vercel deployment guide. Create a final e2e test script that exercises all major flows. Document any gotchas or known issues."

---

