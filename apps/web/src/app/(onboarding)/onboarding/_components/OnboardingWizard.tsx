"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import type {
  BusinessType,
  DayOfWeek,
  WeeklyOperatingHoursDTO,
} from "@sous/types";
import { defaultKitchenConfigValues } from "@/lib/validations/kitchen-config.schema";
import { getMyOrganization } from "@/server/actions/organization.actions";
import {
  completeOnboarding,
  provisionOrganizationAndLocation,
  saveOnboardingKitchenConfig,
  saveOnboardingLocationIdentity,
  saveOnboardingShiftSlots,
} from "@/server/actions/onboarding.actions";
import {
  KITCHEN_TEMPLATES,
  type ShiftSlotTemplate,
} from "@/lib/onboarding/templates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingStepper } from "./OnboardingStepper";
import { StepOrgProfile } from "./StepOrgProfile";
import { StepLocationIdentity } from "./StepLocationIdentity";
import { StepOperationalSettings } from "./StepOperationalSettings";
import { StepRolesStations } from "./StepRolesStations";
import { StepShiftSlots } from "./StepShiftSlots";
import { StepTeamInvites } from "./StepTeamInvites";

type WizardState = {
  orgName: string;
  businessType: BusinessType;
  locationId: string | null;
  locationName: string;
  timezone: string;
  weekStartsOn: DayOfWeek;
  operatingHours: WeeklyOperatingHoursDTO;
  roles: string[];
  managerRoles: string[];
  stations: string[];
  shiftSlots: ShiftSlotTemplate[];
};

const steps = [
  "Organization",
  "Location",
  "Operations",
  "Roles",
  "Shift Slots",
  "Team",
];

function getTemplateState(
  businessType: BusinessType,
): Pick<
  WizardState,
  "roles" | "managerRoles" | "stations" | "operatingHours" | "shiftSlots"
> {
  const template = KITCHEN_TEMPLATES[businessType];
  return {
    roles: template.roles,
    managerRoles: template.managerRoles,
    stations: template.stations,
    operatingHours: template.operatingHours,
    shiftSlots: template.shiftSlots,
  };
}

