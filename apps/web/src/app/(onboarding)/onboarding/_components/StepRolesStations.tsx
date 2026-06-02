"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type StepRolesStationsProps = {
  initialRoles: string[];
  initialStations: string[];
  initialManagerRoles: string[];
  onBackAction: () => void;
  onNextAction: (payload: {
    roles: string[];
    stations: string[];
    managerRoles: string[];
  }) => void;
};

function normalizeUnique(items: string[]): string[] {
  const unique = new Set<string>();
  const ordered: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);
    ordered.push(trimmed);
  }
  return ordered;
}

export function StepRolesStations({
  initialRoles,
  initialStations,
  initialManagerRoles,
  onBackAction,
  onNextAction,
}: StepRolesStationsProps) {
  const [roles, setRoles] = useState<string[]>(normalizeUnique(initialRoles));
  const [stations, setStations] = useState<string[]>(
    normalizeUnique(initialStations),
  );
  const [managerRoles, setManagerRoles] = useState<string[]>(
    normalizeUnique(initialManagerRoles),
  );
  const [newRole, setNewRole] = useState("");
  const [newStation, setNewStation] = useState("");

  const canContinue = useMemo(
    () => roles.length > 0 && stations.length > 0,
    [roles, stations],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Roles & Stations
        </h2>
        <p className="text-sm text-muted-foreground">
          We pre-filled common defaults for your business type. Keep what you
          need and edit the rest.
        </p>
      </div>

      <div className="space-y-4">
        <Label>Roles</Label>
        <div className="flex flex-wrap gap-2">
          {roles.map((role) => (
            <div
              key={role}
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm"
            >
              <span>{role}</span>
              <button
                type="button"
                aria-label={`Remove ${role}`}
                onClick={() => {
                  setRoles((prev) => prev.filter((value) => value !== role));
                  setManagerRoles((prev) =>
                    prev.filter((value) => value !== role),
                  );
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={newRole}
            onChange={(event) => setNewRole(event.target.value)}
            placeholder="Add role (e.g. Prep Cook)"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const role = newRole.trim();
              if (!role) return;
              setRoles((prev) => normalizeUnique([...prev, role]));
              setNewRole("");
            }}
          >
            Add Role
          </Button>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Choose which roles can manage schedules:
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.map((role) => {
              const checked = managerRoles.includes(role);
              return (
                <label key={role} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) => {
                      setManagerRoles((prev) =>
                        next
                          ? normalizeUnique([...prev, role])
                          : prev.filter((value) => value !== role),
                      );
                    }}
                  />
                  <span>{role}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Label>Stations / Skills</Label>
        <div className="flex flex-wrap gap-2">
          {stations.map((station) => (
            <div
              key={station}
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm"
            >
              <span>{station}</span>
              <button
                type="button"
                aria-label={`Remove ${station}`}
                onClick={() =>
                  setStations((prev) =>
                    prev.filter((value) => value !== station),
                  )
                }
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={newStation}
            onChange={(event) => setNewStation(event.target.value)}
            placeholder="Add station (e.g. Fry)"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const station = newStation.trim();
              if (!station) return;
              setStations((prev) => normalizeUnique([...prev, station]));
              setNewStation("");
            }}
          >
            Add Station
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={onBackAction}>
          Back
        </Button>
        <Button
          type="button"
          disabled={!canContinue}
          onClick={() =>
            onNextAction({
              roles,
              stations,
              managerRoles: managerRoles.filter((role) => roles.includes(role)),
            })
          }
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
