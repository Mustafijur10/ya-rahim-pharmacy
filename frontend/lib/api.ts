import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

/**
 * Browser client for the Laravel API. Requests go to /api on this same site and are
 * forwarded to Laravel (next.config.ts), so the session cookie is first-party.
 */
export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  withXSRFToken: true,
  headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
});

let csrfReady: Promise<unknown> | null = null;

/** Laravel needs the XSRF-TOKEN cookie before the first POST/PUT/DELETE. */
export function ensureCsrf(force = false) {
  if (force || !csrfReady) {
    csrfReady = axios.get("/sanctum/csrf-cookie", { withCredentials: true }).catch((e) => {
      csrfReady = null;
      throw e;
    });
  }
  return csrfReady;
}

api.interceptors.request.use(async (config) => {
  if (config.method && config.method.toLowerCase() !== "get") {
    await ensureCsrf();
  }
  return config;
});

// 419 = CSRF token expired (e.g. tab left open overnight): refresh it and retry once.
api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
  if (error.response?.status === 419 && config && !config._retried) {
    config._retried = true;
    await ensureCsrf(true);
    return api.request(config);
  }
  return Promise.reject(error);
});

/** One error shape for every failed call. `message` is safe to show to staff/customers. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string | null = null,
    public context: Record<string, unknown> = {},
    public fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** First validation message for a field, e.g. err.field("phone"). */
  field(name: string): string | undefined {
    return this.fieldErrors[name]?.[0];
  }
}

type LaravelErrorBody = {
  message?: string;
  code?: string;
  context?: Record<string, unknown>;
  errors?: Record<string, string[]>;
};

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    const body = (error.response?.data ?? {}) as LaravelErrorBody;
    if (status === 0) {
      return new ApiError("Can’t reach the server. Check your internet connection.", 0, "network");
    }
    const message =
      status === 429 && !body.code
        ? "Too many attempts. Please wait a moment and try again."
        : status >= 500
          ? "Something went wrong on our side. Please try again."
          : body.message || "Request failed.";
    return new ApiError(message, status, body.code ?? null, body.context ?? {}, body.errors ?? {});
  }
  return new ApiError(error instanceof Error ? error.message : "Something went wrong.", 0);
}

/** GET helper returning data and throwing ApiError. */
export async function apiGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  try {
    return (await api.get<T>(path, { params })).data;
  } catch (e) {
    throw toApiError(e);
  }
}

export async function apiSend<T>(method: "post" | "put" | "patch" | "delete", path: string, body?: unknown): Promise<T> {
  try {
    return (await api.request<T>({ method, url: path, data: body })).data;
  } catch (e) {
    throw toApiError(e);
  }
}
