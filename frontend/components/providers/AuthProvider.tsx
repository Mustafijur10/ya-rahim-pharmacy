"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo } from "react";
import { apiGet, apiSend, ApiError } from "@/lib/api";
import { can as canFn } from "@/lib/permissions";
import type { Features, Module, PermissionLevel, User } from "@/lib/types";

type AuthContextValue = {
  user: User | null;
  /** "Modules & features" switches (only known once signed in). */
  features: Features;
  isLoading: boolean;
  /** Put a freshly signed-in user (and the feature switches from the same response) into the cache. */
  setUser: (user: User | null, features?: Features) => void;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
  can: (module: Module, ...levels: PermissionLevel[]) => boolean;
  /** Is a module turned on? Unknown keys count as on until the switches have loaded. */
  feature: (key: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const ME_KEY = ["auth", "me"] as const;

type Me = { user: User | null; features: Features };

async function fetchMe(): Promise<Me> {
  try {
    return await apiGet<Me>("/auth/me");
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 419)) return { user: null, features: {} };
    throw e;
  }
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const setUser = useCallback(
    (user: User | null, features?: Features) =>
      queryClient.setQueryData<Me>(ME_KEY, (prev) => ({ user, features: features ?? prev?.features ?? {} })),
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await apiSend("post", "/auth/logout");
    } finally {
      queryClient.clear();
      queryClient.setQueryData<Me>(ME_KEY, { user: null, features: {} });
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => {
    const user = data?.user ?? null;
    const features = data?.features ?? {};
    return {
      user,
      features,
      isLoading,
      setUser,
      refresh: refetch,
      logout,
      can: (module, ...levels) => canFn(user, module, ...levels),
      feature: (key) => features[key] ?? true,
    };
  }, [data, isLoading, setUser, refetch, logout]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
