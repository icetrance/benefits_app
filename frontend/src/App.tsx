import { Navigate, Route, Routes, Link, useNavigate } from 'react-router-dom';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

interface AuthUser {
  sub: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  token: string;
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState<AuthUser | null>(
    localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') as string) : null
  );

  const login = (nextToken: string, nextUser: AuthUser) => {
    localStorage.setItem('token', nextToken);
    localStorage.setItem('user', JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
  };

  const value = useMemo(() => ({ token, user, login, logout }), [token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('Auth context missing');
  }
  return ctx;
}

function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const auth = useAuth();
  return (
    <div className="layout">
      <aside>
        <h2>ExpenseFlow</h2>
        <nav>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/my-requests">My Requests</Link>
          <Link to="/approval-queue">Approval Queue</Link>
          <Link to="/finance-queue">Finance Queue</Link>
          <Link to="/audit">Audit Verification</Link>
        </nav>
        <button
          className="secondary"
          onClick={() => {
            auth.logout();
            navigate('/login');
          }}
        >
          Logout
        </button>
      </aside>
      <main>{children}</main>
    </div>
  );
}

function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const response = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
      setError('Login failed. Check credentials.');
      return;
    }
    const data = await response.json();
    auth.login(data.accessToken, data.user);
    navigate('/dashboard');
  };

  return (
    <div className="card">
      <h1>Login</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Sign in</button>
      </form>
    </div>
  );
}

function Dashboard() {
  const auth = useAuth();
  return (
    <div>
      <h1>Dashboard</h1>
      <div className="grid">
        <div className="card">
          <h3>Welcome</h3>
          <p>{auth.user?.email}</p>
          <p>Role: {auth.user?.role}</p>
        </div>
        <div className="card">
          <h3>Next Steps</h3>
          <ul>
            <li>Create a request draft.</li>
            <li>Attach receipts and submit.</li>
            <li>Track approval status in real time.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function RequestsTable({ items }: { items: any[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Request #</th>
          <th>Status</th>
          <th>Category</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>
              <Link to={`/requests/${item.id}`}>{item.requestNumber}</Link>
            </td>
            <td>{item.status}</td>
            <td>{item.category?.name}</td>
            <td>
              {item.currency} {item.totalAmount}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function useAuthedFetch(authToken: string) {
  return useMemo(() => {
    return async (path: string) => {
      const response = await fetch(`${apiBase}${path}`, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      if (!response.ok) {
        throw new Error('Request failed');
      }
      return response.json();
    };
  }, [authToken]);
}

function MyRequests() {
  const auth = useAuth();
  const fetcher = useAuthedFetch(auth.token);
  const [requests, setRequests] = useState<any[]>([]);
  useEffect(() => {
    if (!auth.token) return;
    fetcher('/requests').then(setRequests).catch(() => setRequests([]));
  }, [auth.token, fetcher]);

  return (
    <div>
      <h1>My Requests</h1>
      <RequestsTable items={requests} />
    </div>
  );
}

function ApprovalQueue() {
  const auth = useAuth();
  const fetcher = useAuthedFetch(auth.token);
  const [requests, setRequests] = useState<any[]>([]);
  useEffect(() => {
    if (!auth.token) return;
    fetcher('/requests')
      .then((data) => data.filter((item: any) => item.status === 'UNDER_REVIEW'))
      .then(setRequests)
      .catch(() => setRequests([]));
  }, [auth.token, fetcher]);
  return (
    <div>
      <h1>Approval Queue</h1>
      <RequestsTable items={requests} />
    </div>
  );
}

function FinanceQueue() {
  const auth = useAuth();
  const fetcher = useAuthedFetch(auth.token);
  const [requests, setRequests] = useState<any[]>([]);
  useEffect(() => {
    if (!auth.token) return;
    fetcher('/requests')
      .then((data) => data.filter((item: any) => ['APPROVED', 'PAYMENT_PROCESSING'].includes(item.status)))
      .then(setRequests)
      .catch(() => setRequests([]));
  }, [auth.token, fetcher]);
  return (
    <div>
      <h1>Finance Queue</h1>
      <RequestsTable items={requests} />
    </div>
  );
}

function RequestDetail() {
  const auth = useAuth();
  const fetcher = useAuthedFetch(auth.token);
  const [request, setRequest] = useState<any | null>(null);
  const id = window.location.pathname.split('/').pop();

  useEffect(() => {
    if (!auth.token || !id) return;
    fetcher(`/requests/${id}`).then(setRequest).catch(() => setRequest(null));
  }, [auth.token, id, fetcher]);

  if (!request) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <h1>{request.requestNumber}</h1>
      <div className="card">
        <p>Status: {request.status}</p>
        <p>Reason: {request.reason}</p>
        <p>
          Total: {request.currency} {request.totalAmount}
        </p>
      </div>
      <h3>Approval Timeline</h3>
      <ul className="timeline">
        {request.actions?.map((action: any) => (
          <li key={action.id}>
            <strong>{action.actionType}</strong> → {action.toStatus}
            <span>{new Date(action.createdAt).toLocaleString()}</span>
            {action.comment && <p>{action.comment}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AuditVerification() {
  const auth = useAuth();
  const fetcher = useAuthedFetch(auth.token);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState('');

  const onVerify = () => {
    fetcher('/audit/verify')
      .then(setResult)
      .catch(() => setError('Unable to verify audit chain.'));
  };

  return (
    <div>
      <h1>Audit Verification</h1>
      <button onClick={onVerify}>Verify Integrity</button>
      {result && (
        <div className="card">
          <p>Status: {result.valid ? 'Valid' : 'Invalid'}</p>
          {result.count && <p>Entries: {result.count}</p>}
          {result.failedAt && <p>Failed at: {result.failedAt}</p>}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (!auth.token) {
    return <Navigate to="/login" replace />;
  }
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-requests"
          element={
            <ProtectedRoute>
              <MyRequests />
            </ProtectedRoute>
          }
        />
        <Route
          path="/approval-queue"
          element={
            <ProtectedRoute>
              <ApprovalQueue />
            </ProtectedRoute>
          }
        />
        <Route
          path="/finance-queue"
          element={
            <ProtectedRoute>
              <FinanceQueue />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requests/:id"
          element={
            <ProtectedRoute>
              <RequestDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <ProtectedRoute>
              <AuditVerification />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}
