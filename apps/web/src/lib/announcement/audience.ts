import { ANNOUNCEMENT_AUDIENCE_TOKENS } from "@sous/types";

export type AudienceSelection = {
  includeEveryone: boolean;
  includeManagers: boolean;
  specificRoles: string[];
};

function uniqueStable(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function encodeAudience(selection: AudienceSelection): string[] {
  if (selection.includeEveryone) {
    return [ANNOUNCEMENT_AUDIENCE_TOKENS.everyone];
  }

  const roles = uniqueStable(
    selection.specificRoles
      .map((role) => role.trim())
      .filter((role) => role.length > 0)
  );

  if (selection.includeManagers) {
    return [ANNOUNCEMENT_AUDIENCE_TOKENS.managers, ...roles];
  }

  return roles;
}

export function decodeAudience(targetAudience: string[]): AudienceSelection {
  const includeEveryone = targetAudience.includes(
    ANNOUNCEMENT_AUDIENCE_TOKENS.everyone
  );

  if (includeEveryone) {
    return {
      includeEveryone: true,
      includeManagers: false,
      specificRoles: [],
    };
  }

  const includeManagers = targetAudience.includes(
    ANNOUNCEMENT_AUDIENCE_TOKENS.managers
  );

  const specificRoles = uniqueStable(
    targetAudience.filter(
      (entry) =>
        entry !== ANNOUNCEMENT_AUDIENCE_TOKENS.everyone &&
        entry !== ANNOUNCEMENT_AUDIENCE_TOKENS.managers
    )
  );

  return {
    includeEveryone: false,
    includeManagers,
    specificRoles,
  };
}

export function describeAudience(targetAudience: string[]): string {
  const selection = decodeAudience(targetAudience);
  if (selection.includeEveryone) return "Everyone";

  const parts: string[] = [];
  if (selection.includeManagers) {
    parts.push("All managers");
  }
  if (selection.specificRoles.length > 0) {
    parts.push(selection.specificRoles.join(", "));
  }
  return parts.length > 0 ? parts.join(" + ") : "No audience selected";
}

export function validateAudienceEntriesWithRoleSet(
  targetAudience: string[],
  availableRoles: readonly string[]
): string | null {
  const roleSet = new Set(availableRoles);
  for (const entry of targetAudience) {
    if (
      entry === ANNOUNCEMENT_AUDIENCE_TOKENS.everyone ||
      entry === ANNOUNCEMENT_AUDIENCE_TOKENS.managers
    ) {
      continue;
    }
    if (!roleSet.has(entry)) {
      return `Unknown audience role: "${entry}"`;
    }
  }
  return null;
}
