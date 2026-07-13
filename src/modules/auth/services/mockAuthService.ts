import { ApiResponse, Session, User } from '../../../shared/types';

/**
 * Temporary mock auth backend so the app is usable before the real auth API
 * is wired up (see LoginScreen TODO). Replace this module with a real
 * `apiService.post('/auth/login', ...)` call once the backend is available -
 * the `login` signature below is designed to be a drop-in swap.
 */

interface MockAccount extends User {
  password: string;
}

const MOCK_ACCOUNTS: MockAccount[] = [
  {
    id: 'user-1',
    username: 'teacher',
    password: 'teacher123',
    name: 'Test Teacher',
    role: 'teacher',
    allowedModules: ['staffAttendance', 'studentAttendance'],
  },
  {
    id: 'user-2',
    username: 'admin',
    password: 'admin123',
    name: 'Test Admin',
    role: 'admin',
    allowedModules: ['staffAttendance', 'studentAttendance'],
  },
];

const MOCK_SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

export async function login(
  username: string,
  password: string
): Promise<ApiResponse<Session>> {
  // Simulate network latency so loading state is visible.
  await new Promise(resolve => setTimeout(resolve, 400));

  const account = MOCK_ACCOUNTS.find(
    acct => acct.username.toLowerCase() === username.toLowerCase()
  );

  if (!account || account.password !== password) {
    return { success: false, error: 'Invalid username or password' };
  }

  const { password: _password, ...user } = account;

  const session: Session = {
    token: `mock-token-${user.id}-${Date.now()}`,
    expiresAt: Date.now() + MOCK_SESSION_DURATION_MS,
    user,
  };

  return { success: true, data: session };
}
