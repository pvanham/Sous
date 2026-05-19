"use client";

import { useState } from "react";
import type { BusinessType } from "@sous/types";
import { BUSINESS_TYPES } from "@sous/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type StepOrgProfileProps = {
  initialName: string;
  initialBusinessType: BusinessType;
  onNextAction: (payload: { name: string; businessType: BusinessType }) => Promise<void>;
};

const businessTypeLabels: Record<BusinessType, string> = {
  qsr: "Quick Service Restaurant",
  fast_casual: "Fast Casual",
  fine_dining: "Fine Dining",
  catering: "Catering",
  bar: "Bar",
  cafe: "Cafe",
  other: "Other",
};

export function StepOrgProfile({
  initialName,
  initialBusinessType,
  onNextAction,
}: StepOrgProfileProps) {
  const [name, setName] = useState(initialName);
  const [businessType, setBusinessType] = useState<BusinessType>(initialBusinessType);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = name.trim().length >= 2 && !isSaving;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canContinue) return;
    setIsSaving(true);
    setError(null);
    try {
      await onNextAction({ name: name.trim(), businessType });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save organization details");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Organization Profile</h2>
        <p className="text-sm text-muted-foreground">
          Set up your company details. We&apos;ll use this to pre-fill recommended defaults.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="org-name">Organization Name</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Sous Hospitality Group"
            maxLength={100}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="org-business-type">Primary Business Type</Label>
          <Select
            value={businessType}
            onValueChange={(value) => setBusinessType(value as BusinessType)}
          >
            <SelectTrigger id="org-business-type">
              <SelectValue placeholder="Select a business type" />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {businessTypeLabels[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={!canContinue}>
          {isSaving ? "Saving..." : "Continue"}
        </Button>
      </div>
    </form>
  );
}
