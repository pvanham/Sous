/**
 * Who counts as a manager for coverage checks.
 *
 * `solver/main.py` (`_is_manager`) mirrors this rule so the CP-SAT
 * solver and the publish-time warning agree. Change both together.
 *
 * - When the kitchen lists `managerRoles`, a staff member is a manager
 *   when any of their roles is in that list (exact match).
 * - Otherwise fall back to common manager titles.
 */
export function isManagerByRoles(roles: string[], managerRoles: string[]): boolean {
  if (managerRoles.length > 0) {
    return roles.some((role) => managerRoles.includes(role));
  }

  return roles.some((role) => {
    const lower = role.toLowerCase();
    return (
      lower.includes("manager") ||
      lower === "gm" ||
      lower === "km" ||
      lower === "agm" ||
      lower === "shift leader" ||
      lower === "sous chef"
    );
  });
}
