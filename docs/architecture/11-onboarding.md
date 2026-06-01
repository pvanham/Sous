# 11 — Owner Onboarding

This document defines the canonical owner onboarding flow for the web app.

> **See also:** [12-mobile-onboarding.md](./12-mobile-onboarding.md) for
> the staff-side flow that runs in the Expo app. Staff and owners are
> separate journeys — staff arrive via an invitation Universal Link
> and complete a native wizard; owners self-serve through this web
> `/onboarding` flow.

## Purpose

Create tenant data synchronously for newly-signed-up owners, instead of relying
on webhook-side auto-provisioning.

## Route flow

1. User signs up on `/sign-up`.
2. Non-invitation completion redirects to `/onboarding`.
3. Middleware in `apps/web/src/proxy.ts` enforces:
   - `/dashboard*` requires either `publicMetadata.onboardingComplete === true`
     or an invited role (`manager`, `shift_lead`, `staff`).
   - `/onboarding` redirects to `/dashboard` for already-onboarded users.

## Data provisioning sequence

All write operations run through server actions in
`apps/web/src/server/actions/onboarding.actions.ts`:

1. `provisionOrganizationAndLocation`
   - Creates `Organization` (owner + name + optional businessType).
   - Creates first `Location`.
   - Creates owner `OrganizationMember` with `locationId: null`.
2. `saveOnboardingLocationIdentity`
   - Updates the first location name/timezone.
3. `saveOnboardingKitchenConfig`
   - Upserts `KitchenConfig` with week start, operating hours, roles,
     managerRoles, and stations.
4. `saveOnboardingShiftSlots`
   - Seeds location-scoped `LaborRequirement` shift slots.
5. `completeOnboarding`
   - Sets Clerk `publicMetadata.onboardingComplete=true`.

## UI composition

UI route group: `apps/web/src/app/(onboarding)/`.

Wizard components in `apps/web/src/app/(onboarding)/onboarding/_components/`:

- `OnboardingWizard` (step state machine + orchestration)
- `StepOrgProfile`
- `StepLocationIdentity`
- `StepOperationalSettings`
- `StepRolesStations`
- `StepShiftSlots`
- `StepTeamInvites`

Business-type defaults come from
`apps/web/src/lib/onboarding/templates.ts`.

## Error handling contract

- `getLocationContext` throws `NoMembershipError` when no membership exists.
- Dashboard layout catches this and redirects to `/onboarding`.
- Actions return `ActionResponse<T>` and never throw to callers.

## Webhook responsibility after onboarding migration

`apps/web/src/app/api/webhooks/clerk/route.ts` keeps invited-member provisioning
and profile-sync/delete logic only. Owner tenant creation is no longer part of
`user.created`.

## Staff onboarding lives elsewhere

The web `/onboarding` wizard is owner-only. Staff onboarding now
happens entirely in the mobile app — invitation acceptance + first-
time setup are documented in
[12-mobile-onboarding.md](./12-mobile-onboarding.md). The `/invite`
landing page at `apps/web/src/app/invite/page.tsx` is the web
fallback when the mobile Universal Link doesn't resolve (desktop UA
or app not installed); it forwards to `/sign-up` with the Clerk
ticket preserved.
