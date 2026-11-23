/**
 * Server-side reads of PUBLIC store data (catalog, store info), for Server Components.
 * Wrap callers in "use cache" + cacheLife so pages prerender and stay fast.
 * Never use this for anything that needs the visitor's session.
 */
const API = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";

export async function serverGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/api${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`API ${path} responded ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Same as serverGet but returns `fallback` if the API is down (e.g. during a build). */
export async function serverGetOr<T>(path: string, fallback: T): Promise<T> {
  try {
    return await serverGet<T>(path);
  } catch {
    return fallback;
  }
}
