import React, { useState, useEffect, useRef } from 'react';

const ALL_PRODUCTS = ['Khoros', 'Jive', 'Gensym', 'Computron', 'DNN'];
const ARR_OPTIONS = [
  { label: 'Any', value: 0 },
  { label: '$100K+', value: 100000 },
  { label: '$250K+', value: 250000 },
  { label: '$500K+', value: 500000 },
  { label: '$1M+', value: 1000000 },
  { label: '$3M+', value: 3000000 },
];
const TOKENS = ['{FirstName}', '{Company}', '{Product}', '{Title}'];

const DEFAULT_MESSAGE = `Hi {FirstName},

Our CEO, Eric Vaughan, will be in the London area for the next few weeks through early May — and given how important the {Company} relationship is to us, I didn't want this moment to pass without finding a way for both of you to connect.

Eric is excited about where {Product} is heading and would love to express that in person — both in terms of our commitment to your partnership and the longer-term product vision we're building together.

Would there be a window in the coming weeks where we could bring you and Eric together, even briefly? We're happy to adjust to your schedule.

Looking forward to it.

Warm regards,
Suuchi Ramesh
Chief Commercial Officer, IgniteTech / Khoros`;

function formatARR(value) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export default function VisitOutreach({ authFetch }) {
  const [location, setLocation] = useState('');
  const [selectedProducts, setSelectedProducts] = useState(new Set(ALL_PRODUCTS));
  const [minARR, setMinARR] = useState(0);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [includeSecondary, setIncludeSecondary] = useState(false);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(null); // { current, total }
  const [searched, setSearched] = useState(false);
  const [draftQueue, setDraftQueue] = useState(null);
  const [draftsSummary, setDraftsSummary] = useState(null);
  const [sentStatus, setSentStatus] = useState({}); // { email: { sent, lastDate } } — cached across filter changes
  const [checkingSent, setCheckingSent] = useState(false);
  const [hidePreviouslyContacted, setHidePreviouslyContacted] = useState(false);
  const sentCacheRef = useRef({}); // session cache so re-filters don't re-query

  async function handleSearch() {
    if (!location.trim()) return;
    setSearching(true);
    setSearched(false);
    setResults([]);
    setSelected(new Set());
    setDraftsSummary(null);

    // 1. Fetch accounts for all selected products
    const allAccounts = [];
    for (const product of selectedProducts) {
      try {
        const url = product === 'Khoros'
          ? '/api/accounts'
          : `/api/accounts-extended?product=${product}`;
        const res = await authFetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        allAccounts.push(...data.map(a => ({ ...a, sourceProduct: product })));
      } catch {}
    }

    // 2. Filter by ARR
    const filtered = allAccounts.filter(a => a.totalARR >= minARR);
    setSearchProgress({ current: 0, total: filtered.length });

    // 3. Search each account via Apollo
    const contacts = [];
    for (let i = 0; i < filtered.length; i++) {
      const account = filtered[i];
      try {
        const res = await authFetch('/api/visit-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyName: account.customerName, location: location.trim() }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.contacts?.length > 0) {
            const product = account.products?.[0] || account.product || account.sourceProduct || 'Unknown';
            for (const c of data.contacts) {
              const dup = contacts.find(x => x.name === c.name && x.accountName === account.customerName);
              if (dup) continue;
              contacts.push({
                ...c,
                id: `${account.id}-${c.name.replace(/\s+/g, '-')}`,
                accountName: account.customerName,
                accountARR: account.totalARR,
                product,
                verified: !!(c.email && !c.email.includes('*')),
                isPrimary: i === 0 || data.contacts.indexOf(c) === 0,
              });
            }
          }
        }
      } catch {}
      setSearchProgress({ current: i + 1, total: filtered.length });
      // 200ms delay between calls
      if (i < filtered.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // 4. Sort by ARR and finalize
    contacts.sort((a, b) => b.accountARR - a.accountARR);
    setResults(includeSecondary ? contacts : contacts.filter((c, idx, arr) => {
      // Keep only first contact per account (most senior)
      return arr.findIndex(x => x.accountName === c.accountName) === idx;
    }));
    setSearching(false);
    setSearchProgress(null);
    setSearched(true);
  }

  // After results load, check Gmail sent folder for each contact (non-blocking)
  useEffect(() => {
    if (!searched || results.length === 0) return;
    const emails = results
      .map(c => c.email)
      .filter(e => e && !e.includes('*') && !sentCacheRef.current[e]);
    if (emails.length === 0) {
      // All already cached — apply cache to state
      setSentStatus({ ...sentCacheRef.current });
      return;
    }
    setCheckingSent(true);
    authFetch('/api/check-sent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.results) {
          const merged = { ...sentCacheRef.current, ...data.results };
          sentCacheRef.current = merged;
          setSentStatus(merged);
        }
      })
      .catch(() => {})
      .finally(() => setCheckingSent(false));
  }, [searched, results]);

  // Filter results by "hide previously contacted"
  const displayResults = hidePreviouslyContacted
    ? results.filter(c => !sentStatus[c.email]?.sent)
    : results;

  function toggleProduct(product) {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (next.has(product)) next.delete(product); else next.add(product);
      return next;
    });
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() { setSelected(new Set(displayResults.map(r => r.id))); }
  function deselectAll() { setSelected(new Set()); }
  function insertToken(token) { setMessage(prev => prev + token); }

  function personalizeMessage(msg, contact) {
    return msg
      .replace(/\{FirstName\}/g, contact.name?.split(' ')[0] || '')
      .replace(/\{Company\}/g, contact.accountName || '')
      .replace(/\{Product\}/g, (['Care','Community','Marketing'].includes(contact.product) ? 'Khoros ' : '') + (contact.product || ''))
      .replace(/\{Title\}/g, contact.title || '');
  }

  function openGmailCompose(contact) {
    const subject = `Eric Vaughan is visiting — wanted to connect you both`;
    const body = personalizeMessage(message, contact);
    const url = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(contact.email || '')}&cc=${encodeURIComponent('megan.anderson@ignitetech.ai')}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank');
  }

  function handleStartBatch() {
    const contacts = results.filter(r => selected.has(r.id));
    const withEmail = contacts.filter(c => c.email && !c.email.includes('*'));
    const noEmail = contacts.filter(c => !c.email || c.email.includes('*'));
    setDraftsSummary(null);
    setDraftQueue({ contacts: withEmail, current: 0, skipped: noEmail.map(c => c.name) });
  }

  function handleNextDraft() {
    if (!draftQueue || draftQueue.current >= draftQueue.contacts.length) return;
    const c = draftQueue.contacts[draftQueue.current];
    openGmailCompose(c);
    const next = draftQueue.current + 1;
    if (next >= draftQueue.contacts.length) {
      // Done
      setDraftsSummary({ created: draftQueue.contacts.length, skipped: draftQueue.skipped, failed: 0 });
      setDraftQueue(null);
    } else {
      setDraftQueue({ ...draftQueue, current: next });
    }
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* ── Left: Filters & Compose ── */}
      <div style={{
        width: 380, flexShrink: 0, padding: 24, overflowY: 'auto',
        borderRight: '1px solid var(--border)', background: 'var(--white)',
      }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>City or Region</label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. London, Paris, New York"
          style={{
            width: '100%', height: 38, padding: '0 12px', borderRadius: 6,
            border: '1px solid var(--border)', fontSize: 14, fontFamily: 'inherit',
            marginBottom: 4, outline: 'none',
          }}
        />
        <div style={{ fontSize: 10, color: 'var(--text-light)', marginBottom: 16 }}>Location data sourced from Apollo</div>

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Products</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {ALL_PRODUCTS.map(p => (
            <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedProducts.has(p)} onChange={() => toggleProduct(p)} />
              {p}
            </label>
          ))}
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Minimum ARR</label>
        <select
          value={minARR}
          onChange={(e) => setMinARR(Number(e.target.value))}
          style={{
            width: '100%', height: 36, padding: '0 8px', borderRadius: 6,
            border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit',
            marginBottom: 16, outline: 'none',
          }}
        >
          {ARR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={includeSecondary} onChange={(e) => setIncludeSecondary(e.target.checked)} />
          Show all contacts per account (not just top match)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 20, cursor: 'pointer' }}>
          <input type="checkbox" checked={hidePreviouslyContacted} onChange={(e) => setHidePreviouslyContacted(e.target.checked)} />
          Hide previously contacted
        </label>

        <button
          onClick={handleSearch}
          disabled={searching || !location.trim()}
          style={{
            width: '100%', height: 40, borderRadius: 8, border: 'none',
            background: searching ? '#94A3B8' : 'var(--teal-bright)', color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: searching ? 'default' : 'pointer',
            fontFamily: 'inherit', marginBottom: 24,
          }}
        >
          {searching ? 'Searching...' : 'Find Contacts'}
        </button>

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Compose your outreach message</label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {TOKENS.map(t => (
            <button
              key={t}
              onClick={() => insertToken(t)}
              style={{
                padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)',
                background: 'var(--hover)', fontSize: 11, fontFamily: 'monospace',
                cursor: 'pointer', color: 'var(--teal-bright)',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={10}
          style={{
            width: '100%', padding: 12, borderRadius: 6,
            border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit',
            lineHeight: 1.5, resize: 'vertical', outline: 'none',
          }}
        />
      </div>

      {/* ── Right: Results ── */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto', background: 'var(--gray-bg)' }}>
        {searching && searchProgress ? (
          <div style={{ textAlign: 'center', marginTop: 80 }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>
              Searching &amp; enriching contacts in "{location}"...
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {searchProgress.current} of {searchProgress.total} accounts checked (revealing emails)
            </div>
            <div style={{
              width: 300, height: 6, background: 'var(--border)', borderRadius: 3,
              margin: '12px auto 0', overflow: 'hidden',
            }}>
              <div style={{
                width: `${(searchProgress.current / searchProgress.total) * 100}%`,
                height: '100%', background: 'var(--teal-bright)', borderRadius: 3,
                transition: 'width 200ms',
              }} />
            </div>
            {results.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--teal-bright)', marginTop: 8, fontWeight: 600 }}>
                {results.length} contact{results.length !== 1 ? 's' : ''} found so far
              </div>
            )}
          </div>
        ) : !searched ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 80 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📍</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Enter a location and click "Find Contacts"</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Searches all {selectedProducts.size > 0 ? [...selectedProducts].join(', ') : 'selected'} accounts via Apollo in real time</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {displayResults.length} contact{displayResults.length !== 1 ? 's' : ''} found in "{location}"
                {checkingSent && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>Checking sent history...</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={selectAll} style={{ fontSize: 12, border: 'none', background: 'none', color: 'var(--teal-bright)', cursor: 'pointer', fontWeight: 600 }}>Select All</button>
                <button onClick={deselectAll} style={{ fontSize: 12, border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Deselect All</button>
              </div>
            </div>

            {selected.size > 0 && !draftQueue && !draftsSummary && (
              <div style={{ marginBottom: 16 }}>
                <button
                  onClick={handleStartBatch}
                  style={{
                    padding: '10px 20px', borderRadius: 8, border: 'none',
                    background: 'var(--teal-bright)', color: '#fff', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Generate Gmail Drafts for {selected.size} Selected
                </button>
              </div>
            )}

            {draftQueue && (
              <div style={{ marginBottom: 16, padding: '16px', background: 'var(--teal-bright-10)', borderRadius: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--teal-bright)', marginBottom: 8 }}>
                  Draft {draftQueue.current + 1} of {draftQueue.contacts.length}: {draftQueue.contacts[draftQueue.current]?.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Click the button below to open Gmail compose for this contact. Then come back and click again for the next one.
                </div>
                <button
                  onClick={handleNextDraft}
                  style={{
                    padding: '10px 24px', borderRadius: 8, border: 'none',
                    background: 'var(--teal-bright)', color: '#fff', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Open Gmail Draft for {draftQueue.contacts[draftQueue.current]?.name} →
                </button>
                <div style={{
                  marginTop: 8, height: 4, background: 'rgba(0,169,157,.2)', borderRadius: 2, overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${((draftQueue.current) / draftQueue.contacts.length) * 100}%`,
                    height: '100%', background: 'var(--teal-bright)', borderRadius: 2,
                  }} />
                </div>
              </div>
            )}

            {draftsSummary && (
              <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f0fdf4', borderRadius: 8, fontSize: 13 }}>
                <strong>{draftsSummary.created} Gmail compose window{draftsSummary.created !== 1 ? 's' : ''} opened.</strong>
                {draftsSummary.skipped.length > 0 && (
                  <div style={{ marginTop: 6, color: 'var(--amber)', fontSize: 12 }}>
                    Skipped (no email): {draftsSummary.skipped.join(', ')}
                  </div>
                )}
                <button
                  onClick={() => { setDraftsSummary(null); setDraftQueue(null); }}
                  style={{ marginTop: 8, fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, padding: '4px 12px', background: 'var(--white)', cursor: 'pointer' }}
                >
                  Done
                </button>
              </div>
            )}

            {displayResults.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40, fontSize: 14 }}>
                No contacts found in "{location}" matching your filters. Try a different location or lower the ARR threshold.
              </div>
            ) : (
              <div style={{ background: 'var(--white)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--hover)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', width: 32 }}></th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Name & Title</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Company</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>ARR</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Location</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center' }}>Email</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center' }}>LinkedIn</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center' }}>Gmail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayResults.map(c => {
                      const sent = sentStatus[c.email];
                      return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ fontWeight: 600 }}>
                            {c.name}
                            {sent?.sent && (
                              <span
                                title={`Last emailed: ${sent.lastDate || 'unknown date'}`}
                                style={{
                                  marginLeft: 8, fontSize: 10, fontWeight: 600,
                                  color: '#d97706', background: 'rgba(217,119,6,.1)',
                                  padding: '2px 6px', borderRadius: 4, cursor: 'default',
                                }}
                              >
                                ✉ Previously sent
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.title}</div>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <div>{c.accountName}</div>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                            background: 'var(--teal-bright-10)', color: 'var(--teal-bright)',
                          }}>{c.product}</span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{formatARR(c.accountARR)}</td>
                        <td style={{ padding: '8px 12px', fontSize: 12 }}>
                          {c.city || c.country ? (
                            <>{c.city}{c.city && c.country ? ', ' : ''}{c.country}</>
                          ) : (
                            <span style={{ color: 'var(--text-light)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          {c.email && !c.email.includes('*') ? (
                            <span title={c.email} style={{ color: '#22c55e' }}>✓</span>
                          ) : c.hasEmail ? (
                            <span title="Email available (needs reveal)" style={{ color: 'var(--amber)' }}>⚠</span>
                          ) : (
                            <span style={{ color: 'var(--text-light)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          {c.linkedinUrl ? (
                            <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal-bright)', fontSize: 12 }}>
                              Profile
                            </a>
                          ) : (
                            <span style={{ color: 'var(--text-light)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          {c.email && !c.email.includes('*') ? (
                            <button
                              onClick={() => openGmailCompose(c)}
                              style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', background: 'var(--white)', cursor: 'pointer', color: 'var(--teal-bright)' }}
                            >
                              Compose
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-light)' }}>—</span>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
