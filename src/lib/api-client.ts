/** Mirror of the server's error envelope: { error: { code, message, details? } }. */
export interface ApiError {
  code: string;
  message: string;
  details?: { fields?: Record<string, string> };
}

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiError };

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    return { ok: false, status: 0, error: { code: "NETWORK_ERROR", message: "Could not reach the server. Check your connection and try again." } };
  }
  if (res.status === 204) return { ok: true, status: 204, data: undefined as T };
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, status: res.status, data: body as T };
  const error =
    body && typeof body === "object" && "error" in body
      ? (body as { error: ApiError }).error
      : { code: "UNKNOWN", message: `Request failed (${res.status}).` };
  return { ok: false, status: res.status, error };
}
