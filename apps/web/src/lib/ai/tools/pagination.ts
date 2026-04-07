import { z } from "zod";

/** Hard ceiling — no AI tool may return more than this many records */
export const MAX_PAGE_SIZE = 20;
export const DEFAULT_PAGE_SIZE = 10;

/** Reusable Zod schema fragment for pagination parameters */
export const paginationParamsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

export type PaginationParams = z.infer<typeof paginationParamsSchema>;

/** Pagination metadata included in every list-type tool result */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  hasNextPage: boolean;
}

/** Apply pagination to an array and return paginated results + metadata */
export function paginate<T>(
  items: T[],
  params: PaginationParams
): { items: T[]; pagination: PaginationMeta } {
  const pageSize = Math.min(params.pageSize, MAX_PAGE_SIZE);
  const totalRecords = items.length;
  const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / pageSize);
  const page = params.page;
  const hasNextPage = page < totalPages;

  const start = (page - 1) * pageSize;
  const sliced = start >= totalRecords ? [] : items.slice(start, start + pageSize);

  return {
    items: sliced,
    pagination: {
      page,
      pageSize,
      totalRecords,
      totalPages,
      hasNextPage,
    },
  };
}
