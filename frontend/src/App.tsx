import { useMemo, useState } from 'react';

type Client = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  mobile?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  county?: string | null;
  postcode?: string | null;
  status: string;
  source?: string | null;
  campaign?: string | null;
  createdAt: string;
};

type View = 'dashboard' | 'clients' | 'tasks' | 'reporting' | 'admin';

const API_URL = 'https://tmac-crm-api.onrender.com';

const emptyClientForm = {
  firstName: '',
  lastName: '',
  email: '',
  mobile: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  county: '',
  postcode: '',
  source: '',
  campaign: '',
  status: 'NEW_LEAD',
};

export default function App() {
  const [token, setToken] = useState<string>('');
  const [email, setEmail] = useState('admin@tmaccrm.local');
  const [password, setPassword] = useState('ChangeMe123!');
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [view, setView] = useState<View>('dashboard');
  const [search, setSearch] = useState('');
  const [showAddClient, setShowAddClient] = useState(false);
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyClientForm);

  const isLoggedIn = useMemo(() => Boolean(token), [token]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return clients;

    return clients.filter((client) => {
      const haystack = [
        client.firstName,
        client.lastName,
        client.email || '',
        client.mobile || '',
        client.postcode || '',
        client.status || '',
        client.source || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [clients, search]);

  async function login() {
    setError('');
    setSuccess('');

    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      setError('Login failed. Please check your email and password.');
      return;
    }

    const data = await response.json();
    setToken(data.token);
    await loadClients(data.token);
    setView('dashboard');
  }

  async function loadClients(activeToken = token) {
    const response = await fetch(`${API_URL}/clients`, {
      headers: { Authorization: `Bearer ${activeToken}` },
    });

    if (!response.ok) {
      setError('Could not load clients.');
      return;
    }

    const data = await response.json();
    setClients(data);

    if (selectedClientId) {
      const refreshedSelected = data.find((client: Client) => client.id === selectedClientId);
      if (refreshedSelected) {
        populateEditForm(refreshedSelected);
      }
    }
  }

  function populateEditForm(client: Client) {
    setEditForm({
      firstName: client.firstName || '',
      lastName: client.lastName || '',
      email: client.email || '',
      mobile: client.mobile || '',
      addressLine1: client.addressLine1 || '',
      addressLine2: client.addressLine2 || '',
      city: client.city || '',
      county: client.county || '',
      postcode: client.postcode || '',
      source: client.source || '',
      campaign: client.campaign || '',
      status: client.status || 'NEW_LEAD',
    });
  }

  function openClient(client: Client) {
    setSelectedClientId(client.id);
    populateEditForm(client);
    setShowAddClient(false);
    setSuccess('');
    setError('');
  }

  async function createClient() {
    setError('');
    setSuccess('');

    const response = await fetch(`${API_URL}/clients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(clientForm),
    });

    if (!response.ok) {
      setError('Could not create client.');
      return;
    }

    setClientForm(emptyClientForm);
    setShowAddClient(false);
    await loadClients();
    setView('clients');
    setSuccess('Client created successfully.');
  }

  async function saveClientChanges() {
    if (!selectedClientId) return;

    setError('');
    setSuccess('');

    const response = await fetch(`${API_URL}/clients/${selectedClientId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(editForm),
    });

    if (!response.ok) {
      setError('Could not update client.');
      return;
    }

    await loadClients();
    setSuccess('Client updated successfully.');
  }

  async function deleteClient(id: string, fullName: string) {
    const confirmed = window.confirm(`Delete ${fullName}? This cannot be undone.`);
    if (!confirmed) return;

    const response = await fetch(`${API_URL}/clients/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      setError('Could not delete client.');
      return;
    }

    if (selectedClientId === id) {
      setSelectedClientId(null);
      setEditForm(emptyClientForm);
    }

    await loadClients();
    setSuccess('Client deleted successfully.');
  }

  function updateClientForm(field: keyof typeof emptyClientForm, value: string) {
    setClientForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function updateEditForm(field: keyof typeof emptyClientForm, value: string) {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleDateString('en-GB');
  }

  function renderDashboard() {
    return (
      <>
        <header className="page-header">
          <div>
            <h2>Dashboard</h2>
            <p>Multi-user CRM foundation for TMAC teams across offices.</p>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={() => loadClients()}>
              Refresh data
            </button>
            <button
              className="primary"
              onClick={() => {
                setShowAddClient(true);
                setSelectedClientId(null);
                setView('clients');
              }}
            >
              Add client
            </button>
          </div>
        </header>

        <section className="stats-grid">
          <div className="card stat-card">
            <span>Total clients</span>
            <strong>{clients.length}</strong>
          </div>
          <div className="card stat-card">
            <span>New leads</span>
            <strong>{clients.filter((c) => c.status === 'NEW_LEAD').length}</strong>
          </div>
          <div className="card stat-card">
            <span>Qualified</span>
            <strong>{clients.filter((c) => c.status === 'QUALIFIED').length}</strong>
          </div>
          <div className="card stat-card">
            <span>Submitted</span>
            <strong>{clients.filter((c) => c.status === 'SUBMITTED').length}</strong>
          </div>
        </section>
      </>
    );
  }

  function renderClientEditPanel() {
    if (!selectedClient) {
      return (
        <section className="card form-card">
          <h3>Client details</h3>
          <p>Select a client from the list to view and amend their record.</p>
        </section>
      );
    }

    return (
      <section className="card form-card">
        <div className="table-header">
          <div>
            <h3>
              {selectedClient.firstName} {selectedClient.lastName}
            </h3>
            <p className="muted-text">Date added: {formatDate(selectedClient.createdAt)}</p>
          </div>
          <button
            className="danger-button"
            onClick={() =>
              deleteClient(
                selectedClient.id,
                `${selectedClient.firstName} ${selectedClient.lastName}`
              )
            }
          >
            Delete client
          </button>
        </div>

        <div className="form-grid">
          <div>
            <label>First name</label>
            <input
              value={editForm.firstName}
              onChange={(e) => updateEditForm('firstName', e.target.value)}
            />
          </div>

          <div>
            <label>Last name</label>
            <input
              value={editForm.lastName}
              onChange={(e) => updateEditForm('lastName', e.target.value)}
            />
          </div>

          <div>
            <label>Email</label>
            <input
              value={editForm.email}
              onChange={(e) => updateEditForm('email', e.target.value)}
            />
          </div>

          <div>
            <label>Mobile</label>
            <input
              value={editForm.mobile}
              onChange={(e) => updateEditForm('mobile', e.target.value)}
            />
          </div>

          <div className="full-width">
            <label>Address line 1</label>
            <input
              value={editForm.addressLine1}
              onChange={(e) => updateEditForm('addressLine1', e.target.value)}
            />
          </div>

          <div className="full-width">
            <label>Address line 2</label>
            <input
              value={editForm.addressLine2}
              onChange={(e) => updateEditForm('addressLine2', e.target.value)}
            />
          </div>

          <div>
            <label>City / Town</label>
            <input
              value={editForm.city}
              onChange={(e) => updateEditForm('city', e.target.value)}
            />
          </div>

          <div>
            <label>County</label>
            <input
              value={editForm.county}
              onChange={(e) => updateEditForm('county', e.target.value)}
            />
          </div>

          <div>
            <label>Postcode</label>
            <input
              value={editForm.postcode}
              onChange={(e) => updateEditForm('postcode', e.target.value)}
            />
          </div>

          <div>
            <label>Status</label>
            <select
              value={editForm.status}
              onChange={(e) => updateEditForm('status', e.target.value)}
            >
              <option value="NEW_LEAD">New Lead</option>
              <option value="CONTACT_ATTEMPTED">Contact Attempted</option>
              <option value="QUALIFIED">Qualified</option>
              <option value="DOCS_REQUESTED">Docs Requested</option>
              <option value="DOCS_RECEIVED">Docs Received</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="COMPLETED">Completed</option>
              <option value="LOST">Lost</option>
            </select>
          </div>

          <div>
            <label>Source</label>
            <input
              value={editForm.source}
              onChange={(e) => updateEditForm('source', e.target.value)}
            />
          </div>

          <div>
            <label>Campaign</label>
            <input
              value={editForm.campaign}
              onChange={(e) => updateEditForm('campaign', e.target.value)}
            />
          </div>
        </div>

        <div className="form-actions">
          <button className="secondary" onClick={() => populateEditForm(selectedClient)}>
            Reset changes
          </button>
          <button className="primary" onClick={saveClientChanges}>
            Save changes
          </button>
        </div>
      </section>
    );
  }

  function renderClients() {
    return (
      <>
        <header className="page-header">
          <div>
            <h2>Clients</h2>
            <p>View, add, edit and delete client records.</p>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={() => loadClients()}>
              Refresh list
            </button>
            <button
              className="primary"
              onClick={() => {
                setShowAddClient((prev) => !prev);
                setSelectedClientId(null);
                setSuccess('');
                setError('');
              }}
            >
              {showAddClient ? 'Close form' : 'Add client'}
            </button>
          </div>
        </header>

        {showAddClient && (
          <section className="card form-card">
            <div className="table-header">
              <h3>Add client</h3>
            </div>

            <div className="form-grid">
              <div>
                <label>First name</label>
                <input
                  value={clientForm.firstName}
                  onChange={(e) => updateClientForm('firstName', e.target.value)}
                />
              </div>

              <div>
                <label>Last name</label>
                <input
                  value={clientForm.lastName}
                  onChange={(e) => updateClientForm('lastName', e.target.value)}
                />
              </div>

              <div>
                <label>Email</label>
                <input
                  value={clientForm.email}
                  onChange={(e) => updateClientForm('email', e.target.value)}
                />
              </div>

              <div>
                <label>Mobile</label>
                <input
                  value={clientForm.mobile}
                  onChange={(e) => updateClientForm('mobile', e.target.value)}
                />
              </div>

              <div className="full-width">
                <label>Address line 1</label>
                <input
                  value={clientForm.addressLine1}
                  onChange={(e) => updateClientForm('addressLine1', e.target.value)}
                />
              </div>

              <div className="full-width">
                <label>Address line 2</label>
                <input
                  value={clientForm.addressLine2}
                  onChange={(e) => updateClientForm('addressLine2', e.target.value)}
                />
              </div>

              <div>
                <label>City / Town</label>
                <input
                  value={clientForm.city}
                  onChange={(e) => updateClientForm('city', e.target.value)}
                />
              </div>

              <div>
                <label>County</label>
                <input
                  value={clientForm.county}
                  onChange={(e) => updateClientForm('county', e.target.value)}
                />
              </div>

              <div>
                <label>Postcode</label>
                <input
                  value={clientForm.postcode}
                  onChange={(e) => updateClientForm('postcode', e.target.value)}
                />
              </div>

              <div>
                <label>Status</label>
                <select
                  value={clientForm.status}
                  onChange={(e) => updateClientForm('status', e.target.value)}
                >
                  <option value="NEW_LEAD">New Lead</option>
                  <option value="CONTACT_ATTEMPTED">Contact Attempted</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="DOCS_REQUESTED">Docs Requested</option>
                  <option value="DOCS_RECEIVED">Docs Received</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="APPROVED">Approved</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="LOST">Lost</option>
                </select>
              </div>

              <div>
                <label>Source</label>
                <input
                  value={clientForm.source}
                  onChange={(e) => updateClientForm('source', e.target.value)}
                />
              </div>

              <div>
                <label>Campaign</label>
                <input
                  value={clientForm.campaign}
                  onChange={(e) => updateClientForm('campaign', e.target.value)}
                />
              </div>
            </div>

            <div className="form-actions">
              <button className="secondary" onClick={() => setClientForm(emptyClientForm)}>
                Clear
              </button>
              <button className="primary" onClick={createClient}>
                Save client
              </button>
            </div>
          </section>
        )}

        <section className="clients-layout">
          <section className="card table-card">
            <div className="table-header">
              <h3>Client list</h3>
              <div className="table-tools">
                <input
                  className="search-input"
                  placeholder="Search by name, email, mobile or postcode"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span>{filteredClients.length} records</span>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Mobile</th>
                  <th>Postcode</th>
                  <th>Status</th>
                  <th>Date Added</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No clients found.</td>
                  </tr>
                ) : (
                  filteredClients.map((client) => (
                    <tr
                      key={client.id}
                      className={`clickable-row ${
                        selectedClientId === client.id ? 'selected-row' : ''
                      }`}
                      onClick={() => openClient(client)}
                    >
                      <td>
                        <div className="client-name-cell">
                          <strong>
                            {client.firstName} {client.lastName}
                          </strong>
                          <span>
                            {client.addressLine1 || client.city || client.county
                              ? [client.addressLine1, client.city, client.county]
                                  .filter(Boolean)
                                  .join(', ')
                              : '-'}
                          </span>
                        </div>
                      </td>
                      <td>{client.email || '-'}</td>
                      <td>{client.mobile || '-'}</td>
                      <td>{client.postcode || '-'}</td>
                      <td>
                        <span className="pill">{client.status.replaceAll('_', ' ')}</span>
                      </td>
                      <td>{formatDate(client.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          {renderClientEditPanel()}
        </section>
      </>
    );
  }

  function renderPlaceholder(title: string) {
    return (
      <section className="card placeholder-card">
        <h2>{title}</h2>
        <p>This section is next to be built out.</p>
      </section>
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
          <button
            className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`nav-item ${view === 'clients' ? 'active' : ''}`}
            onClick={() => setView('clients')}
          >
            Clients
          </button>
          <button
            className={`nav-item ${view === 'tasks' ? 'active' : ''}`}
            onClick={() => setView('tasks')}
          >
            Tasks
          </button>
          <button
            className={`nav-item ${view === 'reporting' ? 'active' : ''}`}
            onClick={() => setView('reporting')}
          >
            Reporting
          </button>
          <button
            className={`nav-item ${view === 'admin' ? 'active' : ''}`}
            onClick={() => setView('admin')}
          >
            Admin
          </button>

          {isLoggedIn && (
            <button
              className="nav-item logout-item"
              onClick={() => {
                setToken('');
                setClients([]);
                setSelectedClientId(null);
                setView('dashboard');
                setError('');
                setSuccess('');
              }}
            >
              Log out
            </button>
          )}
        </nav>
      </aside>

      <main className="content">
        {!isLoggedIn ? (
          <section className="card login-card">
            <h2>Secure Login</h2>
            <p>Sign in to TMAC CRM</p>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="primary" onClick={login}>
              Log in
            </button>
            {error && <p className="error">{error}</p>}
          </section>
        ) : (
          <>
            {error && <p className="error inline-error">{error}</p>}
            {success && <p className="success inline-success">{success}</p>}

            {view === 'dashboard' && renderDashboard()}
            {view === 'clients' && renderClients()}
            {view === 'tasks' && renderPlaceholder('Tasks')}
            {view === 'reporting' && renderPlaceholder('Reporting')}
            {view === 'admin' && renderPlaceholder('Admin')}
          </>
        )}
      </main>
    </div>
  );
}
