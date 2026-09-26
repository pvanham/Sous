import type { StaffListParams } from "@sous/types";
import {
  STAFF_LIST_DEFAULTS,
  staffListParamsSchema,
} from "@/lib/validations/staff.schema";

function firstSearchParam(
  raw: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  if (!raw) return undefined;
  const value = raw[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Parse directory URL search params (`q`, `page`, `sort`, …) into
 * validated `StaffListParams`. Invalid or missing values fall back to
 * defaults so a stale shared link never 400s the page.
 */
export function parseStaffListSearchParams(
  raw: Record<string, string | string[] | undefined> | undefined,
): StaffListParams {
  const page = Number(firstSearchParam(raw, "page"));
  const pageSize = Number(firstSearchParam(raw, "pageSize"));
  const search = firstSearchParam(raw, "q")?.trim();
  const role = firstSearchParam(raw, "role")?.trim();
  const station = firstSearchParam(raw, "station")?.trim();

  const parsed = staffListParamsSchema.safeParse({
    page: Number.isFinite(page) && page >= 1 ? page : STAFF_LIST_DEFAULTS.page,
    pageSize:
      Number.isFinite(pageSize) && pageSize >= 1
        ? pageSize
        : STAFF_LIST_DEFAULTS.pageSize,
    sortOrder: firstSearchParam(raw, "sort"),
    search: search || undefined,
    status: firstSearchParam(raw, "status"),
    role: role || undefined,
    invitationStatus: firstSearchParam(raw, "invite"),
    station: station || undefined,
  });

  if (parsed.success) return parsed.data;
  return staffListParamsSchema.parse({});
}

/** Serialize list params to a query string, omitting default values. */
export function staffListParamsToSearchString(params: StaffListParams): string {
  const parts: string[] = [];
  const add = (key: string, value: string) => {
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  };

  if (params.search) add("q", params.search);
  if (params.page !== STAFF_LIST_DEFAULTS.page) {
    add("page", String(params.page));
  }
  if (params.pageSize !== STAFF_LIST_DEFAULTS.pageSize) {
    add("pageSize", String(params.pageSize));
  }
  if (params.sortOrder !== STAFF_LIST_DEFAULTS.sortOrder) {
    add("sort", params.sortOrder);
  }
  if (params.status && params.status !== STAFF_LIST_DEFAULTS.status) {
    add("status", params.status);
  }
  if (params.role) add("role", params.role);
  if (
    params.invitationStatus &&
    params.invitationStatus !== STAFF_LIST_DEFAULTS.invitationStatus
  ) {
    add("invite", params.invitationStatus);
  }
  if (params.station) add("station", params.station);
  return parts.join("&");
}
