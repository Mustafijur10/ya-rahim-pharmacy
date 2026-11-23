import type { Module, PermissionLevel, Role, User } from "./types";

/** Mirrors User::hasModuleAccess() in Laravel. Levels default to "full". */
export function can(user: User | null | undefined, module: Module, ...levels: PermissionLevel[]): boolean {
  if (!user?.is_staff || !user.permissions) return false;
  const wanted = levels.length ? levels : (["full"] as PermissionLevel[]);
  return wanted.some((level) => user.permissions!.includes(`${module}.${level}`));
}

/** Where each role lands after signing in. */
export function homeFor(user: User): string {
  if (!user.is_staff) return "/account";
  const homes: Record<Role, string> = {
    owner: "/admin",
    manager: "/admin",
    pharmacist: "/admin/pharmacist",
    cashier: "/admin/counter",
    store_keeper: "/admin/inventory",
    rider: "/rider",
  };
  return user.role ? homes[user.role] : "/admin";
}

/** Only allow same-site relative redirects after sign-in (no open redirects). */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
