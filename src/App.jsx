import React, { useState, useEffect, useMemo, useRef } from 'react';
import AccountList from './components/AccountList';
import ContactCard from './components/ContactCard';
import EmailDraft from './components/EmailDraft';

const PRODUCT_FILTERS = ['All', 'Care', 'Community', 'Marketing'];
const STATUS_FILTERS = ['All', 'Active', 'Partial'];

// Injected at build time from GOOGLE_CLIENT_ID env var (see vite.config.js)
// eslint-disable-next-line no-undef
const GOOGLE_CLIENT_ID = __GOOGLE_CLIENT_ID__;

// ── Authenticated fetch wrapper ───────────────────────────────────
function authFetch(url, options = {}) {
  const token = localStorage.getItem('session_token');
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

// ── Google Sign-In Gate ───────────────────────────────────────────
function GoogleSignIn({ onAuth }) {
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const btnRef = useRef(null);
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  useEffect(() => {
    let cancelled = false;

    function tryInit() {
      if (cancelled) return;
      if (!window.google?.accounts?.id) {
        setTimeout(tryInit, 100);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          setChecking(true);
          setError('');
          try {
            const res = await fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: response.credential }),
            });
            const data = await res.json();
            if (data.success) {
              localStorage.setItem('session_token', data.token);
              localStorage.setItem('session_user', JSON.stringify(data.user));
              onAuthRef.current(data.user);
            } else {
              setError(data.error || 'Sign-in failed');
            }
          } catch {
            setError('Connection error');
          } finally {
            setChecking(false);
          }
        },
      });
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'filled_blue',
          size: 'large',
          text: 'signin_with',
          width: 280,
        });
      }
    }

    tryInit();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '100vw', height: '100vh', background: '#0D4B5E',
    }}>
      <div style={{
        background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)',
        borderRadius: 12, padding: '48px 40px', width: 360, textAlign: 'center',
      }}>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Executive Intelligence</h1>
        <div style={{ color: '#CBD5E1', fontSize: 14, marginBottom: 28 }}>IgniteTech / Khoros</div>

        {checking ? (
          <div style={{ color: '#CBD5E1', fontSize: 14 }}>Signing in...</div>
        ) : (
          <div ref={btnRef} style={{ display: 'flex', justifyContent: 'center' }} />
        )}

        {error && <div style={{ color: '#F87171', fontSize: 13, marginTop: 12 }}>{error}</div>}
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => {
    const token = localStorage.getItem('session_token');
    if (!token) return false;
    try {
      let base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const payload = JSON.parse(atob(base64));
      return payload.exp > Date.now() / 1000;
    } catch {
      return false;
    }
  });

  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('session_user')); }
    catch { return null; }
  });

  function handleSignOut() {
    localStorage.removeItem('session_token');
    localStorage.removeItem('session_user');
    window.google?.accounts?.id?.disableAutoSelect();
    setAuthed(false);
    setUser(null);
  }

  if (!authed) {
    return <GoogleSignIn onAuth={(u) => { setAuthed(true); setUser(u); }} />;
  }

  return <MainApp user={user} onSignOut={handleSignOut} />;
}

