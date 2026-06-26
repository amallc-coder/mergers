"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PERMISSIONS, ROLE_PERMISSIONS, type Permission } from "@/lib/domain/rbac";
import type { Role } from "@/lib/domain/types";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface AuthConfig {
  users: AdminUser[];
  rolePermissions: Record<Role, Permission[]>;
}

const SESSION_KEY = "mergers.auth.session.v1";
const CONFIG_KEY = "mergers.auth.config.v1";

function defaultConfig(initialUsers: AdminUser[]): AuthConfig {
  // Deep clone the canonical role→permission grants so edits don't mutate source.
  const rolePermissions = Object.fromEntries(
    Object.entries(ROLE_PERMISSIONS).map(([r, perms]) => [r, [...perms]]),
  ) as Record<Role, Permission[]>;
  return { users: initialUsers.map((u) => ({ ...u })), rolePermissions };
}

interface AuthContextValue {
  hydrated: boolean;
  currentUser: AdminUser | null;
  config: AuthConfig;
  allPermissions: readonly Permission[];
  login: (email: string, password: string) => { ok: boolean; error?: string };
  loginAs: (userId: string) => void;
  logout: () => void;
  can: (permission: Permission) => boolean;
  // admin mutators
  setUserRole: (userId: string, role: Role) => void;
  toggleUserActive: (userId: string) => void;
  addUser: (user: Omit<AdminUser, "id">) => void;
  removeUser: (userId: string) => void;
  toggleRolePermission: (role: Role, permission: Permission) => void;
  resetConfig: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  initialUsers,
  children,
}: {
  initialUsers: AdminUser[];
  children: React.ReactNode;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [config, setConfig] = useState<AuthConfig>(() => defaultConfig(initialUsers));
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Load persisted config + session after mount (localStorage is client-only).
  useEffect(() => {
    try {
      const rawConfig = localStorage.getItem(CONFIG_KEY);
      if (rawConfig) {
        const parsed = JSON.parse(rawConfig) as AuthConfig;
        if (parsed?.users && parsed?.rolePermissions) setConfig(parsed);
      }
      const rawSession = localStorage.getItem(SESSION_KEY);
      if (rawSession) setCurrentUserId(JSON.parse(rawSession));
    } catch {
      /* ignore malformed storage */
    }
    setHydrated(true);
  }, []);

  // Persist config.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch {
      /* ignore */
    }
  }, [config, hydrated]);

  // Persist session.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(currentUserId));
    } catch {
      /* ignore */
    }
  }, [currentUserId, hydrated]);

  const currentUser = useMemo(
    () => config.users.find((u) => u.id === currentUserId && u.active) ?? null,
    [config.users, currentUserId],
  );

  const login = useCallback(
    (email: string, _password: string) => {
      const user = config.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!user) return { ok: false, error: "No account found for that email." };
      if (!user.active) return { ok: false, error: "This account is disabled." };
      // Demo auth: any password is accepted. Real auth uses Supabase / Entra ID.
      setCurrentUserId(user.id);
      return { ok: true };
    },
    [config.users],
  );

  const loginAs = useCallback((userId: string) => setCurrentUserId(userId), []);
  const logout = useCallback(() => setCurrentUserId(null), []);

  const can = useCallback(
    (permission: Permission) => {
      if (!currentUser) return false;
      return config.rolePermissions[currentUser.role]?.includes(permission) ?? false;
    },
    [currentUser, config.rolePermissions],
  );

  const setUserRole = useCallback((userId: string, role: Role) => {
    setConfig((c) => ({ ...c, users: c.users.map((u) => (u.id === userId ? { ...u, role } : u)) }));
  }, []);

  const toggleUserActive = useCallback((userId: string) => {
    setConfig((c) => ({
      ...c,
      users: c.users.map((u) => (u.id === userId ? { ...u, active: !u.active } : u)),
    }));
  }, []);

  const addUser = useCallback((user: Omit<AdminUser, "id">) => {
    setConfig((c) => ({
      ...c,
      users: [...c.users, { ...user, id: `u-${Math.abs(hashString(user.email + c.users.length))}` }],
    }));
  }, []);

  const removeUser = useCallback(
    (userId: string) => {
      setConfig((c) => ({ ...c, users: c.users.filter((u) => u.id !== userId) }));
      setCurrentUserId((id) => (id === userId ? null : id));
    },
    [],
  );

  const toggleRolePermission = useCallback((role: Role, permission: Permission) => {
    setConfig((c) => {
      const current = c.rolePermissions[role] ?? [];
      const next = current.includes(permission)
        ? current.filter((p) => p !== permission)
        : [...current, permission];
      return { ...c, rolePermissions: { ...c.rolePermissions, [role]: next } };
    });
  }, []);

  const resetConfig = useCallback(() => setConfig(defaultConfig(initialUsers)), [initialUsers]);

  const value: AuthContextValue = {
    hydrated,
    currentUser,
    config,
    allPermissions: PERMISSIONS,
    login,
    loginAs,
    logout,
    can,
    setUserRole,
    toggleUserActive,
    addUser,
    removeUser,
    toggleRolePermission,
    resetConfig,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