export function OnboardingWizard() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<WizardState>({
    orgName: "",
    businessType: "qsr",
    locationId: null,
    locationName: "Main Location",
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    weekStartsOn: defaultKitchenConfigValues.weekStartsOn,
    operatingHours: defaultKitchenConfigValues.operatingHours,
    roles: defaultKitchenConfigValues.roles.filter(Boolean),
    managerRoles: defaultKitchenConfigValues.managerRoles,
    stations: defaultKitchenConfigValues.stations.filter(Boolean),
    shiftSlots: [],
  });

  const template = useMemo(
    () => getTemplateState(state.businessType),
    [state.businessType],
  );

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setLoading(true);
      const result = await getMyOrganization();
      if (cancelled) return;

      if (!result.success) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result.data) {
        const businessType = result.data.businessType ?? "qsr";
        const defaults = getTemplateState(businessType);
        setState((prev) => ({
          ...prev,
          orgName: result.data?.name || prev.orgName,
          businessType,
          roles: defaults.roles,
          managerRoles: defaults.managerRoles,
          stations: defaults.stations,
          operatingHours: defaults.operatingHours,
          shiftSlots: defaults.shiftSlots,
        }));
        setCurrentStep(2);
      } else {
        setState((prev) => ({
          ...prev,
          ...template,
        }));
      }

      setLoading(false);
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [template]);

  const persistKitchenConfig = async (next: Partial<WizardState>) => {
    const payload = {
      name: state.locationName,
      stations: next.stations ?? state.stations,
      roles: next.roles ?? state.roles,
      managerRoles: next.managerRoles ?? state.managerRoles,
      operatingHours: next.operatingHours ?? state.operatingHours,
      minTimeOffAdvanceDays: defaultKitchenConfigValues.minTimeOffAdvanceDays,
      aiSettings: defaultKitchenConfigValues.aiSettings,
      weekStartsOn: next.weekStartsOn ?? state.weekStartsOn,
    };
    const saved = await saveOnboardingKitchenConfig(payload);
    if (!saved.success) {
      throw new Error(saved.error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Setting up onboarding...</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Please wait a moment.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-4">
        <CardTitle className="text-2xl">Owner Onboarding</CardTitle>
        <OnboardingStepper currentStep={currentStep} steps={steps} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardHeader>
      <CardContent>
        {currentStep === 1 ? (
          <StepOrgProfile
            initialName={state.orgName}
            initialBusinessType={state.businessType}
            onNextAction={async ({ name, businessType }) => {
              setError(null);
              const result = await provisionOrganizationAndLocation({
                name,
                businessType,
              });
              if (!result.success) {
                throw new Error(result.error);
              }
              const defaults = getTemplateState(businessType);
              setState((prev) => ({
                ...prev,
                orgName: name,
                businessType,
                locationId: result.data.locationId,
                roles: defaults.roles,
                managerRoles: defaults.managerRoles,
                stations: defaults.stations,
                operatingHours: defaults.operatingHours,
                shiftSlots: defaults.shiftSlots,
              }));
              setCurrentStep(2);
            }}
          />
        ) : null}

        {currentStep === 2 ? (
          <StepLocationIdentity
            initialName={state.locationName}
            initialTimezone={state.timezone}
            onBackAction={() => setCurrentStep(1)}
            onNextAction={async ({ name, timezone }) => {
              setError(null);
              const result = await saveOnboardingLocationIdentity(
                state.locationId || "",
                {
                  name,
                  timezone,
                },
              );
              if (!result.success) {
                throw new Error(result.error);
              }
              setState((prev) => ({
                ...prev,
                locationName: name,
                timezone,
                locationId: result.data.locationId,
              }));
              setCurrentStep(3);
            }}
          />
        ) : null}

        {currentStep === 3 ? (
          <StepOperationalSettings
            initialWeekStartsOn={state.weekStartsOn}
            initialOperatingHours={state.operatingHours}
            onBackAction={() => setCurrentStep(2)}
            onNextAction={({ weekStartsOn, operatingHours }) => {
              setState((prev) => ({
                ...prev,
                weekStartsOn,
                operatingHours,
              }));
              setCurrentStep(4);
            }}
          />
        ) : null}

        {currentStep === 4 ? (
          <StepRolesStations
            initialRoles={state.roles}
            initialStations={state.stations}
            initialManagerRoles={state.managerRoles}
            onBackAction={() => setCurrentStep(3)}
            onNextAction={async ({ roles, stations, managerRoles }) => {
              await persistKitchenConfig({
                roles,
                stations,
                managerRoles,
              });
              setState((prev) => ({ ...prev, roles, stations, managerRoles }));
              setCurrentStep(5);
            }}
          />
        ) : null}

        {currentStep === 5 ? (
          <StepShiftSlots
            stations={state.stations}
            initialShiftSlots={state.shiftSlots}
            onBackAction={() => setCurrentStep(4)}
            onNextAction={async (shiftSlots) => {
              await persistKitchenConfig({});
              const flattened = shiftSlots.flatMap((slot) =>
                slot.daysOfWeek.map((dayOfWeek) => ({
                  dayOfWeek,
                  station: slot.station || state.stations[0] || "Main Station",
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                  minStaff: slot.minStaff,
                  preferredStaff: slot.preferredStaff,
                  priority: slot.priority,
                })),
              );
              const saved = await saveOnboardingShiftSlots(flattened);
              if (!saved.success) {
                throw new Error(saved.error);
              }
              setState((prev) => ({ ...prev, shiftSlots }));
              setCurrentStep(6);
            }}
          />
        ) : null}

        {currentStep === 6 ? (
          <StepTeamInvites
            roles={state.roles}
            onBackAction={() => setCurrentStep(5)}
            onFinishAction={async () => {
              const done = await completeOnboarding();
              if (!done.success) {
                throw new Error(done.error);
              }
              // Clerk caches the session JWT in the browser cookie. Without an
              // explicit refresh, the middleware reads stale `sessionClaims`
              // and bounces the user back to /onboarding. Force the SDK to
              // pull fresh user data and rotate the session token before we
              // navigate.
              await user?.reload();
              await getToken({ skipCache: true });
              window.location.assign("/dashboard?onboarding=complete");
            }}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
