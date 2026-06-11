import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loginUser, logoutUser, registerUser, verifyAuthSession } from '../api/auth';
import { getAuthToken, getCachedUser, type AuthUser } from '../lib/auth-session';
import {
  normalizeUserRole,
  permissionsForRole,
  type UserRole,
} from '../lib/permissions';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
  role: UserRole | null;
  permissions: ReturnType<typeof permissionsForRole>;
  isGuest: boolean;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function goLibraryAfterAuth(): void {
  if (window.location.hash === '#/login' || window.location.hash === '') {
    window.location.hash = '#/library';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getCachedUser());
  const [loading, setLoading] = useState(() => Boolean(getAuthToken()) && !getCachedUser());

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    const cached = getCachedUser();
    if (cached) {
      setUser(cached);
      setLoading(false);
    }

    let cancelled = false;
    void (async () => {
      const verified = await verifyAuthSession();
      if (cancelled) return;
      setUser(verified);
      setLoading(false);
      if (verified && window.location.hash === '#/login') {
        goLibraryAfterAuth();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await loginUser({ email, password });
    setUser(session.user);
    goLibraryAfterAuth();
  }, []);

  const register = useCallback(
    async (email: string, password: string, firstName: string, lastName: string) => {
      const session = await registerUser({ email, password, firstName, lastName });
      setUser(session.user);
      goLibraryAfterAuth();
    },
    [],
  );

  const logout = useCallback(() => {
    logoutUser();
    setUser(null);
    if (window.location.hash !== '#/library') {
      window.location.hash = '#/library';
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const verified = await verifyAuthSession();
    setUser(verified);
  }, []);

  const role = user ? normalizeUserRole(user.role) : null;
  const permissions = useMemo(() => permissionsForRole(role), [role]);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      refreshSession,
      role,
      permissions,
      isGuest: !user,
      isAdmin: role === 'admin',
    }),
    [user, loading, login, register, logout, refreshSession, role, permissions],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
