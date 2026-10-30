import { listOrdersQuerySchema, type ListOrdersQuery } from "@/server/validation/order-schemas";

type RawParams = Record<string, string | string[] | undefined>;

/** Page URLs are user-editable: bad values fall back to defaults instead of erroring. */
export function parseListQuery(raw: RawParams): ListOrdersQuery {
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = listOrdersQuerySchema.safeParse(flat);
  return parsed.success ? parsed.data : listOrdersQuerySchema.parse({});
}
