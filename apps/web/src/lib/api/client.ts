import { authHeader } from "@/lib/api/auth/token"

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

/**
 * Error thrown for every non-2xx response from apps/api. `message` is the
 * NestJS `message` field when there is one, so validation text reaches the UI
 * unchanged instead of being replaced by a generic string.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown
  ) {
    super(message)
    this.name = "ApiError"
  }
}

function extractMessage(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "message" in body) {
    const { message } = body as { message: unknown }
    // NestJS ValidationPipe returns an array of messages, one per failed rule
    if (Array.isArray(message)) return message.join("\n")
    if (typeof message === "string") return message
  }
  return fallback
}

/**
 * Single entry point for talking to apps/api. Attaches the bearer token when
 * one is available — on the server `authHeader()` is empty, which is why only
 * `@Public()` routes may be called from a Server Component.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  // Resolved before the request so a failure to read the session cannot be
  // mistaken for a failure to reach the API.
  const auth = await authHeader()

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...auth,
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError(0, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง")
  }

  if (response.status === 204) return undefined as T

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractMessage(body, `เกิดข้อผิดพลาด (${response.status})`),
      body
    )
  }

  return body as T
}

type QueryValue = string | number | boolean | string[] | undefined | null

/** Builds `?a=1&b=2`, dropping empty values so blank filters stay out of the URL. */
export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      // SearchProductDto accepts the comma form for categoryIds
      search.set(key, value.join(","))
      continue
    }
    search.set(key, String(value))
  }

  const query = search.toString()
  return query ? `?${query}` : ""
}
