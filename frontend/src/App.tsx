import { Navigate, Route, Routes, Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

/* ── Types ─── */
interface AuthUser { sub: string; email: string; role: string; fullName: string; managerId: string | null; }
interface AuthContextValue { token: string; user: AuthUser | null; login: (t: string, u: AuthUser) => void; logout: () => void; }

/* ── Auth Context ─── */
const AuthContext = createContext<AuthContextValue | null>(null);
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState<AuthUser | null>(localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') as string) : null);
  const login = (t: string, u: AuthUser) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); setToken(t); setUser(u); };
  const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); setToken(''); setUser(null); };
  const value = useMemo(() => ({ token, user, login, logout }), [token, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
function useAuth() { const ctx = useContext(AuthContext); if (!ctx) throw new Error('Auth context missing'); return ctx; }

/* ── API Helpers ─── */
function useApi(authToken: string) {
  return useMemo(() => ({
    get: async (path: string) => {
      const r = await fetch(`${apiBase}${path}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.message || `GET ${path} failed`); }
      return r.json();
    },
    post: async (path: string, body?: Record<string, unknown>) => {
      const r = await fetch(`${apiBase}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.message || `POST ${path} failed`); }
      return r.json();
    },
    patch: async (path: string, body?: Record<string, unknown>) => {
      const r = await fetch(`${apiBase}${path}`, { method: 'PATCH', headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.message || `PATCH ${path} failed`); }
      return r.json();
    },
    del: async (path: string) => {
      const r = await fetch(`${apiBase}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${authToken}` } });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.message || `DELETE ${path} failed`); }
      return r.json();
    }
  }), [authToken]);
}

/* ── CSV Export ─── */
function exportCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function requestsToCsvRows(reqs: any[], actorIdFilter?: string) {
  return reqs.map(r => {
    const dec = getLatestAction(r, ['APPROVE', 'REJECT', 'RETURN', 'FINANCE_APPROVE', 'FINANCE_RETURN', 'PAID'], actorIdFilter);
    return [
      r.requestNumber, r.expenseType, r.status, r.employee?.fullName || r.employee?.email || '',
      r.category?.name || '', r.currency, r.totalAmount, r.invoiceNumber || '',
      r.invoiceDate ? new Date(r.invoiceDate).toLocaleDateString() : '',
      r.supplier || '', r.reason || '',
      r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '',
      dec?.actor?.fullName || dec?.actor?.email || '', dec?.comment || ''
    ];
  });
}

const CSV_HEADERS = ['Request #', 'Type', 'Status', 'Employee', 'Category', 'Currency', 'Amount', 'Invoice #', 'Invoice Date', 'Supplier', 'Reason', 'Submitted', 'Actioned By', 'Comment'];

/* ── Utilities ─── */
const HISTORY_STATUSES = new Set(['PAID', 'REJECTED', 'RETURNED', 'APPROVED', 'FINANCE_APPROVED', 'PAYMENT_PROCESSING']);
const TODAY_ISO = new Date().toISOString().split('T')[0];
const TRAVEL_ITEM_TYPES = ['TRANSPORT', 'HOTEL', 'ACCOMMODATION', 'MEALS', 'MISC', 'OTHER'];

