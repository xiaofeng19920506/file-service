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
  register: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    stateProvince: string;
    postalCode: string;
    country?: string;
  }) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
  role: UserRole | null;
  permissions: ReturnType<typeof permissionsForRole>;
  isGuest: boolean;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** 会话校验最长阻塞首屏时间（弱网 / 跨境） */
const SESSION_VERIFY_TIMEOUT_MS = 8_000;

function goHomeAfterAuth(user?: { role: string } | null): void {
  const hash = window.location.hash;
  if (hash !== '#/login' && hash !== '' && hash !== '#/' && hash !== '#') return;
  if (user && normalizeUserRole(user.role) === 'vip') {
    window.location.hash = '#/vip';
    return;
  }
  window.location.hash = '#/playlists';
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
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, SESSION_VERIFY_TIMEOUT_MS);

    void (async () => {
      try {
        const verified = await verifyAuthSession();
        if (cancelled) return;
        setUser(verified ?? getCachedUser());
        if ((verified ?? getCachedUser()) && window.location.hash === '#/login') {
          goHomeAfterAuth(verified ?? getCachedUser());
        }
      } finally {
        if (!cancelled) {
          window.clearTimeout(timeoutId);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await loginUser({ email, password });
    setUser(session.user);
    goHomeAfterAuth(session.user);
  }, []);

  const register = useCallback(
    async (input: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      stateProvince: string;
      postalCode: string;
      country?: string;
    }) => {
      const session = await registerUser(input);
      setUser(session.user);
      goHomeAfterAuth(session.user);
    },
    [],
  );

  const logout = useCallback(() => {
    logoutUser();
    setUser(null);
    window.location.hash = '#/login';
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
