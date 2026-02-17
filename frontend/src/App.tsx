import { Navigate, Route, Routes, Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

/* ── Types ─── */
interface AuthUser {
  sub: string;
  email: string;
  role: string;
  fullName: string;
  managerId: string | null;
}
interface AuthContextValue {
  token: string;
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

/* ── Auth Context ─── */
const AuthContext = createContext<AuthContextValue | null>(null);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState<AuthUser | null>(
    localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') as string) : null
  );
  const login = (t: string, u: AuthUser) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
    setToken(t);
    setUser(u);
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
  if (!ctx) throw new Error('Auth context missing');
  return ctx;
}

/* ── API Helpers ─── */
function extractErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;
  const message = (payload as { message?: unknown }).message;
  if (Array.isArray(message)) {
    const text = message.filter(item => typeof item === 'string').join(' ');
    return text || fallback;
  }
  if (typeof message === 'string') return message;
  return fallback;
}

function useApi(authToken: string) {
  return useMemo(() => ({
    get: async (path: string) => {
      const r = await fetch(`${apiBase}${path}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!r.ok) {
        let payload: unknown = null;
        try { payload = await r.json(); } catch { payload = null; }
        throw new Error(extractErrorMessage(payload, `GET ${path} failed`));
      }
      return r.json();
    },
    post: async (path: string, body?: Record<string, unknown>) => {
      const r = await fetch(`${apiBase}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      if (!r.ok) {
        let payload: unknown = null;
        try { payload = await r.json(); } catch { payload = null; }
        throw new Error(extractErrorMessage(payload, `POST ${path} failed`));
      }
      return r.json();
    },
    patch: async (path: string, body?: Record<string, unknown>) => {
      const r = await fetch(`${apiBase}${path}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      if (!r.ok) {
        let payload: unknown = null;
        try { payload = await r.json(); } catch { payload = null; }
        throw new Error(extractErrorMessage(payload, `PATCH ${path} failed`));
      }
      return r.json();
    },
    del: async (path: string) => {
      const r = await fetch(`${apiBase}${path}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (!r.ok) {
        let payload: unknown = null;
        try { payload = await r.json(); } catch { payload = null; }
        throw new Error(extractErrorMessage(payload, `DELETE ${path} failed`));
      }
      return r.json();
    }
  }), [authToken]);
}

/* ── Utilities ─── */
const HISTORY_STATUSES = new Set(['PAID', 'REJECTED', 'RETURNED', 'APPROVED']);
const CURRENCIES = ['EUR', 'LEI', 'USD'];

function statusClass(s?: string) {
  switch (s) {
    case 'REJECTED': return 'status-red';
    case 'UNDER_REVIEW': case 'SUBMITTED': return 'status-yellow';
    case 'PAID': return 'status-green';
    case 'APPROVED': case 'PAYMENT_PROCESSING': return 'status-blue';
    default: return 'status-default';
  }
}
function formatStatus(s?: string) {
  return s ? s.replace(/_/g, ' ') : '-';
}
function StatusBadge({ status }: { status?: string }) {
  return <span className={`status-pill ${statusClass(status)}`}>{formatStatus(status)}</span>;
}
function ExpenseTypeBadge({ type }: { type?: string }) {
  const cls = type === 'TRAVEL' ? 'type-travel' : type === 'PROTOCOL' ? 'type-protocol' : 'type-benefit';
  return <span className={`expense-type-tag ${cls}`}>{type || 'BENEFIT'}</span>;
}
function RoleBadge({ role }: { role: string }) {
  const cls = role === 'APPROVER' ? 'role-approver' : role === 'FINANCE_ADMIN' ? 'role-finance' : role === 'SYSTEM_ADMIN' ? 'role-admin' : 'role-employee';
  return <span className={`user-role-badge ${cls}`}>{role.replace(/_/g, ' ')}</span>;
}
function formatDate(v?: string | null) {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
}
function monthKey(v?: string | null) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function getLatestAction(req: any, types: string[], actorId?: string) {
  const acts = (req.actions || []).filter(
    (a: any) => types.includes(a.actionType) && (actorId ? a.actorId === actorId : true)
  );
  acts.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return acts[0];
}

/* ── Budget Card ─── */
function BudgetCard({ budget }: { budget: any }) {
  const pct = budget.allocated > 0 ? (budget.spent / budget.allocated) * 100 : 0;
  const remaining = budget.allocated - budget.spent;
  const level = pct > 80 ? 'high' : pct > 50 ? 'medium' : 'low';
  return (
    <div className="budget-card">
      <h4>{budget.category?.name || 'Unknown'}</h4>
      <div className="budget-bar">
        <div className={`budget-bar-fill ${level}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="budget-amounts">
        <span className="spent">€{budget.spent.toFixed(0)} spent</span>
        <span>€{remaining.toFixed(0)} remaining of €{budget.allocated.toFixed(0)}</span>
      </div>
    </div>
  );
}

/* ── Layout ─── */
function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const role = auth.user?.role;
  const isAdmin = role === 'SYSTEM_ADMIN';

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('ef-theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ef-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const isActive = (path: string) => location.pathname === path ? 'active' : '';

  return (
    <div className="layout">
      <aside>
        <div className="brand">
          <span className="brand-title">OEDIV</span>
          <span className="brand-subtitle">ExpenseFlow</span>
        </div>
        <nav>
          <Link to="/dashboard" className={isActive('/dashboard')}>Dashboard</Link>
          {(role === 'EMPLOYEE' || role === 'APPROVER' || isAdmin) && (
            <Link to="/my-requests" className={isActive('/my-requests')}>My Requests</Link>
          )}
          {(role === 'APPROVER' || isAdmin) && (
            <Link to="/approval-queue" className={isActive('/approval-queue')}>Approval Queue</Link>
          )}
          {(role === 'FINANCE_ADMIN' || isAdmin) && (
            <Link to="/finance-queue" className={isActive('/finance-queue')}>Finance Queue</Link>
          )}
          {(isAdmin || role === 'APPROVER' || role === 'FINANCE_ADMIN') && (
            <Link to="/audit" className={isActive('/audit')}>Audit Trail</Link>
          )}
          {isAdmin && (
            <>
              <div className="nav-divider" />
              <div className="nav-section-label">Administration</div>
              <Link to="/admin/users" className={isActive('/admin/users')}>User Management</Link>
            </>
          )}
        </nav>
        <div className="user-info">
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'light' ? '🌙 Dark mode' : '☀️ Light mode'}
          </button>
          <div className="user-name">{auth.user?.fullName || auth.user?.email}</div>
          <div className="user-role">{role?.replace(/_/g, ' ')}</div>
          <button
            className="secondary sm"
            style={{ marginTop: '0.75rem', width: '100%' }}
            onClick={() => { auth.logout(); navigate('/login'); }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}

/* ── Login Page ─── */
function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const r = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!r.ok) { setError('Login failed. Check credentials.'); return; }
    const data = await r.json();
    auth.login(data.accessToken, data.user);
    navigate('/dashboard');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-brand">
          <p>OEDIV</p>
          <h1>ExpenseFlow</h1>
        </div>
        <form onSubmit={onSubmit}>
          <label>Email <input value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label>Password <input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
          {error && <p className="error">{error}</p>}
          <button type="submit">Sign in</button>
        </form>
      </div>
    </div>
  );
}

/* ── Dashboard ─── */
function Dashboard() {
  const auth = useAuth();
  const api = useApi(auth.token);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, paid: 0 });

  useEffect(() => {
    if (!auth.token) return;
    api.get('/budget').then(setBudgets).catch(() => { });
    api.get('/requests').then((reqs: any[]) => {
      setStats({
        total: reqs.length,
        pending: reqs.filter(r => ['SUBMITTED', 'UNDER_REVIEW'].includes(r.status)).length,
        approved: reqs.filter(r => r.status === 'APPROVED').length,
        paid: reqs.filter(r => r.status === 'PAID').length
      });
    }).catch(() => { });
  }, [auth.token]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Welcome back, {auth.user?.fullName || auth.user?.email}</p>
        </div>
      </div>
      <div className="grid">
        <div className="card"><h3>Total Requests</h3><div className="stat-value">{stats.total}</div></div>
        <div className="card"><h3>Pending Review</h3><div className="stat-value">{stats.pending}</div></div>
        <div className="card"><h3>Approved</h3><div className="stat-value">{stats.approved}</div></div>
        <div className="card"><h3>Paid</h3><div className="stat-value">{stats.paid}</div></div>
      </div>
      {budgets.length > 0 && (
        <>
          <h2>My Budget Allocations</h2>
          <p className="muted" style={{ marginBottom: '1rem' }}>Annual benefit budgets for {new Date().getFullYear()}</p>
          <div className="grid">
            {budgets.map(b => <BudgetCard key={b.id} budget={b} />)}
          </div>
        </>
      )}
    </div>
  );
}

/* ── My Requests ─── */
function MyRequests() {
  const auth = useAuth();
  const api = useApi(auth.token);
  const [requests, setRequests] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [historyMonth, setHistoryMonth] = useState('all');
  const [form, setForm] = useState({ categoryId: '', reason: '', currency: 'EUR', totalAmount: '', invoiceNumber: '', invoiceDate: '', supplier: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expenseType, setExpenseType] = useState('BENEFIT');

  const load = useCallback(() => {
    api.get('/requests').then(setRequests).catch(() => setRequests([]));
    api.get(`/categories?type=${expenseType}`).then(setCategories).catch(() => setCategories([]));
  }, [auth.token, expenseType]);

  useEffect(() => { if (auth.token) load(); }, [load, auth.token]);

  if (auth.user?.role === 'FINANCE_ADMIN') {
    return <div><h1>My Requests</h1><p className="muted">Finance users manage the Finance Queue.</p></div>;
  }

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.categoryId || !form.reason || !form.totalAmount) { setFormError('Complete all required fields.'); return; }
    setSaving(true);
    try {
      await api.post('/requests', {
        categoryId: form.categoryId, reason: form.reason, currency: form.currency,
        totalAmount: Number(form.totalAmount), invoiceNumber: form.invoiceNumber || undefined,
        invoiceDate: form.invoiceDate || undefined, supplier: form.supplier || undefined
      });
      setShowCreate(false);
      setForm({ categoryId: '', reason: '', currency: 'EUR', totalAmount: '', invoiceNumber: '', invoiceDate: '', supplier: '' });
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create request.';
      setFormError(message);
    }
    finally { setSaving(false); }
  };


  const onCancelDraft = async (id: string) => {
    const confirmed = window.confirm('Cancel this draft request? This action cannot be undone.');
    if (!confirmed) return;

    try {
      await api.del(`/requests/${id}`);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to cancel draft request.';
      window.alert(message);
    }
  };

  const openReqs = requests.filter(i => !HISTORY_STATUSES.has(i.status));
  const historyReqs = requests.filter(i => HISTORY_STATUSES.has(i.status));
  const historyMonths = [...new Set(historyReqs.map(i => monthKey(i.submittedAt)).filter(Boolean))].sort().reverse();
  const filteredHistory = historyMonth === 'all' ? historyReqs : historyReqs.filter(i => monthKey(i.submittedAt) === historyMonth);

  return (
    <div>
      <div className="page-header">
        <div><h1>My Requests</h1><p className="muted">Manage your expense requests</p></div>
        <button onClick={() => setShowCreate(p => !p)}>{showCreate ? 'Cancel' : '+ New Request'}</button>
      </div>
      {showCreate && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3>New Request</h3>
          <div className="tabs">
            {['BENEFIT', 'TRAVEL', 'PROTOCOL'].map(t => (
              <button key={t} className={`tab-btn ${expenseType === t ? 'active' : ''}`} onClick={() => { setExpenseType(t); setForm({ ...form, categoryId: '' }); }}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <form onSubmit={onCreate} className="form-grid">
            <label>Category
              <select value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })} required>
                <option value="">Select</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>Amount <input type="number" min="0" step="0.01" value={form.totalAmount} onChange={e => setForm({ ...form, totalAmount: e.target.value })} required /></label>
            <label>Currency <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} required>{CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}</select></label>
            <label>Invoice # <input value={form.invoiceNumber} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} required /></label>
            <label>Invoice date <input type="date" value={form.invoiceDate} onChange={e => setForm({ ...form, invoiceDate: e.target.value })} required /></label>
            <label>Supplier <input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} required /></label>
            <label style={{ gridColumn: '1 / -1' }}>Reason <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required /></label>
            {formError && <p className="error">{formError}</p>}
            <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Draft'}</button></div>
          </form>
        </div>
      )}
      {openReqs.length === 0 ? <p className="empty-state">No open requests</p> : (
        <table>
          <thead><tr><th>Request #</th><th>Type</th><th>Status</th><th>Invoice #</th><th>Supplier</th><th>Category</th><th>Total</th><th>Actions</th></tr></thead>
          <tbody>
            {openReqs.map(i => (
              <tr key={i.id}>
                <td><Link to={`/requests/${i.id}`}>{i.requestNumber}</Link></td>
                <td><ExpenseTypeBadge type={i.expenseType} /></td>
                <td><StatusBadge status={i.status} /></td>
                <td>{i.invoiceNumber || '-'}</td>
                <td>{i.supplier || '-'}</td>
                <td>{i.category?.name}</td>
                <td>{i.currency} {i.totalAmount}</td>
                <td>
                  <div className="table-actions">
                    {(i.status === 'DRAFT' || i.status === 'RETURNED') && <button className="sm" onClick={() => api.post(`/requests/${i.id}/submit`).then(load)}>Submit</button>}
                    {i.status === 'DRAFT' && <button className="sm secondary" onClick={() => onCancelDraft(i.id)}>Cancel</button>}
                    {(i.status === 'SUBMITTED' || i.status === 'UNDER_REVIEW') && <button className="sm secondary" onClick={() => api.post(`/requests/${i.id}/withdraw`).then(load)}>Withdraw</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="section-gap" />
      <div className="page-header">
        <div><h2>History</h2><p className="muted">Past requests by month</p></div>
        <select value={historyMonth} onChange={e => setHistoryMonth(e.target.value)}>
          <option value="all">All months</option>
          {historyMonths.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {filteredHistory.length === 0 ? <p className="empty-state">No history yet</p> : (
        <table>
          <thead><tr><th>Request #</th><th>Type</th><th>Status</th><th>Submitted</th><th>Comment</th><th>Category</th><th>Total</th></tr></thead>
          <tbody>
            {filteredHistory.map(i => {
              const dec = getLatestAction(i, ['APPROVE', 'REJECT', 'RETURN']);
              return (
                <tr key={i.id}>
                  <td><Link to={`/requests/${i.id}`}>{i.requestNumber}</Link></td>
                  <td><ExpenseTypeBadge type={i.expenseType} /></td>
                  <td><StatusBadge status={i.status} /></td>
                  <td>{formatDate(i.submittedAt)}</td>
                  <td>{dec?.comment || '-'}</td>
                  <td>{i.category?.name}</td>
                  <td>{i.currency} {i.totalAmount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── Approval Queue ─── */
function ApprovalQueue() {
  const auth = useAuth();
  const api = useApi(auth.token);
  const [requests, setRequests] = useState<any[]>([]);
  const [historyMonth, setHistoryMonth] = useState('all');

  const load = useCallback(() => {
    api.get('/requests').then(setRequests).catch(() => setRequests([]));
  }, [auth.token]);

  useEffect(() => { if (auth.token) load(); }, [load, auth.token]);

  const onApprove = async (id: string) => { const c = window.prompt('Approval reason?'); if (!c) return; await api.post(`/requests/${id}/approve`, { comment: c }); load(); };
  const onReject = async (id: string) => { const c = window.prompt('Rejection reason?'); if (!c) return; await api.post(`/requests/${id}/reject`, { comment: c }); load(); };
  const onReturn = async (id: string) => { const c = window.prompt('Return reason?'); if (!c) return; await api.post(`/requests/${id}/return`, { comment: c }); load(); };

  const open = requests.filter(i => ['UNDER_REVIEW', 'SUBMITTED'].includes(i.status));
  const history = requests.filter(i => HISTORY_STATUSES.has(i.status) && getLatestAction(i, ['APPROVE', 'REJECT', 'RETURN'], auth.user?.sub));
  const months = [...new Set(history.map(i => monthKey(i.submittedAt)).filter(Boolean))].sort().reverse();
  const filtered = historyMonth === 'all' ? history : history.filter(i => monthKey(i.submittedAt) === historyMonth);

  return (
    <div>
      <div className="page-header"><div><h1>Approval Queue</h1><p className="muted">Requests from your team awaiting review</p></div></div>
      {open.length === 0 ? <p className="empty-state">No requests pending approval</p> : (
        <table>
          <thead><tr><th>Request #</th><th>Type</th><th>Status</th><th>Submitted By</th><th>Submitted</th><th>Invoice #</th><th>Supplier</th><th>Category</th><th>Total</th><th>Actions</th></tr></thead>
          <tbody>
            {open.map(i => (
              <tr key={i.id}>
                <td><Link to={`/requests/${i.id}`}>{i.requestNumber}</Link></td>
                <td><ExpenseTypeBadge type={i.expenseType} /></td>
                <td><StatusBadge status={i.status} /></td>
                <td>{i.employee?.fullName || i.employee?.email}</td>
                <td>{formatDate(i.submittedAt)}</td>
                <td>{i.invoiceNumber || '-'}</td>
                <td>{i.supplier || '-'}</td>
                <td>{i.category?.name}</td>
                <td>{i.currency} {i.totalAmount}</td>
                <td>
                  <div className="table-actions">
                    <button className="sm success" onClick={() => onApprove(i.id)}>Approve</button>
                    <button className="sm danger" onClick={() => onReject(i.id)}>Reject</button>
                    <button className="sm secondary" onClick={() => onReturn(i.id)}>Return</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="section-gap" />
      <div className="page-header">
        <div><h2>Decision History</h2><p className="muted">Requests you've acted on</p></div>
        <select value={historyMonth} onChange={e => setHistoryMonth(e.target.value)}>
          <option value="all">All months</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? <p className="empty-state">No decisions yet</p> : (
        <table>
          <thead><tr><th>Request #</th><th>Type</th><th>Status</th><th>Submitted By</th><th>Submitted</th><th>Decision Date</th><th>Category</th><th>Total</th></tr></thead>
          <tbody>
            {filtered.map(i => {
              const dec = getLatestAction(i, ['APPROVE', 'REJECT', 'RETURN'], auth.user?.sub);
              return (
                <tr key={i.id}>
                  <td><Link to={`/requests/${i.id}`}>{i.requestNumber}</Link></td>
                  <td><ExpenseTypeBadge type={i.expenseType} /></td>
                  <td><StatusBadge status={i.status} /></td>
                  <td>{i.employee?.fullName || i.employee?.email}</td>
                  <td>{formatDate(i.submittedAt)}</td>
                  <td>{formatDate(dec?.createdAt)}</td>
                  <td>{i.category?.name}</td>
                  <td>{i.currency} {i.totalAmount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── Finance Queue ─── */
function FinanceQueue() {
  const auth = useAuth();
  const api = useApi(auth.token);
  const [requests, setRequests] = useState<any[]>([]);
  const [historyMonth, setHistoryMonth] = useState('all');

  const load = useCallback(() => {
    api.get('/requests').then(setRequests).catch(() => setRequests([]));
  }, [auth.token]);

  useEffect(() => { if (auth.token) load(); }, [load, auth.token]);

  const onReimburse = async (id: string) => { await api.post(`/requests/${id}/finance/paid`); load(); };

  const open = requests.filter(i => ['APPROVED', 'PAYMENT_PROCESSING'].includes(i.status));
  const history = requests.filter(i => i.status === 'PAID');
  const months = [...new Set(history.map(i => monthKey(i.submittedAt)).filter(Boolean))].sort().reverse();
  const filtered = historyMonth === 'all' ? history : history.filter(i => monthKey(i.submittedAt) === historyMonth);

  // Get approver name from actions
  const getApprover = (item: any) => {
    const action = getLatestAction(item, ['APPROVE']);
    return action?.actor?.fullName || action?.actor?.email || '-';
  };

  return (
    <div>
      <div className="page-header"><div><h1>Finance Queue</h1><p className="muted">Approved requests awaiting reimbursement</p></div></div>
      {open.length === 0 ? <p className="empty-state">No requests awaiting payment</p> : (
        <table>
          <thead><tr><th>Request #</th><th>Type</th><th>Status</th><th>Submitted By</th><th>Approved By</th><th>Invoice #</th><th>Supplier</th><th>Category</th><th>Total</th><th>Actions</th></tr></thead>
          <tbody>
            {open.map(i => (
              <tr key={i.id}>
                <td><Link to={`/requests/${i.id}`}>{i.requestNumber}</Link></td>
                <td><ExpenseTypeBadge type={i.expenseType} /></td>
                <td><StatusBadge status={i.status} /></td>
                <td>{i.employee?.fullName || i.employee?.email}</td>
                <td>{getApprover(i)}</td>
                <td>{i.invoiceNumber || '-'}</td>
                <td>{i.supplier || '-'}</td>
                <td>{i.category?.name}</td>
                <td>{i.currency} {i.totalAmount}</td>
                <td><button className="sm success" onClick={() => onReimburse(i.id)}>Reimburse</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="section-gap" />
      <div className="page-header">
        <div><h2>Reimbursement History</h2><p className="muted">Completed payments</p></div>
        <select value={historyMonth} onChange={e => setHistoryMonth(e.target.value)}>
          <option value="all">All months</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? <p className="empty-state">No reimbursements yet</p> : (
        <table>
          <thead><tr><th>Request #</th><th>Type</th><th>Status</th><th>Submitted By</th><th>Approved By</th><th>Paid Date</th><th>Category</th><th>Total</th></tr></thead>
          <tbody>
            {filtered.map(i => {
              const paid = getLatestAction(i, ['PAID']);
              return (
                <tr key={i.id}>
                  <td><Link to={`/requests/${i.id}`}>{i.requestNumber}</Link></td>
                  <td><ExpenseTypeBadge type={i.expenseType} /></td>
                  <td><StatusBadge status={i.status} /></td>
                  <td>{i.employee?.fullName || i.employee?.email}</td>
                  <td>{getApprover(i)}</td>
                  <td>{formatDate(paid?.createdAt)}</td>
                  <td>{i.category?.name}</td>
                  <td>{i.currency} {i.totalAmount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── Request Detail ─── */
function RequestDetail() {
  const auth = useAuth();
  const api = useApi(auth.token);
  const { id } = useParams();
  const [request, setRequest] = useState<any | null>(null);

  useEffect(() => {
    if (!auth.token || !id) return;
    api.get(`/requests/${id}`).then(setRequest).catch(() => setRequest(null));
  }, [auth.token, id]);

  if (!request) return <p className="empty-state">Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{request.requestNumber}</h1>
          <p className="muted">{request.employee?.fullName} · {request.category?.name}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <ExpenseTypeBadge type={request.expenseType} />
          <StatusBadge status={request.status} />
        </div>
      </div>
      <div className="grid">
        <div className="card"><h3>Amount</h3><div className="stat-value">{request.currency} {request.totalAmount}</div></div>
        <div className="card"><h3>Reason</h3><p>{request.reason}</p></div>
        <div className="card">
          <h3>Invoice Details</h3>
          <p>Number: {request.invoiceNumber || '-'}</p>
          <p>Date: {formatDate(request.invoiceDate)}</p>
          <p>Supplier: {request.supplier || '-'}</p>
        </div>
      </div>
      <h2>Approval Timeline</h2>
      {request.actions?.length ? (
        <ul className="timeline">
          {request.actions.map((a: any) => (
            <li key={a.id}>
              <strong>{a.actionType.replace(/_/g, ' ')}</strong> → {formatStatus(a.toStatus)}
              {a.actor && <span className="actor-name"> by {a.actor.fullName || a.actor.email}</span>}
              <span>{new Date(a.createdAt).toLocaleString()}</span>
              {a.comment && <p>"{a.comment}"</p>}
            </li>
          ))}
        </ul>
      ) : <p className="empty-state">No actions yet</p>}
    </div>
  );
}

/* ── Audit Verification ─── */
function AuditVerification() {
  const auth = useAuth();
  const api = useApi(auth.token);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState('');

  return (
    <div>
      <div className="page-header">
        <div><h1>Audit Trail</h1><p className="muted">Verify tamper-evident audit chain integrity</p></div>
        <button onClick={() => api.get('/audit/verify').then(setResult).catch(() => setError('Verification failed.'))}>Run Verification</button>
      </div>
      {result && (
        <div className="card">
          <h3>Result</h3>
          <p style={{ fontSize: '1.25rem', fontWeight: 600, color: result.valid ? 'var(--success)' : 'var(--danger)' }}>
            {result.valid ? '✓ Chain is valid' : '✗ Chain integrity compromised'}
          </p>
          {result.count && <p className="muted">{result.count} audit entries verified</p>}
          {result.failedAt && <p className="error">Failed at entry: {result.failedAt}</p>}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/* ── Admin: User Management ─── */
function AdminUsers() {
  const auth = useAuth();
  const api = useApi(auth.token);
  const [users, setUsers] = useState<any[]>([]);
  const [benefits, setBenefits] = useState<any[]>([]);
  const [showModal, setShowModal] = useState<'create' | 'edit' | 'password' | null>(null);
  const [editUser, setEditUser] = useState<any>(null);
  const [form, setForm] = useState({ email: '', fullName: '', password: '', role: 'EMPLOYEE', managerId: '', benefitName: '', budgetLimit: '' });
  const [pwForm, setPwForm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersData, benefitsData] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/benefits'),
      ]);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setBenefits(Array.isArray(benefitsData) ? benefitsData : []);
      setError('');
    } catch (err) {
      setUsers([]);
      setBenefits([]);
      setError(err instanceof Error ? err.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { if (auth.token) load(); }, [load, auth.token]);

  const approvers = users.filter(u => u.role === 'APPROVER');

  const openCreate = () => {
    setForm({ email: '', fullName: '', password: '', role: 'EMPLOYEE', managerId: '', benefitName: '', budgetLimit: '' });
    setError('');
    setShowModal('create');
  };
  const openEdit = (u: any) => {
    setEditUser(u);
    setForm({ email: u.email, fullName: u.fullName, password: '', role: u.role, managerId: u.managerId || '', benefitName: '', budgetLimit: '' });
    setError('');
    setShowModal('edit');
  };
  const openPw = (u: any) => { setEditUser(u); setPwForm(''); setError(''); setShowModal('password'); };

  const onCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try {
      await api.post('/admin/users', { email: form.email, fullName: form.fullName, password: form.password, role: form.role, managerId: form.managerId || undefined });
      setShowModal(null); load();
    } catch { setError('Failed to create user.'); }
  };
  const onEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try {
      await api.patch(`/admin/users/${editUser.id}`, { fullName: form.fullName, role: form.role, managerId: form.managerId || null });
      setShowModal(null); load();
    } catch { setError('Failed to update user.'); }
  };
  const onPwSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try {
      await api.post(`/admin/users/${editUser.id}/reset-password`, { password: pwForm });
      setShowModal(null);
    } catch { setError('Failed to reset password.'); }
  };


  const onCreateBenefit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/admin/benefits', { name: form.benefitName, budgetLimit: Number(form.budgetLimit) });
      setForm(prev => ({ ...prev, benefitName: '', budgetLimit: '' }));
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create benefit.';
      setError(message);
    }
  };

  const onDeleteBenefit = async (id: string) => {
    if (!window.confirm('Remove this benefit? Existing paid history remains, but active usage will stop.')) return;
    try {
      await api.del(`/admin/benefits/${id}`);
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove benefit.';
      window.alert(message);
    }
  };

  const onDeactivate = async (id: string) => {
    if (!window.confirm('Deactivate this user?')) return;
    setError('');
    try {
      await api.del(`/admin/users/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate user.');
    }
  };
  const onPermanentDelete = async (id: string) => {
    if (!window.confirm('⚠️ PERMANENTLY DELETE this user and all their data?\n\nThis action cannot be undone.')) return;
    setError('');
    try {
      await api.del(`/admin/users/${id}/permanent`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to permanently delete user.');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div><h1>User Management</h1><p className="muted">{users.length} users</p></div>
        <div className="table-actions">
          <button className="secondary" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
          <button onClick={openCreate}>+ Add User</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Manager</th><th>Status</th><th>Reports</th><th>Actions</th></tr></thead>
        <tbody>
          {!loading && users.length === 0 && (
            <tr>
              <td colSpan={7} className="empty-state" style={{ textAlign: 'center', padding: '1rem' }}>
                No users found.
              </td>
            </tr>
          )}
          {users.map(u => (
            <tr key={u.id}>
              <td style={{ fontWeight: 500, color: 'var(--text)' }}>{u.fullName}</td>
              <td>{u.email}</td>
              <td><RoleBadge role={u.role} /></td>
              <td>{u.manager?.fullName || '-'}</td>
              <td><span className={u.active ? 'active-badge' : 'inactive-badge'}>{u.active ? '● Active' : '○ Inactive'}</span></td>
              <td>{u._count?.reports || 0}</td>
              <td>
                <div className="table-actions">
                  <button className="sm secondary" onClick={() => openEdit(u)}>Edit</button>
                  <button className="sm secondary" onClick={() => openPw(u)}>Password</button>
                  {u.active && <button className="sm danger" onClick={() => onDeactivate(u.id)}>Deactivate</button>}
                  <button className="sm danger" onClick={() => onPermanentDelete(u.id)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>



      <div className="section-gap" />
      <div className="page-header">
        <div><h2>Benefit Catalog</h2><p className="muted">Add or remove benefit categories and annual budget limits</p></div>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <form onSubmit={onCreateBenefit} className="form-grid">
          <label>Benefit name
            <input value={form.benefitName} onChange={e => setForm({ ...form, benefitName: e.target.value })} required />
          </label>
          <label>Budget limit (EUR)
            <input type="number" min="0.01" step="0.01" value={form.budgetLimit} onChange={e => setForm({ ...form, budgetLimit: e.target.value })} required />
          </label>
          <div className="form-actions"><button type="submit">Add Benefit</button></div>
        </form>
      </div>
      <table>
        <thead><tr><th>Benefit</th><th>Annual Budget (EUR)</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {benefits.map(benefit => (
            <tr key={benefit.id}>
              <td>{benefit.name}</td>
              <td>{benefit.defaultBudget}</td>
              <td><span className={benefit.active ? 'active-badge' : 'inactive-badge'}>{benefit.active ? '● Active' : '○ Inactive'}</span></td>
              <td><button className="sm danger" onClick={() => onDeleteBenefit(benefit.id)}>Remove</button></td>
            </tr>
          ))}
          {benefits.length === 0 && (
            <tr><td colSpan={4}><p className="empty-state">No benefits configured</p></td></tr>
          )}
        </tbody>
      </table>


      {showModal === 'create' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Create User</h2>
            <form onSubmit={onCreateSubmit}>
              <label>Full Name <input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} required /></label>
              <label>Email <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></label>
              <label>Password <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required /></label>
              <label>Role
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="APPROVER">Approver</option>
                  <option value="FINANCE_ADMIN">Finance Admin</option>
                  <option value="SYSTEM_ADMIN">System Admin</option>
                </select>
              </label>
              <label>Manager
                <select value={form.managerId} onChange={e => setForm({ ...form, managerId: e.target.value })}>
                  <option value="">None</option>
                  {approvers.map(a => <option key={a.id} value={a.id}>{a.fullName}</option>)}
                </select>
              </label>
              {error && <p className="error">{error}</p>}
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowModal(null)}>Cancel</button>
                <button type="submit">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showModal === 'edit' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Edit User</h2>
            <form onSubmit={onEditSubmit}>
              <label>Full Name <input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} required /></label>
              <label>Role
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="APPROVER">Approver</option>
                  <option value="FINANCE_ADMIN">Finance Admin</option>
                  <option value="SYSTEM_ADMIN">System Admin</option>
                </select>
              </label>
              <label>Manager
                <select value={form.managerId} onChange={e => setForm({ ...form, managerId: e.target.value })}>
                  <option value="">None</option>
                  {approvers.map(a => <option key={a.id} value={a.id}>{a.fullName}</option>)}
                </select>
              </label>
              {error && <p className="error">{error}</p>}
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowModal(null)}>Cancel</button>
                <button type="submit">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showModal === 'password' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Reset Password — {editUser?.fullName}</h2>
            <form onSubmit={onPwSubmit}>
              <label>New Password <input type="password" value={pwForm} onChange={e => setPwForm(e.target.value)} required /></label>
              {error && <p className="error">{error}</p>}
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowModal(null)}>Cancel</button>
                <button type="submit">Reset</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Routes & App ─── */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (!auth.token) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/my-requests" element={<ProtectedRoute><MyRequests /></ProtectedRoute>} />
        <Route path="/approval-queue" element={<ProtectedRoute><ApprovalQueue /></ProtectedRoute>} />
        <Route path="/finance-queue" element={<ProtectedRoute><FinanceQueue /></ProtectedRoute>} />
        <Route path="/requests/:id" element={<ProtectedRoute><RequestDetail /></ProtectedRoute>} />
        <Route path="/audit" element={<ProtectedRoute><AuditVerification /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}