function statusClass(s?: string) {
  switch (s) {
    case 'REJECTED': return 'status-red';
    case 'UNDER_REVIEW': case 'SUBMITTED': return 'status-yellow';
    case 'RETURNED': return 'status-orange';
    case 'PAID': return 'status-green';
    case 'FINANCE_APPROVED': return 'status-teal';
    case 'APPROVED': case 'PAYMENT_PROCESSING': return 'status-blue';
    default: return 'status-default';
  }
}
function formatStatus(s?: string) { return s ? s.replace(/_/g, ' ') : '-'; }
function StatusBadge({ status }: { status?: string }) { return <span className={`status-pill ${statusClass(status)}`}>{formatStatus(status)}</span>; }
function ExpenseTypeBadge({ type }: { type?: string }) {
  const cls = type === 'TRAVEL' ? 'type-travel' : type === 'PROTOCOL' ? 'type-protocol' : 'type-benefit';
  return <span className={`expense-type-tag ${cls}`}>{type || 'BENEFIT'}</span>;
}
function RoleBadge({ role }: { role: string }) {
  const cls = role === 'APPROVER' ? 'role-approver' : role === 'FINANCE_ADMIN' ? 'role-finance' : role === 'SYSTEM_ADMIN' ? 'role-admin' : role === 'AUDITOR' ? 'role-auditor' : 'role-employee';
  return <span className={`user-role-badge ${cls}`}>{role.replace(/_/g, ' ')}</span>;
}
function formatDate(v?: string | null) { if (!v) return '-'; const d = new Date(v); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString(); }
function monthKey(v?: string | null) { if (!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function getLatestAction(req: any, types: string[], actorId?: string) {
  const acts = (req.actions || []).filter((a: any) => types.includes(a.actionType) && (actorId ? a.actorId === actorId : true));
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
      <div className="budget-bar"><div className={`budget-bar-fill ${level}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
      <div className="budget-amounts">
        <span className="spent">€{budget.spent.toFixed(0)} spent</span>
        <span>€{remaining.toFixed(0)} remaining of €{budget.allocated.toFixed(0)}</span>
      </div>
    </div>
  );
}

/* ── SVG Bar Chart (no library) ─── */
interface BarData { label: string; spent: number; allocated: number; color: string; }
function BarChart({ bars, title }: { bars: BarData[]; title?: string }) {
  if (!bars.length) return <p className="muted">No data.</p>;
  const maxVal = Math.max(...bars.map(b => Math.max(b.allocated, b.spent, 1)));
  const barW = 48;
  const gap = 24;
  const chartH = 120;
  const labelH = 40;
  const svgW = bars.length * (barW + gap) + gap;
  const svgH = chartH + labelH + 20;
  return (
    <div className="bar-chart-wrap">
      {title && <h4 style={{ margin: '0 0 0.5rem' }}>{title}</h4>}
      <svg width={svgW} height={svgH} style={{ overflow: 'visible' }}>
        {bars.map((b, i) => {
          const x = gap + i * (barW + gap);
          const allocH = b.allocated > 0 ? (b.allocated / maxVal) * chartH : 0;
          const spentH = b.spent > 0 ? (b.spent / maxVal) * chartH : 0;
          const halfW = barW / 2 - 2;
          return (
            <g key={i}>
              {/* Allocated bar (background) */}
              <rect x={x} y={chartH - allocH + 8} width={barW} height={allocH} rx={3} fill="var(--border)" opacity={0.6} />
              {/* Spent bar (foreground) */}
              <rect x={x + 2} y={chartH - spentH + 8} width={barW - 4} height={spentH} rx={2} fill={b.color} />
              {/* Label */}
              <foreignObject x={x - 4} y={chartH + 12} width={barW + 8} height={labelH}>
                <div style={{ fontSize: '0.65rem', textAlign: 'center', color: 'var(--text-secondary)', lineHeight: 1.2, wordBreak: 'break-word' as any }}>
                  {b.label}<br />
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{b.spent.toFixed(0)}/{b.allocated.toFixed(0)}</span>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
      <div className="bar-chart-legend">
        <span><span className="pie-dot" style={{ background: 'var(--border)', opacity: 0.7 }} />Allocated</span>
        <span><span className="pie-dot" style={{ background: '#2b6cb0' }} />Spent</span>
      </div>
    </div>
  );
}

/* ── Pie Chart ─── */
function PieChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <p className="muted">No spend data yet.</p>;
  let cumAngle = -Math.PI / 2;
  const paths = slices.map((sl) => {
    const angle = (sl.value / total) * 2 * Math.PI;
    const x1 = 50 + 40 * Math.cos(cumAngle); const y1 = 50 + 40 * Math.sin(cumAngle);
    cumAngle += angle;
    const x2 = 50 + 40 * Math.cos(cumAngle); const y2 = 50 + 40 * Math.sin(cumAngle);
    const large = angle > Math.PI ? 1 : 0;
    return { d: `M50,50 L${x1},${y1} A40,40 0 ${large},1 ${x2},${y2} Z`, color: sl.color, label: sl.label, value: sl.value };
  });
  return (
    <div className="pie-chart-wrap">
      <svg viewBox="0 0 100 100" width="140" height="140">
        {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} stroke="var(--bg-card)" strokeWidth="1" />)}
      </svg>
      <ul className="pie-legend">
        {paths.map((p, i) => <li key={i}><span style={{ background: p.color }} className="pie-dot" />{p.label}: {p.value.toFixed(0)}</li>)}
      </ul>
    </div>
  );
}

/* ── Layout ─── */
function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate(); const location = useLocation(); const auth = useAuth();
  const role = auth.user?.role;
  const isAdmin = role === 'SYSTEM_ADMIN'; const isApprover = role === 'APPROVER';
  const isFinance = role === 'FINANCE_ADMIN'; const isAuditor = role === 'AUDITOR';
  const [theme, setTheme] = useState(() => localStorage.getItem('ef-theme') || 'light');
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('ef-theme', theme); }, [theme]);
  const toggleTheme = () => setTheme(p => p === 'light' ? 'dark' : 'light');
  const isActive = (path: string) => location.pathname === path ? 'active' : '';
  return (
    <div className="layout">
      <aside>
        <div className="brand"><span className="brand-title">OEDIV</span><span className="brand-subtitle">ExpenseFlow</span></div>
        <nav>
          <Link to="/dashboard" className={isActive('/dashboard')}>Dashboard</Link>
          {(role === 'EMPLOYEE' || isApprover || isAdmin) && <Link to="/my-requests" className={isActive('/my-requests')}>My Requests</Link>}
          {(isApprover || isAdmin) && <Link to="/approval-queue" className={isActive('/approval-queue')}>Approval Queue</Link>}
          {(isFinance || isAdmin) && <Link to="/finance-queue" className={isActive('/finance-queue')}>Finance Queue</Link>}
          {(isAdmin || isFinance) && <Link to="/audit" className={isActive('/audit')}>Audit Trail</Link>}
          {isAuditor && <Link to="/auditor-log" className={isActive('/auditor-log')}>Audit Log</Link>}
          {isAdmin && (<><div className="nav-divider" /><div className="nav-section-label">Administration</div><Link to="/admin/users" className={isActive('/admin/users')}>User Management</Link></>)}
        </nav>
        <div className="user-info">
          <button className="theme-toggle" onClick={toggleTheme}>{theme === 'light' ? '🌙 Dark mode' : '☀️ Light mode'}</button>
          <div className="user-name">{auth.user?.fullName || auth.user?.email}</div>
          <div className="user-role">{role?.replace(/_/g, ' ')}</div>
          <button className="sign-out-btn" onClick={() => { auth.logout(); navigate('/login'); }}>Sign out</button>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}

/* ── Login Page ─── */
function LoginPage() {
  const auth = useAuth(); const navigate = useNavigate();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    const r = await fetch(`${apiBase}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (!r.ok) { setError('Login failed. Check credentials.'); return; }
    const data = await r.json(); auth.login(data.accessToken, data.user); navigate('/dashboard');
  };
  return (
    <div className="login-container"><div className="login-card">
      <div className="login-brand"><p>OEDIV</p><h1>ExpenseFlow</h1></div>
      <form onSubmit={onSubmit}>
        <label>Email <input value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password <input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Sign in</button>
      </form>
    </div></div>
  );
}

/* ── Dashboard ─── */
function Dashboard() {
  const auth = useAuth(); const api = useApi(auth.token); const role = auth.user?.role;
  const [budgets, setBudgets] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, paid: 0 });
  const [teamBudgets, setTeamBudgets] = useState<any[]>([]);
  const [teamRequests, setTeamRequests] = useState<any[]>([]);

  useEffect(() => {
    if (!auth.token) return;
    api.get('/budget').then(setBudgets).catch(() => {});
    api.get('/requests').then((reqs: any[]) => {
      const ownReqs = reqs.filter(r => r.employee?.id === auth.user?.sub || r.employeeId === auth.user?.sub);
      setStats({
        total: ownReqs.length,
        pending: ownReqs.filter(r => ['SUBMITTED', 'UNDER_REVIEW'].includes(r.status)).length,
        approved: ownReqs.filter(r => ['APPROVED', 'FINANCE_APPROVED'].includes(r.status)).length,
        paid: ownReqs.filter(r => r.status === 'PAID').length
      });
      if (role === 'APPROVER' || role === 'SYSTEM_ADMIN') {
        setTeamRequests(reqs.filter(r => r.employee?.id !== auth.user?.sub && r.employeeId !== auth.user?.sub));
      }
    }).catch(() => {});
    if (role === 'APPROVER' || role === 'SYSTEM_ADMIN') {
      api.get('/budget/team').then(setTeamBudgets).catch(() => {});
    }
  }, [auth.token]);

  // Group team budgets by employee
  const teamByEmployee = useMemo(() => {
    const map: Record<string, { name: string; email: string; budgets: any[] }> = {};
    teamBudgets.forEach(b => {
      const uid = b.user?.id || b.userId;
      if (!uid) return;
      if (!map[uid]) map[uid] = { name: b.user?.fullName || b.user?.email || uid, email: b.user?.email || '', budgets: [] };
      map[uid].budgets.push(b);
    });
    return Object.values(map);
  }, [teamBudgets]);

  // Travel/Protocol spend per employee from team requests
  const travelProtocolByEmployee = useMemo(() => {
    const map: Record<string, { name: string; travel: number; protocol: number }> = {};
    teamRequests.forEach(r => {
      if (!['APPROVED', 'FINANCE_APPROVED', 'PAYMENT_PROCESSING', 'PAID'].includes(r.status)) return;
      const uid = r.employee?.id || r.employeeId;
      if (!uid) return;
      if (!map[uid]) map[uid] = { name: r.employee?.fullName || r.employee?.email || uid, travel: 0, protocol: 0 };
      if (r.expenseType === 'TRAVEL') map[uid].travel += r.totalAmount || 0;
      if (r.expenseType === 'PROTOCOL') map[uid].protocol += r.totalAmount || 0;
    });
    return Object.values(map);
  }, [teamRequests]);

  const COLORS = ['#2b6cb0', '#2d6a4f', '#b5830a', '#9b2c2c', '#6b21a8', '#0891b2', '#be185d', '#c2410c'];

  return (
    <div>
      <div className="page-header"><div><h1>Dashboard</h1><p className="muted">Welcome back, {auth.user?.fullName || auth.user?.email}</p></div></div>
      <div className="grid">
        <div className="card"><h3>My Requests</h3><div className="stat-value">{stats.total}</div></div>
        <div className="card"><h3>Pending Review</h3><div className="stat-value">{stats.pending}</div></div>
        <div className="card"><h3>Approved</h3><div className="stat-value">{stats.approved}</div></div>
        <div className="card"><h3>Paid</h3><div className="stat-value">{stats.paid}</div></div>
      </div>

      {budgets.length > 0 && (
        <>
          <h2>My Benefit Budgets — {new Date().getFullYear()}</h2>
          <p className="muted" style={{ marginBottom: '1rem' }}>Annual allocations for benefit categories</p>
          <div className="grid">{budgets.map(b => <BudgetCard key={b.id} budget={b} />)}</div>
        </>
      )}

      {(role === 'APPROVER' || role === 'SYSTEM_ADMIN') && teamByEmployee.length > 0 && (
        <>
          <h2>Team Benefit Budgets</h2>
          <p className="muted" style={{ marginBottom: '1rem' }}>Per-employee breakdown of benefit allocations (Eyeglasses, Training, Gym) — spent vs. allocated</p>
          <div className="team-budget-grid">
            {teamByEmployee.map((emp, ei) => {
              const benefitBars: BarData[] = emp.budgets.map((b, bi) => ({
                label: b.category?.name || 'Category',
                spent: b.spent,
                allocated: b.allocated,
                color: COLORS[(ei + bi) % COLORS.length]
              }));
              return (
                <div key={ei} className="card team-budget-card">
                  <div className="team-budget-header">
                    <strong>{emp.name}</strong>
                    <span className="muted" style={{ fontSize: '0.75rem' }}>{emp.email}</span>
                  </div>
                  {benefitBars.length > 0
                    ? <BarChart bars={benefitBars} title="Benefit Budget (€ spent / allocated)" />
                    : <p className="muted" style={{ fontSize: '0.8rem' }}>No benefit allocations.</p>
                  }
                </div>
              );
            })}
          </div>

          {travelProtocolByEmployee.length > 0 && (
            <>
              <h2>Team Travel &amp; Protocol Spend</h2>
              <p className="muted" style={{ marginBottom: '1rem' }}>Total approved spend on travel and protocol expenses per employee</p>
              <div className="team-budget-grid">
                {travelProtocolByEmployee.map((emp, i) => {
                  const bars: BarData[] = [
                    { label: 'Travel', spent: emp.travel, allocated: emp.travel, color: '#0891b2' },
                    { label: 'Protocol', spent: emp.protocol, allocated: emp.protocol, color: '#6b21a8' }
                  ].filter(b => b.spent > 0);
                  return (
                    <div key={i} className="card team-budget-card">
                      <div className="team-budget-header"><strong>{emp.name}</strong></div>
                      <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <span>Travel: <strong>{emp.travel.toFixed(0)} €</strong></span>
                        <span>Protocol: <strong>{emp.protocol.toFixed(0)} €</strong></span>
                      </div>
                      {bars.length > 0 && (
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                          {bars.map((b, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                              <span className="pie-dot" style={{ background: b.color }} />
                              {b.label}: {b.spent.toFixed(0)} €
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ── Travel Package Line Items ─── */
interface TravelLineItem { date: string; description: string; amount: string; currency: string; lineItemType: string; }
const emptyTravelItem = (): TravelLineItem => ({ date: '', description: '', amount: '', currency: 'RON', lineItemType: 'TRANSPORT' });

function TravelPackageForm({ onSave, saving }: { onSave: (items: TravelLineItem[], reason: string) => void; saving: boolean }) {
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<TravelLineItem[]>([emptyTravelItem()]);

  const updateItem = (i: number, field: keyof TravelLineItem, value: string) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  };
  const addItem = () => setItems(prev => [...prev, emptyTravelItem()]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const total = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);

  return (
    <div>
      <label style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        Trip/Event Description (Reason)
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Business trip to Bucharest, 10-12 Feb 2026" required />
      </label>
      <div className="travel-items-header">
        <span>Line Items</span>
        <button type="button" className="sm secondary" onClick={addItem}>+ Add Item</button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="travel-item-row">
          <select value={item.lineItemType} onChange={e => updateItem(i, 'lineItemType', e.target.value)}>
            {TRAVEL_ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" value={item.date} max={TODAY_ISO} onChange={e => updateItem(i, 'date', e.target.value)} placeholder="Date" required />
          <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="Description (e.g. Train Cluj→Buc)" required style={{ flex: 2 }} />
          <input type="number" min="0" step="0.01" value={item.amount} onChange={e => updateItem(i, 'amount', e.target.value)} placeholder="Amount" required style={{ width: '90px' }} />
          <select value={item.currency} onChange={e => updateItem(i, 'currency', e.target.value)} style={{ width: '80px' }}>
            <option value="RON">RON</option><option value="EUR">EUR</option><option value="USD">USD</option>
          </select>
          {items.length > 1 && <button type="button" className="sm danger" onClick={() => removeItem(i)} style={{ padding: '0.3rem 0.5rem' }}>✕</button>}
        </div>
      ))}
      <div className="travel-total">Total: {total.toFixed(2)} (mixed currencies)</div>
      <div className="form-actions">
        <button type="button" disabled={saving || !reason.trim() || items.some(it => !it.date || !it.description || !it.amount)} onClick={() => onSave(items, reason)}>
          {saving ? 'Creating…' : 'Create Travel Request'}
        </button>
      </div>
    </div>
  );
}

/* ── My Requests ─── */
function MyRequests() {
  const auth = useAuth(); const api = useApi(auth.token);
  const [requests, setRequests] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [historyMonth, setHistoryMonth] = useState('all');
  const [form, setForm] = useState({ categoryId: '', reason: '', currency: 'RON', totalAmount: '', invoiceNumber: '', invoiceDate: '', supplier: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expenseType, setExpenseType] = useState('BENEFIT');

  const load = useCallback(() => {
    api.get('/requests').then((all: any[]) => {
      setRequests(all.filter(r => r.employee?.id === auth.user?.sub || r.employeeId === auth.user?.sub));
    }).catch(() => setRequests([]));
    if (expenseType !== 'TRAVEL') {
      api.get(`/categories?type=${expenseType}`).then(setCategories).catch(() => setCategories([]));
    }
  }, [auth.token, expenseType]);

  useEffect(() => { if (auth.token) load(); }, [load, auth.token]);

  if (auth.user?.role === 'FINANCE_ADMIN') {
    return <div><h1>My Requests</h1><p className="muted">Finance users manage the Finance Queue.</p></div>;
  }

  // Regular (non-travel) request creation
  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError('');
    if (!form.categoryId || !form.reason || !form.totalAmount) { setFormError('Complete all required fields.'); return; }
    setSaving(true);
    try {
      await api.post('/requests', {
        categoryId: form.categoryId, reason: form.reason, currency: form.currency,
        totalAmount: Number(form.totalAmount), invoiceNumber: form.invoiceNumber || undefined,
        invoiceDate: form.invoiceDate || undefined, supplier: form.supplier || undefined
      });
      setShowCreate(false);
      setForm({ categoryId: '', reason: '', currency: 'RON', totalAmount: '', invoiceNumber: '', invoiceDate: '', supplier: '' });
      load();
    } catch (err: any) {
      const msg = err?.message || 'Unable to create request.';
      setFormError(Array.isArray(msg) ? msg.join('; ') : msg);
    } finally { setSaving(false); }
  };

  // Travel package creation: create request + line items
  const onCreateTravel = async (items: TravelLineItem[], reason: string) => {
    setFormError('');
    // Find the travel category
    let travelCats: any[] = categories;
    if (!travelCats.length) { travelCats = await api.get('/categories?type=TRAVEL').catch(() => []); }
    if (!travelCats.length) { setFormError('No travel categories found. Ask your admin to set them up.'); return; }
    const travelCat = travelCats[0];
    const totalAmount = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
    // Use currency of first item; mixed if different
    const currency = items.every(it => it.currency === items[0].currency) ? items[0].currency : 'MIXED';
    setSaving(true);
    try {
      const req = await api.post('/requests', {
        categoryId: travelCat.id, reason, currency,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        invoiceDate: items[0]?.date || undefined
      });
      // Add all line items
      await Promise.all(items.map(it => api.post(`/requests/${req.id}/line-items`, {
        date: it.date, description: it.description, amount: parseFloat(it.amount),
        currency: it.currency, lineItemType: it.lineItemType
      })));
      setShowCreate(false); load();
    } catch (err: any) {
      const msg = err?.message || 'Unable to create travel request.';
      setFormError(Array.isArray(msg) ? msg.join('; ') : msg);
    } finally { setSaving(false); }
  };

  const onSubmitRequest = async (id: string) => {
    try { await api.post(`/requests/${id}/submit`); load(); }
    catch (err: any) { alert(`Could not submit: ${err?.message || 'Unknown error'}`); }
  };

  const openReqs = requests.filter(i => !HISTORY_STATUSES.has(i.status));
  const historyReqs = requests.filter(i => HISTORY_STATUSES.has(i.status));
  const historyMonths = [...new Set(historyReqs.map(i => monthKey(i.submittedAt)).filter(Boolean))].sort().reverse();
  const filteredHistory = historyMonth === 'all' ? historyReqs : historyReqs.filter(i => monthKey(i.submittedAt) === historyMonth);

  const doExportOpen = () => exportCsv(`my-requests-open-${TODAY_ISO}.csv`, CSV_HEADERS, requestsToCsvRows(openReqs));
  const doExportHistory = () => exportCsv(`my-requests-history-${TODAY_ISO}.csv`, CSV_HEADERS, requestsToCsvRows(filteredHistory));

  return (
    <div>
      <div className="page-header">
        <div><h1>My Requests</h1><p className="muted">Manage your expense requests</p></div>
        <button className="btn-primary" onClick={() => setShowCreate(p => !p)}>{showCreate ? 'Cancel' : '+ New Request'}</button>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3>New Request</h3>
          <div className="tabs">
            {['BENEFIT', 'TRAVEL', 'PROTOCOL'].map(t => (
              <button key={t} className={`tab-btn ${expenseType === t ? 'active' : ''}`} onClick={() => { setExpenseType(t); setFormError(''); setForm({ ...form, categoryId: '' }); }}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {expenseType === 'TRAVEL' ? (
            <div style={{ marginTop: '1rem' }}>
              <p className="muted" style={{ marginBottom: '1rem' }}>
                Travel expenses are submitted as a package. Add all cost items (transport, hotel, meals, etc.) and they will be bundled into one request.
              </p>
              {formError && <p className="error">{formError}</p>}
              <TravelPackageForm onSave={onCreateTravel} saving={saving} />
            </div>
          ) : (
            <form onSubmit={onCreate} className="form-grid" style={{ marginTop: '1rem' }}>
              <label>Category
                <select value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })} required>
                  <option value="">Select</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>Amount <input type="number" min="0" step="0.01" value={form.totalAmount} onChange={e => setForm({ ...form, totalAmount: e.target.value })} required /></label>
              <label>Currency
                <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} required>
                  <option value="RON">RON</option><option value="EUR">EUR</option><option value="USD">USD</option>
                </select>
              </label>
              <label>Invoice # <input value={form.invoiceNumber} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} required /></label>
              <label>Invoice date <input type="date" value={form.invoiceDate} max={TODAY_ISO} onChange={e => setForm({ ...form, invoiceDate: e.target.value })} required /></label>
              <label>Supplier <input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} required /></label>
              <label style={{ gridColumn: '1 / -1' }}>Reason <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required /></label>
              {formError && <p className="error" style={{ gridColumn: '1 / -1' }}>{formError}</p>}
              <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Draft'}</button></div>
            </form>
          )}
        </div>
      )}

      <div className="page-header" style={{ marginBottom: '0.5rem' }}>
        <div><h2 style={{ margin: 0 }}>Open Requests</h2></div>
        {openReqs.length > 0 && <button className="sm secondary" onClick={doExportOpen}>⬇ Export CSV</button>}
      </div>
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
                    {(i.status === 'DRAFT' || i.status === 'RETURNED') && <button className="sm" onClick={() => onSubmitRequest(i.id)}>Submit</button>}
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
        <div>
          <h2>History</h2>
          <p className="muted">Past requests by month</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select value={historyMonth} onChange={e => setHistoryMonth(e.target.value)}>
            <option value="all">All months</option>
            {historyMonths.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {filteredHistory.length > 0 && <button className="sm secondary" onClick={doExportHistory}>⬇ Export CSV</button>}
        </div>
      </div>
      {filteredHistory.length === 0 ? <p className="empty-state">No history yet</p> : (
        <table>
          <thead><tr><th>Request #</th><th>Type</th><th>Status</th><th>Submitted</th><th>Actioned By</th><th>Comment</th><th>Category</th><th>Total</th></tr></thead>
          <tbody>
            {filteredHistory.map(i => {
              const dec = getLatestAction(i, ['APPROVE', 'REJECT', 'RETURN', 'FINANCE_APPROVE', 'FINANCE_RETURN', 'PAID']);
              return (
                <tr key={i.id}>
                  <td><Link to={`/requests/${i.id}`}>{i.requestNumber}</Link></td>
                  <td><ExpenseTypeBadge type={i.expenseType} /></td>
                  <td><StatusBadge status={i.status} /></td>
                  <td>{formatDate(i.submittedAt)}</td>
                  <td>{dec?.actor?.fullName || dec?.actor?.email || '-'}</td>
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
  const auth = useAuth(); const api = useApi(auth.token);
  const [requests, setRequests] = useState<any[]>([]);
  const [historyMonth, setHistoryMonth] = useState('all');
  const [commentModal, setCommentModal] = useState<{ action: string; id: string; label: string } | null>(null);
  const [commentText, setCommentText] = useState(''); const [commentError, setCommentError] = useState('');

  const load = useCallback(() => {
    api.get('/requests').then((all: any[]) => {
      setRequests(all.filter(r => r.employee?.id !== auth.user?.sub && r.employeeId !== auth.user?.sub));
    }).catch(() => setRequests([]));
  }, [auth.token]);

  useEffect(() => { if (auth.token) load(); }, [load, auth.token]);

  const openModal = (action: string, id: string, label: string) => { setCommentText(''); setCommentError(''); setCommentModal({ action, id, label }); };
  const submitModal = async () => {
    if (!commentModal) return;
    if (!commentText.trim()) { setCommentError('Comment is required.'); return; }
    try { await api.post(`/requests/${commentModal.id}/${commentModal.action}`, { comment: commentText }); setCommentModal(null); load(); }
    catch (err: any) { setCommentError(err?.message || 'Action failed.'); }
  };

  const open = requests.filter(i => ['UNDER_REVIEW', 'SUBMITTED'].includes(i.status));
  const history = requests.filter(i => HISTORY_STATUSES.has(i.status) && getLatestAction(i, ['APPROVE', 'REJECT', 'RETURN'], auth.user?.sub));
  const months = [...new Set(history.map(i => monthKey(i.submittedAt)).filter(Boolean))].sort().reverse();
  const filtered = historyMonth === 'all' ? history : history.filter(i => monthKey(i.submittedAt) === historyMonth);

  const doExportOpen = () => exportCsv(`approval-queue-${TODAY_ISO}.csv`, CSV_HEADERS, requestsToCsvRows(open));
  const doExportHistory = () => exportCsv(`approval-history-${TODAY_ISO}.csv`, CSV_HEADERS, requestsToCsvRows(filtered, auth.user?.sub));

  return (
    <div>
      <div className="page-header">
        <div><h1>Approval Queue</h1><p className="muted">Requests from your team awaiting review</p></div>
        {open.length > 0 && <button className="sm secondary" onClick={doExportOpen}>⬇ Export CSV</button>}
      </div>
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
                    <button className="sm success" onClick={() => openModal('approve', i.id, 'Approve')}>Approve</button>
                    <button className="sm danger" onClick={() => openModal('reject', i.id, 'Reject')}>Reject</button>
                    <button className="sm secondary" onClick={() => openModal('return', i.id, 'Return')}>Return</button>
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
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select value={historyMonth} onChange={e => setHistoryMonth(e.target.value)}>
            <option value="all">All months</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {filtered.length > 0 && <button className="sm secondary" onClick={doExportHistory}>⬇ Export CSV</button>}
        </div>
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
      {commentModal && (
        <div className="modal-overlay" onClick={() => setCommentModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{commentModal.label} Request</h2>
            <label>Comment (required)
              <textarea value={commentText} onChange={e => setCommentText(e.target.value)} rows={3} style={{ resize: 'vertical' }} placeholder="Enter your reason..." />
            </label>
            {commentError && <p className="error">{commentError}</p>}
            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => setCommentModal(null)}>Cancel</button>
              <button type="button" className={commentModal.action === 'approve' ? 'success' : commentModal.action === 'reject' ? 'danger' : ''} onClick={submitModal}>{commentModal.label}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Finance Queue ─── */
function FinanceQueue() {
  const auth = useAuth(); const api = useApi(auth.token);
  const [requests, setRequests] = useState<any[]>([]);
  const [historyMonth, setHistoryMonth] = useState('all');
  const [commentModal, setCommentModal] = useState<{ id: string } | null>(null);
  const [commentText, setCommentText] = useState(''); const [commentError, setCommentError] = useState('');

  const load = useCallback(() => { api.get('/requests').then(setRequests).catch(() => setRequests([])); }, [auth.token]);
  useEffect(() => { if (auth.token) load(); }, [load, auth.token]);

  const onFinanceApprove = async (id: string) => {
    try { await api.post(`/requests/${id}/finance/approve`, { comment: 'Documents verified' }); load(); }
    catch (err: any) { alert(`Finance approve failed: ${err?.message || 'Unknown error'}`); }
  };
  const openReturnModal = (id: string) => { setCommentText(''); setCommentError(''); setCommentModal({ id }); };
  const submitReturn = async () => {
    if (!commentModal) return;
    if (!commentText.trim()) { setCommentError('Comment is required.'); return; }
    try { await api.post(`/requests/${commentModal.id}/finance/return`, { comment: commentText }); setCommentModal(null); load(); }
    catch (err: any) { setCommentError(err?.message || 'Return failed.'); }
  };
  const onReimburse = async (id: string) => {
    try { await api.post(`/requests/${id}/finance/paid`); load(); }
    catch (err: any) { alert(`Reimbursement failed: ${err?.message || 'Unknown error'}`); }
  };

  const pendingFinanceApproval = requests.filter(i => i.status === 'APPROVED');
  const pendingReimbursement = requests.filter(i => ['FINANCE_APPROVED', 'PAYMENT_PROCESSING'].includes(i.status));
  const history = requests.filter(i => i.status === 'PAID');
  const months = [...new Set(history.map(i => monthKey(i.submittedAt)).filter(Boolean))].sort().reverse();
  const filtered = historyMonth === 'all' ? history : history.filter(i => monthKey(i.submittedAt) === historyMonth);
  const getApprover = (item: any) => { const a = getLatestAction(item, ['APPROVE']); return a?.actor?.fullName || a?.actor?.email || '-'; };

  const doExportPhase1 = () => exportCsv(`finance-review-${TODAY_ISO}.csv`, CSV_HEADERS, requestsToCsvRows(pendingFinanceApproval));
  const doExportPhase2 = () => exportCsv(`finance-reimbursement-${TODAY_ISO}.csv`, CSV_HEADERS, requestsToCsvRows(pendingReimbursement));
  const doExportHistory = () => exportCsv(`finance-history-${TODAY_ISO}.csv`, CSV_HEADERS, requestsToCsvRows(filtered));

  return (
    <div>
      <div className="page-header"><div><h1>Finance Queue</h1><p className="muted">Review and reimburse approved requests</p></div></div>

      <div className="page-header" style={{ marginBottom: '0.5rem' }}>
        <div><h2 style={{ margin: 0 }}>Phase 1 — Document Review</h2><p className="muted">Manager-approved, pending finance verification</p></div>
        {pendingFinanceApproval.length > 0 && <button className="sm secondary" onClick={doExportPhase1}>⬇ Export CSV</button>}
      </div>
      {pendingFinanceApproval.length === 0 ? <p className="empty-state">No requests awaiting document review</p> : (
        <table>
          <thead><tr><th>Request #</th><th>Type</th><th>Submitted By</th><th>Approved By</th><th>Invoice #</th><th>Supplier</th><th>Category</th><th>Total</th><th>Actions</th></tr></thead>
          <tbody>
            {pendingFinanceApproval.map(i => (
              <tr key={i.id}>
                <td><Link to={`/requests/${i.id}`}>{i.requestNumber}</Link></td>
                <td><ExpenseTypeBadge type={i.expenseType} /></td>
                <td>{i.employee?.fullName || i.employee?.email}</td>
                <td>{getApprover(i)}</td>
                <td>{i.invoiceNumber || '-'}</td>
                <td>{i.supplier || '-'}</td>
                <td>{i.category?.name}</td>
                <td>{i.currency} {i.totalAmount}</td>
                <td><div className="table-actions">
                  <button className="sm success" onClick={() => onFinanceApprove(i.id)}>Approve Docs</button>
                  <button className="sm danger" onClick={() => openReturnModal(i.id)}>Return to Approver</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="section-gap" />
      <div className="page-header" style={{ marginBottom: '0.5rem' }}>
        <div><h2 style={{ margin: 0 }}>Phase 2 — Reimbursement</h2><p className="muted">Finance-approved, ready for payment</p></div>
        {pendingReimbursement.length > 0 && <button className="sm secondary" onClick={doExportPhase2}>⬇ Export CSV</button>}
      </div>
      {pendingReimbursement.length === 0 ? <p className="empty-state">No requests awaiting reimbursement</p> : (
        <table>
          <thead><tr><th>Request #</th><th>Type</th><th>Status</th><th>Submitted By</th><th>Approved By</th><th>Invoice #</th><th>Supplier</th><th>Category</th><th>Total</th><th>Actions</th></tr></thead>
          <tbody>
            {pendingReimbursement.map(i => (
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
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select value={historyMonth} onChange={e => setHistoryMonth(e.target.value)}>
            <option value="all">All months</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {filtered.length > 0 && <button className="sm secondary" onClick={doExportHistory}>⬇ Export CSV</button>}
        </div>
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

      {commentModal && (
        <div className="modal-overlay" onClick={() => setCommentModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Return to Approver</h2>
            <p className="muted" style={{ marginBottom: '1rem' }}>Describe the issue so the approver can review it.</p>
            <label>Reason (required)
              <textarea value={commentText} onChange={e => setCommentText(e.target.value)} rows={3} style={{ resize: 'vertical' }} placeholder="e.g. Invoice missing VAT breakdown..." />
            </label>
            {commentError && <p className="error">{commentError}</p>}
            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => setCommentModal(null)}>Cancel</button>
              <button type="button" className="danger" onClick={submitReturn}>Return</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Request Detail ─── */
function RequestDetail() {
  const auth = useAuth(); const api = useApi(auth.token);
  const { id } = useParams();
  const [request, setRequest] = useState<any | null>(null);
  useEffect(() => { if (!auth.token || !id) return; api.get(`/requests/${id}`).then(setRequest).catch(() => setRequest(null)); }, [auth.token, id]);
  if (!request) return <p className="empty-state">Loading…</p>;
  return (
    <div>
      <div className="page-header">
        <div><h1>{request.requestNumber}</h1><p className="muted">{request.employee?.fullName} · {request.category?.name}</p></div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><ExpenseTypeBadge type={request.expenseType} /><StatusBadge status={request.status} /></div>
      </div>
      <div className="grid">
        <div className="card"><h3>Amount</h3><div className="stat-value">{request.currency} {request.totalAmount}</div></div>
        <div className="card"><h3>Reason</h3><p>{request.reason}</p></div>
        <div className="card"><h3>Invoice Details</h3><p>Number: {request.invoiceNumber || '-'}</p><p>Date: {formatDate(request.invoiceDate)}</p><p>Supplier: {request.supplier || '-'}</p></div>
      </div>
      {request.lineItems?.length > 0 && (
        <>
          <h2>Line Items</h2>
          <table>
            <thead><tr><th>Type</th><th>Date</th><th>Description</th><th>Amount</th><th>Currency</th></tr></thead>
            <tbody>
              {request.lineItems.map((li: any) => (
                <tr key={li.id}>
                  <td>{li.lineItemType || '-'}</td>
                  <td>{formatDate(li.date)}</td>
                  <td>{li.description}</td>
                  <td>{li.amount}</td>
                  <td>{li.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
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
  const auth = useAuth(); const api = useApi(auth.token);
  const [result, setResult] = useState<any | null>(null); const [error, setError] = useState('');
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

/* ── Auditor Log Page ─── */
function AuditorLog() {
  const auth = useAuth(); const api = useApi(auth.token);
  const [requests, setRequests] = useState<any[]>([]); const [loading, setLoading] = useState(true); const [search, setSearch] = useState('');
  useEffect(() => { if (!auth.token) return; api.get('/requests/audit-log').then(r => { setRequests(r); setLoading(false); }).catch(() => setLoading(false)); }, [auth.token]);
  const filtered = requests.filter(r => r.requestNumber?.toLowerCase().includes(search.toLowerCase()) || r.employee?.fullName?.toLowerCase().includes(search.toLowerCase()) || r.employee?.email?.toLowerCase().includes(search.toLowerCase()));

  const doExport = () => {
    const headers = ['Request #', 'Employee', 'Category', 'Type', 'Status', 'Currency', 'Amount', 'Action', 'Actor', 'Actor Role', 'From Status', 'To Status', 'Comment', 'Date'];
    const rows: any[][] = [];
    filtered.forEach(r => {
      if (!r.actions?.length) { rows.push([r.requestNumber, r.employee?.fullName, r.category?.name, r.expenseType, r.status, r.currency, r.totalAmount, '', '', '', '', '', '', '']); return; }
      r.actions.forEach((a: any) => rows.push([r.requestNumber, r.employee?.fullName, r.category?.name, r.expenseType, r.status, r.currency, r.totalAmount, a.actionType, a.actor?.fullName || a.actor?.email, a.actor?.role, a.fromStatus, a.toStatus, a.comment || '', new Date(a.createdAt).toLocaleString()]));
    });
    exportCsv(`audit-log-${TODAY_ISO}.csv`, headers, rows);
  };

  return (
    <div>
      <div className="page-header">
        <div><h1>Audit Log</h1><p className="muted">Complete approval process history for all requests</p></div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="search" placeholder="Search by request # or employee…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '260px' }} />
          {filtered.length > 0 && <button className="sm secondary" onClick={doExport}>⬇ Export CSV</button>}
        </div>
      </div>
      {loading ? <p className="empty-state">Loading…</p> : filtered.length === 0 ? <p className="empty-state">No requests found.</p> : (
        <div className="audit-log-list">
          {filtered.map(r => (
            <div key={r.id} className="card" style={{ marginBottom: '1rem' }}>
              <div className="audit-log-header">
                <div><strong>{r.requestNumber}</strong><span className="muted" style={{ marginLeft: '0.75rem' }}>{r.employee?.fullName} ({r.employee?.email})</span></div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <ExpenseTypeBadge type={r.expenseType} /><StatusBadge status={r.status} />
                  <span className="muted">{r.category?.name}</span>
                  <span style={{ fontWeight: 600 }}>{r.currency} {r.totalAmount}</span>
                </div>
              </div>
              {r.actions?.length > 0 ? (
                <ul className="timeline" style={{ marginTop: '1rem' }}>
                  {r.actions.map((a: any) => (
                    <li key={a.id}>
                      <strong>{a.actionType.replace(/_/g, ' ')}</strong>
                      <span className="actor-name"> by {a.actor?.fullName || a.actor?.email || 'system'}</span>
                      {' '}<span className="muted">({a.actor?.role?.replace(/_/g, ' ')})</span>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {a.fromStatus?.replace(/_/g, ' ')} → {a.toStatus?.replace(/_/g, ' ')} · {new Date(a.createdAt).toLocaleString()}
                      </span>
                      {a.comment && <p style={{ marginTop: '0.25rem', fontStyle: 'italic' }}>"{a.comment}"</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>No actions recorded yet.</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Admin: User Management ─── */
function AdminUsers() {
  const auth = useAuth(); const api = useApi(auth.token);
  const [users, setUsers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState<'create' | 'edit' | 'password' | null>(null);
  const [editUser, setEditUser] = useState<any>(null);
  const [form, setForm] = useState({ email: '', fullName: '', password: '', role: 'EMPLOYEE', managerId: '' });
  const [pwForm, setPwForm] = useState(''); const [error, setError] = useState('');
  const load = useCallback(() => { api.get('/admin/users').then(setUsers).catch(() => setUsers([])); }, [auth.token]);
  useEffect(() => { if (auth.token) load(); }, [load, auth.token]);
  const approvers = users.filter(u => u.role === 'APPROVER');
  const openCreate = () => { setForm({ email: '', fullName: '', password: '', role: 'EMPLOYEE', managerId: '' }); setError(''); setShowModal('create'); };
  const openEdit = (u: any) => { setEditUser(u); setForm({ email: u.email, fullName: u.fullName, password: '', role: u.role, managerId: u.managerId || '' }); setError(''); setShowModal('edit'); };
  const openPw = (u: any) => { setEditUser(u); setPwForm(''); setError(''); setShowModal('password'); };
  const onCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try { await api.post('/admin/users', { email: form.email, fullName: form.fullName, password: form.password, role: form.role, managerId: form.managerId || undefined }); setShowModal(null); load(); }
    catch (err: any) { setError(err?.message || 'Failed to create user.'); }
  };
  const onEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try { await api.patch(`/admin/users/${editUser.id}`, { fullName: form.fullName, role: form.role, managerId: form.managerId || null }); setShowModal(null); load(); }
    catch (err: any) { setError(err?.message || 'Failed to update user.'); }
  };
  const onPwSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try { await api.post(`/admin/users/${editUser.id}/reset-password`, { password: pwForm }); setShowModal(null); }
    catch (err: any) { setError(err?.message || 'Failed to reset password.'); }
  };
  const onDeactivate = async (id: string) => { if (!window.confirm('Deactivate this user?')) return; await api.del(`/admin/users/${id}`); load(); };
  const onPermanentDelete = async (id: string) => { if (!window.confirm('⚠️ PERMANENTLY DELETE this user and all their data?\n\nThis action cannot be undone.')) return; await api.del(`/admin/users/${id}/permanent`); load(); };
  return (
    <div>
      <div className="page-header">
        <div><h1>User Management</h1><p className="muted">{users.length} users</p></div>
        <button onClick={openCreate}>+ Add User</button>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Manager</th><th>Status</th><th>Reports</th><th>Actions</th></tr></thead>
        <tbody>
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
      {showModal === 'create' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}><div className="modal" onClick={e => e.stopPropagation()}>
          <h2>Create User</h2>
          <form onSubmit={onCreateSubmit}>
            <label>Full Name <input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} required /></label>
            <label>Email <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></label>
            <label>Password <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required /></label>
            <label>Role <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="EMPLOYEE">Employee</option><option value="APPROVER">Approver</option><option value="FINANCE_ADMIN">Finance Admin</option><option value="SYSTEM_ADMIN">System Admin</option><option value="AUDITOR">Auditor</option>
            </select></label>
            <label>Manager <select value={form.managerId} onChange={e => setForm({ ...form, managerId: e.target.value })}>
              <option value="">None</option>{approvers.map(a => <option key={a.id} value={a.id}>{a.fullName}</option>)}
            </select></label>
            {error && <p className="error">{error}</p>}
            <div className="form-actions"><button type="button" className="secondary" onClick={() => setShowModal(null)}>Cancel</button><button type="submit">Create</button></div>
          </form>
        </div></div>
      )}
      {showModal === 'edit' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}><div className="modal" onClick={e => e.stopPropagation()}>
          <h2>Edit User</h2>
          <form onSubmit={onEditSubmit}>
            <label>Full Name <input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} required /></label>
            <label>Role <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="EMPLOYEE">Employee</option><option value="APPROVER">Approver</option><option value="FINANCE_ADMIN">Finance Admin</option><option value="SYSTEM_ADMIN">System Admin</option><option value="AUDITOR">Auditor</option>
            </select></label>
            <label>Manager <select value={form.managerId} onChange={e => setForm({ ...form, managerId: e.target.value })}>
              <option value="">None</option>{approvers.map(a => <option key={a.id} value={a.id}>{a.fullName}</option>)}
            </select></label>
            {error && <p className="error">{error}</p>}
            <div className="form-actions"><button type="button" className="secondary" onClick={() => setShowModal(null)}>Cancel</button><button type="submit">Save</button></div>
          </form>
        </div></div>
      )}
      {showModal === 'password' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}><div className="modal" onClick={e => e.stopPropagation()}>
          <h2>Reset Password — {editUser?.fullName}</h2>
          <form onSubmit={onPwSubmit}>
            <label>New Password <input type="password" value={pwForm} onChange={e => setPwForm(e.target.value)} required /></label>
            {error && <p className="error">{error}</p>}
            <div className="form-actions"><button type="button" className="secondary" onClick={() => setShowModal(null)}>Cancel</button><button type="submit">Reset</button></div>
          </form>
        </div></div>
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
        <Route path="/auditor-log" element={<ProtectedRoute><AuditorLog /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}
