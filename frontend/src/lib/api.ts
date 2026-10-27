/** Error returned by the Sovra backend: `{ error: { code, message } }`. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const FALLBACK: Record<number, string> = {
  401: "Your session ended. Sign in again to continue.",
  403: "You don't have access to that.",
  404: "That couldn't be found.",
  429: "Too many requests. Wait a moment and try again.",
  501: "That feature isn't switched on yet.",
  503: "That service isn't available right now. Try again shortly.",
};

/** JSON fetch against the backend. Throws ApiError with a message that is safe to show to users. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: "include",
      ...rest,
      headers: json === undefined ? headers : { "content-type": "application/json", ...headers },
      body: json === undefined ? rest.body : JSON.stringify(json),
    });
  } catch {
    throw new ApiError(0, "network", "Can't reach Sovra. Check your connection and try again.");
  }

  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "http_error",
      err?.message ?? FALLBACK[res.status] ?? "Something went wrong. Try again.",
    );
  }
  return body as T;
}
