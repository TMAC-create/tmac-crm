import { FormEvent, useEffect, useMemo, useState } from 'react';

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type Client = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  mobile?: string | null;
  status: string;
  source?: string | null;
  campaign?: string | null;
  createdAt?: string;
};

type DashboardSummary = {
  totalClients: number;
  totalTasksOpen: number;
  statusCounts: { status: string; count: number }[];
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  mobile: '',
  source: 'Website',
  campaign: 'campaign_1',
  status: 'NEW_LEAD',
};

export default function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem('tmac_token') || '');
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('tmac_user');
    return raw ? JSON.parse(raw) as User : null;
  });
  const [email, setEmail] = useState('admin@tmaccrm.local');
  const [password, setPassword] = useState('ChangeMe123!');
  const [clients, setClients] = useState<Client[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const isLoggedIn = useMemo(() => Boolean(token), [token]);

  async function api(path: string, options?: RequestInit) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers || {}),
      },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || 'Request failed');
    }

    return response.json();
  }

  async function login() {
    try {
      setLoading(true);
      setError('');
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('tmac_token', data.token);
      localStorage.setItem('tmac_user', JSON.stringify(data.user));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setToken('');
    setUser(null);
    setClients([]);
    setSummary(null);
    setSelectedClient(null);
    localStorage.removeItem('tmac_token');
    localStorage.removeItem('tmac_user');
  }

  async function loadData() {
    try {
      setLoading(true);
      setError('');
      const query = new URLSearchParams();
      if (search.trim()) query.set('q', search.trim());
      if (statusFilter) query.set('status', statusFilter);
      const [clientData, dashboardData] = await Promise.all([
        api(`/clients${query.toString() ? `?${query.toString()}` : ''}`),
        api('/dashboard/summary'),
      ]);
      setClients(clientData);
      setSummary(dashboardData);
      if (clientData.length > 0) {
        setSelectedClient((current) => current && clientData.find((c: Client) => c.id === current.id) ? current : clientData[0]);
      } else {
        setSelectedClient(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load CRM data');
    } finally {
      setLoading(false);
    }
  }

  async function createClient(e: FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      await api('/clients', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm(emptyForm);
      setShowCreate(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create client');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token]);

  const statusCount = (status: string) => summary?.statusCounts.find((item) => item.status === status)?.count || 0;

  if (!isLoggedIn) {
    return (
      <div className="login-layout">
        <section className="login-panel">
          <div className="brand-row">
            <img src="/logo.png" alt="TMAC CRM" className="logo large" />
            <div>
              <div className="eyebrow dark">The Money Advice Centre</div>
              <h1>TMAC CRM</h1>
              <p className="subtle">Secure multi-user CRM for teams across offices.</p>
            </div>
          </div>
          <div className="login-form">
            <h2>Sign in</h2>
            <label>Email</label>
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
            <label>Password</label>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <button className="primary" disabled={loading} onClick={login}>{loading ? 'Signing in...' : 'Log in'}</button>
            {error && <p className="error">{error}</p>}
          </div>
        </section>
        <section className="hero-panel">
          <div className="hero-card">
            <span className="tag">Purple + green branded</span>
            <h2>Ready for deployment</h2>
            <p>Use this as your live CRM foundation with user logins, central data, API-ready intake, and multi-office access.</p>
            <ul>
              <li>Secure login required</li>
              <li>Shared central database</li>
              <li>Suitable for different offices and IPs</li>
              <li>Deployable on VPS or app hosting</li>
            </ul>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="TMAC CRM" className="logo" />
          <div>
            <div className="eyebrow">The Money Advice Centre</div>
            <h1>TMAC CRM</h1>
          </div>
        </div>

        <nav className="nav">
          <button className="nav-item active">Dashboard</button>
          <button className="nav-item">Clients</button>
          <button className="nav-item">Tasks</button>
          <button className="nav-item">Reporting</button>
          <button className="nav-item">Admin</button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <strong>{user?.name}</strong>
            <span>{user?.role}</span>
            <small>{user?.email}</small>
          </div>
          <button className="secondary full" onClick={logout}>Log out</button>
        </div>
      </aside>

      <main className="content">
        <header className="page-header">
          <div>
            <h2>Dashboard</h2>
            <p>Latest TMAC client pipeline across your team.</p>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={loadData}>Refresh</button>
            <button className="primary" onClick={() => setShowCreate(true)}>New client</button>
          </div>
        </header>

        {error && <div className="inline-error">{error}</div>}

        <section className="stats-grid">
          <article className="card stat-card"><span>Total clients</span><strong>{summary?.totalClients || 0}</strong></article>
          <article className="card stat-card"><span>New leads</span><strong>{statusCount('NEW_LEAD')}</strong></article>
          <article className="card stat-card"><span>Qualified</span><strong>{statusCount('QUALIFIED')}</strong></article>
          <article className="card stat-card"><span>Open tasks</span><strong>{summary?.totalTasksOpen || 0}</strong></article>
        </section>

        <section className="content-grid">
          <section className="card table-card">
            <div className="table-toolbar">
              <h3>Clients</h3>
              <div className="filters">
                <input placeholder="Search name, email, mobile" value={search} onChange={(event) => setSearch(event.target.value)} />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  <option value="NEW_LEAD">New lead</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="LOST">Lost</option>
                </select>
                <button className="secondary" onClick={loadData}>Apply</button>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Campaign</th>
                    <th>Email</th>
                    <th>Mobile</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.length === 0 ? (
                    <tr>
                      <td colSpan={6}>{loading ? 'Loading...' : 'No clients yet.'}</td>
                    </tr>
                  ) : clients.map((client) => (
                    <tr key={client.id} className={selectedClient?.id === client.id ? 'selected-row' : ''} onClick={() => setSelectedClient(client)}>
                      <td>{client.firstName} {client.lastName}</td>
                      <td><span className="pill">{client.status.replaceAll('_', ' ')}</span></td>
                      <td>{client.source || '-'}</td>
                      <td>{client.campaign || '-'}</td>
                      <td>{client.email || '-'}</td>
                      <td>{client.mobile || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="card detail-card">
            <div className="detail-header">
              <h3>Client snapshot</h3>
              <span className="tag green">Live data</span>
            </div>
            {selectedClient ? (
              <div className="detail-body">
                <h4>{selectedClient.firstName} {selectedClient.lastName}</h4>
                <dl>
                  <dt>Status</dt><dd>{selectedClient.status.replaceAll('_', ' ')}</dd>
                  <dt>Email</dt><dd>{selectedClient.email || '-'}</dd>
                  <dt>Mobile</dt><dd>{selectedClient.mobile || '-'}</dd>
                  <dt>Source</dt><dd>{selectedClient.source || '-'}</dd>
                  <dt>Campaign</dt><dd>{selectedClient.campaign || '-'}</dd>
                </dl>
              </div>
            ) : (
              <p className="subtle">Select a client to see a summary.</p>
            )}
          </aside>
        </section>

        {showCreate && (
          <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
            <div className="modal card" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h3>Create client</h3>
                <button className="ghost" onClick={() => setShowCreate(false)}>×</button>
              </div>
              <form className="modal-form" onSubmit={createClient}>
                <div className="grid-2">
                  <div>
                    <label>First name</label>
                    <input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} required />
                  </div>
                  <div>
                    <label>Last name</label>
                    <input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} required />
                  </div>
                </div>
                <div className="grid-2">
                  <div>
                    <label>Email</label>
                    <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                  </div>
                  <div>
                    <label>Mobile</label>
                    <input value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value })} />
                  </div>
                </div>
                <div className="grid-2">
                  <div>
                    <label>Source</label>
                    <input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} />
                  </div>
                  <div>
                    <label>Campaign</label>
                    <input value={form.campaign} onChange={(event) => setForm({ ...form, campaign: event.target.value })} />
                  </div>
                </div>
                <div>
                  <label>Status</label>
                  <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                    <option value="NEW_LEAD">New lead</option>
                    <option value="CONTACT_ATTEMPTED">Contact attempted</option>
                    <option value="QUALIFIED">Qualified</option>
                    <option value="DOCS_REQUESTED">Docs requested</option>
                    <option value="DOCS_RECEIVED">Docs received</option>
                    <option value="SUBMITTED">Submitted</option>
                    <option value="APPROVED">Approved</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="LOST">Lost</option>
                  </select>
                </div>
                <div className="modal-actions">
                  <button type="button" className="secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button type="submit" className="primary">Save client</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