function MainApp({ user, onSignOut }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('arr');
  const [filterProduct, setFilterProduct] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  // Enrichment state
  const [enriching, setEnriching] = useState(false);
  const [enrichedData, setEnrichedData] = useState({});
  const [verifying, setVerifying] = useState(false);
  const [hunterResults, setHunterResults] = useState({}); // { accountId: { email: status } }

  // Active contact override — when user clicks on an "Other Senior Contact"
  const [activeContact, setActiveContact] = useState(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/accounts');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAccounts(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshAccounts() {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/accounts/refresh', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAccounts(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Filter + sort
  const filtered = useMemo(() => {
    let list = [...accounts];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((a) => a.customerName.toLowerCase().includes(q));
    }
    if (filterProduct !== 'All') {
      list = list.filter((a) => a.products.includes(filterProduct));
    }
    if (filterStatus !== 'All') {
      const statusKey = filterStatus.toLowerCase();
      list = list.filter((a) => {
        if (statusKey === 'active') return a.status === 'active' || a.status === 'is active';
        if (statusKey === 'partial') return a.status.includes('partial');
        return true;
      });
    }

    if (sortBy === 'arr') {
      list.sort((a, b) => b.totalARR - a.totalARR);
    } else if (sortBy === 'name') {
      list.sort((a, b) => a.customerName.localeCompare(b.customerName));
    } else if (sortBy === 'status') {
      list.sort((a, b) => a.status.localeCompare(b.status));
    }

    return list;
  }, [accounts, search, filterProduct, filterStatus, sortBy]);

  const selectedAccount = accounts.find((a) => a.id === selectedId);
  const enrichment = enrichedData[selectedId] || null;

  // Determine the current email target: overridden contact or primary
  // Only set emailTarget if there's a real person with a name (not "No qualified contact found" or null)
  const primaryContact = enrichment?.contact;
  const hasPrimaryContact = primaryContact?.fullName
    && primaryContact.fullName !== 'No qualified contact found'
    && primaryContact.fullName !== 'Unknown'
    && !primaryContact.noContacts;

  const emailTarget = activeContact || (hasPrimaryContact ? {
    fullName: primaryContact.fullName,
    email: primaryContact.email,
    title: primaryContact.title,
  } : null);

  async function handleSelect(account) {
    setSelectedId(account.id);
    setActiveContact(null); // reset override when switching accounts

    if (enrichedData[account.id]) return;

    setEnriching(true);
    try {
      const res = await authFetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: account.customerName,
          products: account.products,
          executivePOC: account.executivePOC,
          executivePOCTitle: account.executivePOCTitle,
          totalARR: account.totalARR,
        }),
      });
      const data = await res.json();

      const draftRes = await authFetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: data.contact?.fullName || 'Executive',
          contactTitle: data.contact?.title || '',
          companyName: account.customerName,
          products: account.products,
        }),
      });
      const draftData = await draftRes.json();

      setEnrichedData((prev) => ({
        ...prev,
        [account.id]: {
          contact: data.contact,
          salesforceSignal: data.salesforceSignal,
          draft: draftData.draft,
          draftSubject: draftData.subject,
        },
      }));

      // Run Hunter.io verification for unverified emails (fire-and-forget)
      const allContacts = [
        data.contact,
        ...(data.contact?.allCandidates || []),
        ...(data.contact?.productContacts || []),
      ];
      const unverifiedEmails = allContacts
        .filter((c) => c?.email && !c?.verified)
        .map((c) => c.email)
        .filter((e, i, arr) => arr.indexOf(e) === i); // dedupe

      if (unverifiedEmails.length > 0) {
        setVerifying(true);
        authFetch('/api/verify-emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails: unverifiedEmails }),
        })
          .then((r) => r.json())
          .then((vData) => {
            setHunterResults((prev) => ({ ...prev, [account.id]: vData.results || {} }));
          })
          .catch(() => {})
          .finally(() => setVerifying(false));
      }
    } catch (err) {
      console.error('Enrichment error:', err);
    } finally {
      setEnriching(false);
    }
  }

  function handleContactClick(candidateContact) {
    // When a verified contact in "Other Senior Contacts" is clicked, make them the email target
    setActiveContact({
      fullName: candidateContact.name,
      email: candidateContact.email,
      title: candidateContact.title,
    });
  }

  function stripLegalSuffix(name) {
    return name
      .replace(/\s+(Holdings\s+Group|Holdings\s+LLC|Holdings\s+Inc\.?|Holdings\s+Corp\.?|Holdings)\b\.?/gi, '')
      .replace(/[,\s]+(Inc\.?|Incorporated|Corp\.?|Corporation|LLC|Ltd\.?|Limited|Co\.?|Company|Group|Plc|SA|AG|GmbH)\s*$/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatProductPhrase(products) {
    if (products.length === 1) return `the Khoros ${products[0]} platform`;
    if (products.length === 2) return `the Khoros ${products[0]} and ${products[1]} platforms`;
    return `the Khoros ${products.slice(0, -1).join(', ')}, and ${products[products.length - 1]} platforms`;
  }

  // Generate draft dynamically based on the active email target
  function getDraftForTarget() {
    if (!emailTarget || !selectedAccount) return { subject: '', body: '' };
    const firstName = emailTarget.fullName.split(' ')[0];
    const cleanCompany = stripLegalSuffix(selectedAccount.customerName);
    const products = selectedAccount.products;
    const platformPhrase = formatProductPhrase(products);
    const subject = `${firstName} — ${cleanCompany} + Khoros, wanted to connect personally`;
    const body = `Hi ${firstName},

I'm Suuchi Ramesh — I lead the commercial and customer organization at IgniteTech, which now owns Khoros. I'm reaching out directly because ${cleanCompany} is one of our most important partnerships, and I'd like to use this moment to build the right executive relationship.

We're making real investment in ${platformPhrase} and I'd rather you hear that from me than secondhand. I'm personally committed to making sure ${cleanCompany} gets the full picture.

Would you have 20-30 minutes in the next couple of weeks? I'd welcome the chance to connect.

Best,
Suuchi Ramesh
Chief Customer & Commercial Officer
IgniteTech / Khoros`;
    return { subject, body };
  }

  const currentDraft = activeContact ? getDraftForTarget() : null;

  return (
    <div className="app">
      {/* ── Left Panel ────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1>Executive Intelligence</h1>
              <div className="subtitle">
                IgniteTech / Khoros
                {user && (
                  <>
                    {' · '}
                    <span
                      onClick={onSignOut}
                      style={{ cursor: 'pointer', opacity: 0.6 }}
                      title={user.email}
                    >
                      Sign out
                    </span>
                  </>
                )}
              </div>
            </div>
            <button
              className={`refresh-btn ${loading ? 'spinning' : ''}`}
              onClick={refreshAccounts}
              title="Refresh data"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="search-wrapper">
          <div className="search-input-wrap">
            <span className="search-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              className="search-input"
              type="text"
              placeholder="Search accounts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Filter pills */}
        <div className="filter-row">
          {PRODUCT_FILTERS.map((f) => (
            <button
              key={`p-${f}`}
              className={`filter-pill ${filterProduct === f ? 'active' : ''}`}
              data-filter={f}
              onClick={() => setFilterProduct(f)}
            >
              {f}
            </button>
          ))}
          <span className="filter-divider" />
          {STATUS_FILTERS.map((f) => (
            <button
              key={`s-${f}`}
              className={`filter-pill ${filterStatus === f ? 'active' : ''}`}
              data-filter={f === 'All' ? 'All-status' : f}
              onClick={() => setFilterStatus(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Filter summary */}
        <div style={{
          padding: '8px 20px',
          fontSize: 13,
          fontWeight: 500,
          color: '#94A3B8',
          borderBottom: '1px solid rgba(255,255,255,.06)',
        }}>
          {filtered.length} accounts · ${(filtered.reduce((sum, a) => sum + a.totalARR, 0) / 1_000_000).toFixed(1)}M ARR
        </div>

        {/* Sort + count */}
        <div className="sort-bar">
          <button className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`} onClick={() => setSortBy('name')}>Name</button>
          <button className={`sort-btn ${sortBy === 'arr' ? 'active' : ''}`} onClick={() => setSortBy('arr')}>ARR</button>
          <button className={`sort-btn ${sortBy === 'status' ? 'active' : ''}`} onClick={() => setSortBy('status')}>Status</button>
        </div>

        {loading ? (
          <div className="loading-overlay">
            <div className="spinner" />
            Loading accounts...
          </div>
        ) : error ? (
          <div className="loading-overlay" style={{ color: 'var(--red)' }}>
            {error}
          </div>
        ) : (
          <AccountList
            accounts={filtered}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        )}
      </aside>

      {/* ── Right Panel ───────────────────────────────────────── */}
      <main className="main-panel">
        {!selectedAccount ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p>Select an account to view contact details</p>
          </div>
        ) : enriching && !enrichment ? (
          <div className="loading-overlay" style={{ height: '100%' }}>
            <div className="spinner" />
            Enriching contact for {selectedAccount.customerName}...
          </div>
        ) : (
          <>
            <ContactCard
              account={selectedAccount}
              contact={enrichment?.contact}
              salesforceSignal={enrichment?.salesforceSignal}
              activeContactEmail={activeContact?.email || null}
              onContactClick={handleContactClick}
              hunterResults={hunterResults[selectedId] || {}}
              verifyingEmails={verifying}
            />
            <div className="email-workspace">
              {emailTarget && (
                <EmailDraft
                  key={emailTarget.email || emailTarget.fullName}
                  contact={emailTarget}
                  account={selectedAccount}
                  initialDraft={currentDraft ? currentDraft.body : (enrichment?.draft || '')}
                  initialSubject={currentDraft ? currentDraft.subject : (enrichment?.draftSubject || '')}
                />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
