import React, { useState, useEffect, useMemo, useRef } from 'react';
import AccountList from './components/AccountList';
import ContactCard from './components/ContactCard';
import EmailDraft from './components/EmailDraft';
import VisitOutreach from './components/VisitOutreach';

const PLATFORM_TABS = ['Khoros', 'Jive', 'Gensym', 'Computron', 'DNN'];
const PRODUCT_FILTERS = ['All', 'Care', 'Community', 'Marketing'];
const STATUS_FILTERS = ['All', 'Active', 'Partial'];

const KHOROS_SUBPRODUCTS = new Set(['Care', 'Community', 'Marketing', 'Platform', 'Unknown']);
const EXTENDED_PRODUCT_DESC = {
  Jive: 'enterprise intranet and internal communications',
  Gensym: 'AI and expert systems for industrial automation',
  Computron: 'enterprise financial management',
  DNN: 'web content management and digital experience',
};

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

const IS_DEV = !GOOGLE_CLIENT_ID;

// ── Dev Password Gate (local development only) ───────────────────
function DevPasswordGate({ onAuth }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setChecking(true);
    setError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem('dev_auth', 'true');
        onAuth({ email: 'dev@ignitetech.com', name: 'Dev User' });
      } else {
        setError('Incorrect password');
        setPassword('');
      }
    } catch {
      setError('Connection error');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '100vw', height: '100vh', background: '#0D4B5E',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)',
        borderRadius: 12, padding: '48px 40px', width: 360, textAlign: 'center',
      }}>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Executive Intelligence</h1>
        <div style={{ color: '#CBD5E1', fontSize: 14, marginBottom: 28 }}>Local Development</div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          autoFocus
          style={{
            width: '100%', height: 44, padding: '0 16px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)',
            color: '#fff', fontSize: 15, outline: 'none', fontFamily: 'inherit',
            marginBottom: 12,
          }}
        />
        {error && <div style={{ color: '#F87171', fontSize: 13, marginBottom: 8 }}>{error}</div>}
        <button type="submit" disabled={checking} style={{
          width: '100%', height: 44, borderRadius: 8, border: 'none',
          background: '#00A99D', color: '#fff', fontSize: 15, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', opacity: checking ? 0.6 : 1,
        }}>
          {checking ? 'Checking...' : 'Enter'}
        </button>
      </form>
    </div>
  );
}

// ── Google Sign-In Gate (production) ─────────────────────────────
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
    // Dev mode: check sessionStorage
    if (IS_DEV) return sessionStorage.getItem('dev_auth') === 'true';
    // Production: check JWT expiry
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
    if (IS_DEV && sessionStorage.getItem('dev_auth') === 'true') {
      return { email: 'dev@ignitetech.com', name: 'Dev User' };
    }
    try { return JSON.parse(localStorage.getItem('session_user')); }
    catch { return null; }
  });

  function handleSignOut() {
    if (IS_DEV) {
      sessionStorage.removeItem('dev_auth');
    } else {
      localStorage.removeItem('session_token');
      localStorage.removeItem('session_user');
      window.google?.accounts?.id?.disableAutoSelect();
    }
    setAuthed(false);
    setUser(null);
  }

  if (!authed) {
    const SignInGate = IS_DEV ? DevPasswordGate : GoogleSignIn;
    return <SignInGate onAuth={(u) => { setAuthed(true); setUser(u); }} />;
  }

  return <MainApp user={user} onSignOut={handleSignOut} />;
}

function MainApp({ user, onSignOut }) {
  const [mode, setMode] = useState('accounts'); // 'accounts' | 'visit-outreach'
  const [activePlatform, setActivePlatform] = useState('Khoros');
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
  }, [activePlatform]);

  function handlePlatformChange(platform) {
    if (platform === activePlatform) return;
    setActivePlatform(platform);
    setSelectedId(null);
    setActiveContact(null);
    setSearch('');
    setFilterProduct('All');
    setFilterStatus('All');
  }

  async function fetchAccounts() {
    setLoading(true);
    setError(null);
    try {
      const url = activePlatform === 'Khoros'
        ? '/api/accounts'
        : `/api/accounts-extended?product=${activePlatform}`;
      const res = await authFetch(url);
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
      const url = activePlatform === 'Khoros'
        ? '/api/accounts/refresh'
        : `/api/accounts-extended?product=${activePlatform}&refresh=1`;
      const method = activePlatform === 'Khoros' ? 'POST' : 'GET';
      const res = await authFetch(url, { method });
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
    if (activePlatform === 'Khoros' && filterProduct !== 'All') {
      list = list.filter((a) => a.products.includes(filterProduct));
    }
    if (filterStatus !== 'All') {
      const statusKey = filterStatus.toLowerCase();
      list = list.filter((a) => {
        const s = (a.status || '').toLowerCase();
        if (statusKey === 'active') return s === 'active' || s === 'is active';
        if (statusKey === 'partial') return s.includes('partial');
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
          accountName: account.customerName,
          accountARR: account.totalARR,
          accountProducts: account.products,
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
    const product = products[0];
    if (EXTENDED_PRODUCT_DESC[product]) {
      return `${product}, our ${EXTENDED_PRODUCT_DESC[product]} platform`;
    }
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
    const isKhoros = products.every(p => KHOROS_SUBPRODUCTS.has(p));
    const brandName = isKhoros ? 'Khoros' : products[0];
    const subject = `${firstName} — ${cleanCompany} + ${brandName}, wanted to connect personally`;
    const body = `Hi ${firstName},

I'm Suuchi Ramesh — I lead the commercial and customer organization at IgniteTech, which owns ${brandName}. I'm reaching out directly because ${cleanCompany} is one of our most important partnerships, and I'd like to use this moment to build the right executive relationship.

We're making real investment in ${platformPhrase} and I'd rather you hear that from me than secondhand. I'm personally committed to making sure ${cleanCompany} gets the full picture.

Would you have 20-30 minutes in the next couple of weeks? I'd welcome the chance to connect.

Best,
Suuchi Ramesh
Chief Customer & Commercial Officer
IgniteTech / Khoros`;
    return { subject, body };
  }

  const currentDraft = activeContact ? getDraftForTarget() : null;

  if (mode === 'visit-outreach') {
    return (
      <div className="app" style={{ flexDirection: 'column' }}>
        <div className="sidebar-header" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1>Executive Intelligence</h1>
              <div className="subtitle">
                IgniteTech / Khoros
                {user && (
                  <>
                    {' · '}
                    <span onClick={onSignOut} style={{ cursor: 'pointer', opacity: 0.6 }} title={user.email}>Sign out</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="mode-tabs">
          <button className="mode-tab" onClick={() => setMode('accounts')}>Account View</button>
          <button className="mode-tab active">Visit Outreach</button>
        </div>
        <VisitOutreach authFetch={authFetch} />
      </div>
    );
  }

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

        {/* Mode tabs */}
        <div className="mode-tabs">
          <button className="mode-tab active">Account View</button>
          <button className="mode-tab" onClick={() => setMode('visit-outreach')}>Visit Outreach</button>
        </div>

        {/* Platform tabs */}
        <div className="platform-tabs">
          {PLATFORM_TABS.map((tab) => (
            <button
              key={tab}
              className={`platform-tab ${activePlatform === tab ? 'active' : ''}`}
              onClick={() => handlePlatformChange(tab)}
            >
              {tab}
            </button>
          ))}
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
          {activePlatform === 'Khoros' && (
            <>
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
            </>
          )}
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
