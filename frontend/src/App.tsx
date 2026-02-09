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
  const role = auth.user?.role;
  return (
    <div className="layout">
      <aside>
        <div className="brand">
          <span className="brand-title">OEDIV</span>
          <span className="brand-subtitle">ExpenseFlow</span>
        </div>
        <h2>ExpenseFlow</h2>
        <nav>
          <Link to="/dashboard">Dashboard</Link>
          {(role === 'EMPLOYEE' || role === 'APPROVER' || role === 'SYSTEM_ADMIN') && (
            <Link to="/my-requests">My Requests</Link>
          )}
          {(role === 'APPROVER' || role === 'SYSTEM_ADMIN') && (
            <Link to="/approval-queue">Approval Queue</Link>
          )}
          {(role === 'FINANCE_ADMIN' || role === 'SYSTEM_ADMIN') && (
            <Link to="/finance-queue">Finance Queue</Link>
          )}
          {(role === 'SYSTEM_ADMIN' || role === 'APPROVER' || role === 'FINANCE_ADMIN') && (
            <Link to="/audit">Audit Verification</Link>
          )}
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
          <h3>Welcome to OEDIV ExpenseFlow</h3>
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

function RequestsTable({
  items,
  actions
}: {
  items: any[];
  actions?: (item: any) => React.ReactNode;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Request #</th>
          <th>Status</th>
          <th>Invoice #</th>
          <th>Invoice Date</th>
          <th>Supplier</th>
          <th>Category</th>
          <th>Total</th>
          {actions && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>
              <Link to={`/requests/${item.id}`}>{item.requestNumber}</Link>
            </td>
            <td>
              <StatusBadge status={item.status} />
            </td>
            <td>{item.invoiceNumber || '-'}</td>
            <td>{formatDate(item.invoiceDate)}</td>
            <td>{item.supplier || '-'}</td>
            <td>{item.category?.name}</td>
            <td>
              {item.currency} {item.totalAmount}
            </td>
            {actions && <td>{actions(item)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const HISTORY_STATUSES = new Set(['PAID', 'REJECTED', 'RETURNED', 'APPROVED']);

function statusClass(status?: string) {
  switch (status) {
    case 'REJECTED':
      return 'status-red';
    case 'UNDER_REVIEW':
      return 'status-yellow';
    case 'PAID':
      return 'status-green';
    default:
      return 'status-default';
  }
}

function formatStatus(status?: string) {
  if (!status) return '-';
  return status.replace(/_/g, ' ');
}

function StatusBadge({ status }: { status?: string }) {
  return <span className={`status-pill ${statusClass(status)}`}>{formatStatus(status)}</span>;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function monthKey(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getLatestAction(request: any, types: string[], actorId?: string) {
  const actions = (request.actions || []).filter(
    (action: any) =>
      types.includes(action.actionType) && (actorId ? action.actorId === actorId : true)
  );
  actions.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return actions[0];
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

function useAuthedMutation(authToken: string) {
  return useMemo(() => {
    return async (path: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${apiBase}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
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
  const mutate = useAuthedMutation(auth.token);
  const [requests, setRequests] = useState<any[]>([]);
  const [historyMonth, setHistoryMonth] = useState('all');
  const [categories, setCategories] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [formState, setFormState] = useState({
    categoryId: '',
    reason: '',
    currency: 'USD',
    totalAmount: '',
    invoiceNumber: '',
    invoiceDate: '',
    supplier: ''
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!auth.token) return;
    fetcher('/requests').then(setRequests).catch(() => setRequests([]));
  }, [auth.token, fetcher]);

  useEffect(() => {
    if (!auth.token) return;
    fetcher('/categories').then(setCategories).catch(() => setCategories([]));
  }, [auth.token, fetcher]);

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!formState.categoryId || !formState.reason || !formState.totalAmount) {
      setFormError('Please complete all required fields.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${apiBase}/requests`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          categoryId: formState.categoryId,
          reason: formState.reason,
          currency: formState.currency,
          totalAmount: Number(formState.totalAmount),
          invoiceNumber: formState.invoiceNumber || undefined,
          invoiceDate: formState.invoiceDate || undefined,
          supplier: formState.supplier || undefined
        })
      });
      if (!response.ok) {
        throw new Error('Failed to create request');
      }
      const created = await response.json();
      setRequests((prev) => [created, ...prev]);
      setShowCreate(false);
      setFormState({
        categoryId: '',
        reason: '',
        currency: 'USD',
        totalAmount: '',
        invoiceNumber: '',
        invoiceDate: '',
        supplier: ''
      });
    } catch (error) {
      setFormError('Unable to create request. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const refreshRequests = async () => {
    if (!auth.token) return;
    fetcher('/requests').then(setRequests).catch(() => setRequests([]));
  };

  const onSubmitRequest = async (id: string) => {
    await mutate(`/requests/${id}/submit`);
    await refreshRequests();
  };

  const onWithdrawRequest = async (id: string) => {
    await mutate(`/requests/${id}/withdraw`);
    await refreshRequests();
  };

  if (auth.user?.role === 'FINANCE_ADMIN') {
    return (
      <div>
        <h1>My Requests</h1>
        <p className="error">Finance users do not have access to personal requests.</p>
      </div>
    );
  }

  const openRequests = requests.filter((item) => !HISTORY_STATUSES.has(item.status));
  const historyRequests = requests.filter((item) => HISTORY_STATUSES.has(item.status));
  const historyMonths = Array.from(
    new Set(historyRequests.map((item) => monthKey(item.submittedAt)).filter(Boolean))
  ).sort()
    .reverse();
  const filteredHistory =
    historyMonth === 'all'
      ? historyRequests
      : historyRequests.filter((item) => monthKey(item.submittedAt) === historyMonth);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My Requests</h1>
          <p className="muted">Manage your drafts and submitted expenses.</p>
        </div>
        <button onClick={() => setShowCreate((prev) => !prev)}>
          {showCreate ? 'Close' : 'Create Request'}
        </button>
      </div>
      {showCreate && (
        <div className="card">
          <h3>Create a new request</h3>
          <form onSubmit={onCreate} className="form-grid">
            <label>
              Category
              <select
                value={formState.categoryId}
                onChange={(event) => setFormState({ ...formState, categoryId: event.target.value })}
                required
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <input
                value={formState.reason}
                onChange={(event) => setFormState({ ...formState, reason: event.target.value })}
                required
              />
            </label>
            <label>
              Currency
              <input
                value={formState.currency}
                onChange={(event) => setFormState({ ...formState, currency: event.target.value })}
                required
              />
            </label>
            <label>
              Total amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={formState.totalAmount}
                onChange={(event) => setFormState({ ...formState, totalAmount: event.target.value })}
                required
              />
            </label>
            <label>
              Invoice number
              <input
                value={formState.invoiceNumber}
                onChange={(event) => setFormState({ ...formState, invoiceNumber: event.target.value })}
                required
              />
            </label>
            <label>
              Invoice date
              <input
                type="date"
                value={formState.invoiceDate}
                onChange={(event) => setFormState({ ...formState, invoiceDate: event.target.value })}
                required
              />
            </label>
            <label>
              Supplier
              <input
                value={formState.supplier}
                onChange={(event) => setFormState({ ...formState, supplier: event.target.value })}
                required
              />
            </label>
            {formError && <p className="error">{formError}</p>}
            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create Draft'}
              </button>
            </div>
          </form>
        </div>
      )}
      <RequestsTable
        items={openRequests}
        actions={(item) => (
          <div className="table-actions">
            {item.status === 'DRAFT' || item.status === 'RETURNED' ? (
              <button onClick={() => onSubmitRequest(item.id)}>Submit</button>
            ) : null}
            {item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW' ? (
              <button onClick={() => onWithdrawRequest(item.id)}>Withdraw</button>
            ) : null}
          </div>
        )}
      />
      <div className="page-header">
        <div>
          <h2>History</h2>
          <p className="muted">Submitted requests and outcomes by month.</p>
        </div>
        <div>
          <select value={historyMonth} onChange={(event) => setHistoryMonth(event.target.value)}>
            <option value="all">All months</option>
            {historyMonths.map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Request #</th>
            <th>Status</th>
            <th>Submitted At</th>
            <th>Comment</th>
            <th>Invoice #</th>
            <th>Invoice Date</th>
            <th>Supplier</th>
            <th>Category</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {filteredHistory.map((item) => {
            const decision = getLatestAction(item, ['APPROVE', 'REJECT', 'RETURN']);
            return (
              <tr key={item.id}>
                <td>
                  <Link to={`/requests/${item.id}`}>{item.requestNumber}</Link>
                </td>
                <td>
                  <StatusBadge status={item.status} />
                </td>
                <td>{formatDate(item.submittedAt)}</td>
                <td>{decision?.comment || '-'}</td>
                <td>{item.invoiceNumber || '-'}</td>
                <td>{formatDate(item.invoiceDate)}</td>
                <td>{item.supplier || '-'}</td>
                <td>{item.category?.name}</td>
                <td>
                  {item.currency} {item.totalAmount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalQueue() {
  const auth = useAuth();
  const fetcher = useAuthedFetch(auth.token);
  const mutate = useAuthedMutation(auth.token);
  const [requests, setRequests] = useState<any[]>([]);
  const [historyMonth, setHistoryMonth] = useState('all');
  const isApprover = auth.user?.role === 'APPROVER' || auth.user?.role === 'SYSTEM_ADMIN';

  useEffect(() => {
    if (!auth.token) return;
    fetcher('/requests').then(setRequests)
      .catch(() => setRequests([]));
  }, [auth.token, fetcher]);

  const refresh = async () => {
    if (!auth.token) return;
    fetcher('/requests').then(setRequests)
      .catch(() => setRequests([]));
  };

  const onApprove = async (id: string) => {
    const comment = window.prompt('Approval reason?');
    if (!comment) return;
    await mutate(`/requests/${id}/approve`, { comment });
    await refresh();
  };

  const onReject = async (id: string) => {
    const comment = window.prompt('Rejection reason?');
    if (!comment) return;
    await mutate(`/requests/${id}/reject`, { comment });
    await refresh();
  };

  const openRequests = requests.filter((item) => ['UNDER_REVIEW', 'SUBMITTED'].includes(item.status));
  const historyItems = requests.filter((item) => {
    if (!HISTORY_STATUSES.has(item.status)) return false;
    const action = getLatestAction(item, ['APPROVE', 'REJECT', 'RETURN'], auth.user?.sub);
    return Boolean(action);
  });
  const historyMonths = Array.from(
    new Set(historyItems.map((item) => monthKey(item.submittedAt)).filter(Boolean))
  ).sort()
    .reverse();
  const filteredHistory =
    historyMonth === 'all'
      ? historyItems
      : historyItems.filter((item) => monthKey(item.submittedAt) === historyMonth);

  return (
    <div>
      <h1>Approval Queue</h1>
      {!isApprover ? (
        <p className="error">You must be logged in as an approver to approve requests.</p>
      ) : (
        <>
      <table>
        <thead>
          <tr>
            <th>Request #</th>
            <th>Status</th>
            <th>Submitted By</th>
            <th>Submitted At</th>
            <th>Invoice #</th>
            <th>Invoice Date</th>
            <th>Supplier</th>
            <th>Category</th>
            <th>Total</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {openRequests.map((item) => (
            <tr key={item.id}>
              <td>
                <Link to={`/requests/${item.id}`}>{item.requestNumber}</Link>
              </td>
              <td>
                <StatusBadge status={item.status} />
              </td>
              <td>{item.employee?.fullName || item.employee?.email}</td>
              <td>{formatDate(item.submittedAt)}</td>
              <td>{item.invoiceNumber || '-'}</td>
              <td>{formatDate(item.invoiceDate)}</td>
              <td>{item.supplier || '-'}</td>
              <td>{item.category?.name}</td>
              <td>
                {item.currency} {item.totalAmount}
              </td>
              <td>
                <div className="table-actions">
                  <button onClick={() => onApprove(item.id)}>Approve</button>
                  <button onClick={() => onReject(item.id)}>Disapprove</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="page-header">
        <div>
          <h2>History</h2>
          <p className="muted">Requests you have decided on, grouped by month.</p>
        </div>
        <div>
          <select value={historyMonth} onChange={(event) => setHistoryMonth(event.target.value)}>
            <option value="all">All months</option>
            {historyMonths.map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Request #</th>
            <th>Status</th>
            <th>Submitted By</th>
            <th>Submitted At</th>
            <th>Decision At</th>
            <th>Invoice #</th>
            <th>Invoice Date</th>
            <th>Supplier</th>
            <th>Category</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {filteredHistory.map((item) => {
            const decision = getLatestAction(item, ['APPROVE', 'REJECT', 'RETURN'], auth.user?.sub);
            return (
              <tr key={item.id}>
                <td>
                  <Link to={`/requests/${item.id}`}>{item.requestNumber}</Link>
                </td>
                <td>
                  <StatusBadge status={item.status} />
                </td>
                <td>{item.employee?.fullName || item.employee?.email}</td>
                <td>{formatDate(item.submittedAt)}</td>
                <td>{formatDate(decision?.createdAt)}</td>
                <td>{item.invoiceNumber || '-'}</td>
                <td>{formatDate(item.invoiceDate)}</td>
                <td>{item.supplier || '-'}</td>
                <td>{item.category?.name}</td>
                <td>
                  {item.currency} {item.totalAmount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
        </>
      )}
    </div>
  );
}

function FinanceQueue() {
  const auth = useAuth();
  const fetcher = useAuthedFetch(auth.token);
  const mutate = useAuthedMutation(auth.token);
  const [requests, setRequests] = useState<any[]>([]);
  const [historyMonth, setHistoryMonth] = useState('all');
  const isFinance = auth.user?.role === 'FINANCE_ADMIN' || auth.user?.role === 'SYSTEM_ADMIN';
  useEffect(() => {
    if (!auth.token) return;
    fetcher('/requests').then(setRequests)
      .catch(() => setRequests([]));
  }, [auth.token, fetcher]);

  const refresh = async () => {
    if (!auth.token) return;
    fetcher('/requests').then(setRequests)
      .catch(() => setRequests([]));
  };

  const onReimburse = async (id: string) => {
    await mutate(`/requests/${id}/finance/paid`);
    await refresh();
  };

  const openRequests = requests.filter((item) => ['APPROVED', 'PAYMENT_PROCESSING'].includes(item.status));
  const historyItems = requests.filter((item) => {
    if (!HISTORY_STATUSES.has(item.status)) return false;
    const action = getLatestAction(item, ['PAID'], auth.user?.sub);
    return Boolean(action);
  });
  const historyMonths = Array.from(
    new Set(historyItems.map((item) => monthKey(item.submittedAt)).filter(Boolean))
  ).sort()
    .reverse();
  const filteredHistory =
    historyMonth === 'all'
      ? historyItems
      : historyItems.filter((item) => monthKey(item.submittedAt) === historyMonth);

  return (
    <div>
      <h1>Finance Queue</h1>
      {!isFinance ? (
        <p className="error">You must be logged in as finance to reimburse requests.</p>
      ) : (
        <>
      <table>
        <thead>
          <tr>
            <th>Request #</th>
            <th>Status</th>
            <th>Submitted By</th>
            <th>Submitted At</th>
            <th>Invoice #</th>
            <th>Invoice Date</th>
            <th>Supplier</th>
            <th>Category</th>
            <th>Total</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {openRequests.map((item) => (
            <tr key={item.id}>
              <td>
                <Link to={`/requests/${item.id}`}>{item.requestNumber}</Link>
              </td>
              <td>
                <StatusBadge status={item.status} />
              </td>
              <td>{item.employee?.fullName || item.employee?.email}</td>
              <td>{formatDate(item.submittedAt)}</td>
              <td>{item.invoiceNumber || '-'}</td>
              <td>{formatDate(item.invoiceDate)}</td>
              <td>{item.supplier || '-'}</td>
              <td>{item.category?.name}</td>
              <td>
                {item.currency} {item.totalAmount}
              </td>
              <td>
                <div className="table-actions">
                  <button onClick={() => onReimburse(item.id)}>Mark Reimbursed</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="page-header">
        <div>
          <h2>History</h2>
          <p className="muted">Reimbursed requests by month.</p>
        </div>
        <div>
          <select value={historyMonth} onChange={(event) => setHistoryMonth(event.target.value)}>
            <option value="all">All months</option>
            {historyMonths.map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Request #</th>
            <th>Status</th>
            <th>Submitted By</th>
            <th>Submitted At</th>
            <th>Reimbursed At</th>
            <th>Invoice #</th>
            <th>Invoice Date</th>
            <th>Supplier</th>
            <th>Category</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {filteredHistory.map((item) => {
            const paid = getLatestAction(item, ['PAID'], auth.user?.sub);
            return (
              <tr key={item.id}>
                <td>
                  <Link to={`/requests/${item.id}`}>{item.requestNumber}</Link>
                </td>
                <td>
                  <StatusBadge status={item.status} />
                </td>
                <td>{item.employee?.fullName || item.employee?.email}</td>
                <td>{formatDate(item.submittedAt)}</td>
                <td>{formatDate(paid?.createdAt)}</td>
                <td>{item.invoiceNumber || '-'}</td>
                <td>{formatDate(item.invoiceDate)}</td>
                <td>{item.supplier || '-'}</td>
                <td>{item.category?.name}</td>
                <td>
                  {item.currency} {item.totalAmount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
        </>
      )}
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
