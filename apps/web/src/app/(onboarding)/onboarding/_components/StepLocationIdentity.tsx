"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type StepLocationIdentityProps = {
  initialName: string;
  initialTimezone: string;
  onBackAction: () => void;
  onNextAction: (payload: { name: string; timezone: string }) => Promise<void>;
};

export function StepLocationIdentity({
  initialName,
  initialTimezone,
  onBackAction,
  onNextAction,
}: StepLocationIdentityProps) {
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supportedTimezones = useMemo(() => {
    if (!("supportedValuesOf" in Intl)) {
      return [initialTimezone];
    }

    try {
      const values = Intl.supportedValuesOf("timeZone");
      if (values.includes(initialTimezone)) {
        return values;
      }
      return [initialTimezone, ...values];
    } catch {
      return [initialTimezone];
    }
  }, [initialTimezone]);

  const canContinue =
    name.trim().length >= 2 && timezone.trim().length > 0 && !isSaving;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canContinue) return;
    setIsSaving(true);
    setError(null);
    try {
      await onNextAction({
        name: name.trim(),
        timezone: timezone.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save location");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Location Identity
        </h2>
        <p className="text-sm text-muted-foreground">
          Configure your first location. You can add more later from Settings.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="location-name">Location Name</Label>
          <Input
            id="location-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Downtown Kitchen"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location-timezone">Timezone</Label>
          <Popover open={timezoneOpen} onOpenChange={setTimezoneOpen}>
            <PopoverTrigger asChild>
              <Button
                id="location-timezone"
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={timezoneOpen}
                className="w-full justify-between font-normal"
              >
                <span
                  className={cn(
                    !timezone ? "text-muted-foreground" : undefined,
                  )}
                >
                  {timezone || "Select timezone"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[var(--radix-popover-trigger-width)] p-0"
              align="start"
            >
              <Command>
                <CommandInput placeholder="Search timezone..." />
                <CommandList>
                  <CommandEmpty>No timezone found.</CommandEmpty>
                  <CommandGroup>
                    {supportedTimezones.map((tz) => (
                      <CommandItem
                        key={tz}
                        value={tz}
                        onSelect={(selectedValue) => {
                          setTimezone(selectedValue);
                          setTimezoneOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            timezone === tz ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span>{tz}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <p className="text-xs text-muted-foreground">
            Select an IANA timezone (for example, America/Los_Angeles).
          </p>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBackAction}
          disabled={isSaving}
        >
          Back
        </Button>
        <Button type="submit" disabled={!canContinue}>
          {isSaving ? "Saving..." : "Continue"}
        </Button>
      </div>
    </form>
  );
}
