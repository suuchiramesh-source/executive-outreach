import React, { useState } from 'react';

function formatARR(value) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function statusLabel(status) {
  if (status.includes('partial cancel')) return 'Partial';
  if (status === 'active' || status === 'is active') return 'Active';
  return status;
}

function stripLegalSuffix(name) {
  return name
    .replace(/\s+(Holdings\s+Group|Holdings\s+LLC|Holdings\s+Inc\.?|Holdings\s+Corp\.?|Holdings)\b\.?/gi, '')
    .replace(/[,\s]+(Inc\.?|Incorporated|Corp\.?|Corporation|LLC|Ltd\.?|Limited|Co\.?|Company|Group|Plc|SA|AG|GmbH)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Secondary contacts filtering ──

/**
 * Title seniority levels (lower number = more senior):
 *   Level 1: Chief/C-suite, SVP, EVP, President, Chair, Founder
 *   Level 2: VP, Vice President
 *   Level 3: Director, Senior Director, Head of, Managing Director, General Manager
 *   Level 4: Manager, Senior Manager, Principal, Lead
 */
function getTitleLevel(title) {
  if (!title) return 5;
  const t = title.toLowerCase();
  if (/\bchief\b/.test(t)) return 1;
  if (/\b(ceo|cfo|coo|cto|cmo|cco|cro|cdo)\b/.test(t)) return 1;
  if (/\bpresident\b/.test(t) && !/\bvice\b/.test(t)) return 1;
  if (/\bchair\b/.test(t)) return 1;
  if (/\bfounder\b/.test(t)) return 1;
  if (/\b(evp|executive vice president)\b/.test(t)) return 1;
  if (/\b(svp|senior vice president)\b/.test(t)) return 1;
  if (/\b(vice president|vp)\b/.test(t)) return 2;
  if (/\b(senior director|director|head of|managing director|general manager)\b/.test(t)) return 3;
  if (/\b(manager|senior manager|principal|lead)\b/.test(t)) return 4;
  return 5;
}

const EA_ADMIN_PATTERNS = [
  'executive assistant', 'executive admin', 'business administration to',
  'administrative assistant', 'ea to ', 'assistant to the',
  'executive business admin', 'executive coordinator',
  'chief of staff to', 'personal assistant',
];

function isEATitle(title) {
  const t = (title || '').toLowerCase();
  return EA_ADMIN_PATTERNS.some((p) => t.includes(p));
}

/**
 * Build secondary contacts list with progressive fallback:
 * 1. Strictly lower level than primary
 * 2. Same level as primary (peers)
 * 3. Any contact (excluding primary and EA/admin titles)
 * Never returns empty if Apollo returned >1 contact.
 */
function getSecondaryContacts(allCandidates, primaryNames) {
  if (!allCandidates || allCandidates.length === 0) return [];

  const primaryLower = new Set(primaryNames.map((n) => (n || '').toLowerCase()));

  // Determine the primary's level
  let primaryLevel = 5;
  for (const name of primaryNames) {
    const match = allCandidates.find((c) => (c.name || '').toLowerCase() === (name || '').toLowerCase());
    if (match) {
      const lvl = getTitleLevel(match.title);
      if (lvl < primaryLevel) primaryLevel = lvl;
    }
  }

  // All candidates minus primary and EA/admin titles
  const pool = allCandidates.filter((c) =>
    !primaryLower.has((c.name || '').toLowerCase()) && !isEATitle(c.title)
  );

  const sortByLevel = (a, b) => getTitleLevel(a.title) - getTitleLevel(b.title);

  // Attempt 1: strictly lower level than primary
  let result = pool.filter((c) => getTitleLevel(c.title) > primaryLevel);
  if (result.length > 0) {
    result.sort(sortByLevel);
    return result.slice(0, 10);
  }

  // Attempt 2: same level as primary (peers)
  result = pool.filter((c) => getTitleLevel(c.title) === primaryLevel);
  if (result.length > 0) {
    result.sort(sortByLevel);
    return result.slice(0, 10);
  }

  // Attempt 3: any non-primary, non-EA contact
  if (pool.length > 0) {
    pool.sort(sortByLevel);
    return pool.slice(0, 10);
  }

  return [];
}

// ── LinkedIn helpers ──
/**
 * Email verification badge using Apollo verified flag + Hunter.io results.
 * Apollo verified → green "verified"
 * Hunter "deliverable" → green "verified"
 * Hunter "risky" → amber "risky"
 * Otherwise → grey "unverified"
 */
function EmailVerifyBadge({ email, apolloVerified, hunterResults, domainMismatch }) {
  if (domainMismatch) {
    return (
      <span style={{ color: '#FBBF24', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        ⚠ domain mismatch
      </span>
    );
  }
  if (apolloVerified) {
    return (
      <span style={{ color: '#C8D943', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        verified
      </span>
    );
  }
  const hunterStatus = email && hunterResults ? hunterResults[email] : null;
  if (hunterStatus === 'deliverable') {
    return (
      <span style={{ color: '#C8D943', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        verified
      </span>
    );
  }
  if (hunterStatus === 'risky') {
    return (
      <span style={{ color: '#FBBF24', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        ~ risky
      </span>
    );
  }
  return <span style={{ color: 'rgba(255,255,255,.2)', fontSize: 11 }}>unverified</span>;
}

function LinkedInBadge({ url }) {
  if (!url) return null;
  const isVerified = url.includes('linkedin.com/in/');
  return isVerified ? (
    <span style={{ color: '#C8D943', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      verified
    </span>
  ) : (
    <span style={{ color: 'rgba(255,255,255,.2)', fontSize: 11 }}>unverified</span>
  );
}

function generateConnectNote(contactName, companyName) {
  const firstName = (contactName || '').split(' ')[0];
  const cleanCompany = stripLegalSuffix(companyName);
  const full = `Hi ${firstName}, I'm Suuchi — I lead the commercial and customer org at IgniteTech, which owns Khoros. ${cleanCompany} is one of our most important partnerships and I'd love to connect directly as we invest in the platform.`;
  if (full.length <= 300) return full;
  // Shorten the middle sentence
  const short = `Hi ${firstName}, I'm Suuchi — I lead the commercial and customer org at IgniteTech/Khoros. ${cleanCompany} is a key partnership and I'd love to connect directly.`;
  return short.slice(0, 300);
}

const liSvgSmall = <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z"/></svg>;
const liSvgNormal = <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z"/></svg>;

function LinkedInButton({ url, size, contactName, companyName, onToast, onClick }) {
  const small = size === 'small';
  const btnStyle = small ? { height: 34, fontSize: 13, padding: '0 14px' } : {};
  const icon = small ? liSvgSmall : liSvgNormal;
  const isVerified = url && url.includes('linkedin.com/in/');

  function handleClick(e) {
    if (onClick) onClick(e);
    if (isVerified && contactName && companyName) {
      const note = generateConnectNote(contactName, companyName);
      navigator.clipboard.writeText(note).then(() => {
        if (onToast) onToast('Note copied to clipboard — paste it into LinkedIn\'s connect dialog');
      });
    }
    if (url) {
      e.preventDefault();
      window.open(url, '_blank');
    }
  }

  if (url) {
    return (
      <a
        href={url}
        className="contact-action-btn"
        style={btnStyle}
        onClick={handleClick}
      >
        {icon}
        LinkedIn
        <LinkedInBadge url={url} />
      </a>
    );
  }
  return (
    <span className="contact-action-btn" style={{ ...btnStyle, color: '#475569', borderColor: '#334155', cursor: 'default', opacity: 0.5 }}>
      {icon}
      LinkedIn
    </span>
  );
}

export default function ContactCard({ account, contact, salesforceSignal, activeContactEmail, onContactClick, hunterResults, verifyingEmails }) {
  const [toast, setToast] = useState(null);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  if (!contact) return null;

  // Apollo returned zero contacts — show empty state
  if (contact.noContacts) {
    const searchName = encodeURIComponent(account.customerName);
    return (
      <div className="contact-hero">
        <div className="contact-company" style={{ marginBottom: 16 }}>{account.customerName}</div>
        <div style={{
          padding: '24px',
          background: 'rgba(255,255,255,.06)',
          border: '1px solid rgba(255,255,255,.15)',
          borderRadius: 8,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 15, color: '#E2E8F0', fontWeight: 500, marginBottom: 8 }}>
            Apollo returned no contacts for {account.customerName}.
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginBottom: 16 }}>
            Try searching manually on Apollo.
          </div>
          <a
            href={`https://app.apollo.io/#/people?organizationName=${searchName}`}
            target="_blank"
            rel="noopener noreferrer"
            className="contact-action-btn"
            style={{ display: 'inline-flex', justifyContent: 'center' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Search {account.customerName} on Apollo
          </a>
        </div>
      </div>
    );
  }

  const showConfidence = contact.confidence === 'low' || contact.confidence === 'medium';
  const productContacts = contact.productContacts || [];
  const hasMultipleProductContacts = productContacts.length > 1;
  const tier = contact.tier || 5;

  // Filter secondary candidates by tier exclusions
  // Build secondary contacts list
  const primaryNames = productContacts.map((pc) => pc.fullName);
  if (!hasMultipleProductContacts && contact.fullName) primaryNames.push(contact.fullName);
  const filteredSecondary = getSecondaryContacts(contact.allCandidates || [], primaryNames);

  return (
    <div className="contact-hero">
      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          padding: '12px 20px',
          background: '#0F172A',
          border: '1px solid rgba(200,217,67,.3)',
          borderRadius: 8,
          color: '#C8D943',
          fontSize: 13,
          fontWeight: 500,
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,.3)',
          animation: 'fadeIn 200ms ease',
        }}>
          {toast}
        </div>
      )}

      {/* Missing anchor contact banner */}
      {account.hasAnchorContact === false && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          background: 'rgba(245,158,11,.1)',
          border: '1px solid rgba(245,158,11,.3)',
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 13,
          fontWeight: 500,
          color: '#F59E0B',
        }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          Account team contact missing — please update the ARR Sorted sheet
        </div>
      )}

      {/* Tier badge + employee count */}
      {contact.tierLabel && (
        <div style={{ position: 'absolute', top: 24, left: 48, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,.4)', fontWeight: 500 }}>
          <span style={{
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            background: tier === 1 ? 'rgba(239,68,68,.15)' :
                         tier === 2 ? 'rgba(245,158,11,.15)' :
                         tier === 3 ? 'rgba(59,130,246,.15)' :
                         tier === 4 ? 'rgba(16,185,129,.15)' : 'rgba(148,163,184,.15)',
            color: tier === 1 ? '#F87171' :
                   tier === 2 ? '#FBBF24' :
                   tier === 3 ? '#60A5FA' :
                   tier === 4 ? '#34D399' : '#94A3B8',
          }}>
            Tier {tier} · {contact.tierLabel}
          </span>
          {contact.employeeCount > 0 && (
            <span>~{contact.employeeCount > 1000 ? `${(contact.employeeCount / 1000).toFixed(0)}K` : contact.employeeCount} employees</span>
          )}
        </div>
      )}

      {/* Confidence tag */}
      {showConfidence && (
        <div className={`confidence-tag ${contact.confidence}`}>
          {contact.confidence === 'low' ? '? ' : '~ '}
          {contact.confidence} confidence
        </div>
      )}

      {/* No qualified contact banner for large companies */}
      {contact.noQualifiedContact && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          background: 'rgba(245,158,11,.12)',
          border: '1px solid rgba(245,158,11,.3)',
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 13,
          fontWeight: 500,
          color: '#F59E0B',
        }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          No qualified functional contact found — select manually from contacts below
        </div>
      )}

      {/* Company header */}
      <div style={{ marginBottom: hasMultipleProductContacts ? 16 : 0 }}>
        <div className="contact-company">{account.customerName}</div>
      </div>

      {/* Per-product primary contacts — all clickable for email targeting */}
      {hasMultipleProductContacts ? (
        productContacts.map((pc, idx) => {
          const isActive = activeContactEmail && pc.email === activeContactEmail;
          const isClickable = !!pc.email;
          return (
            <div
              key={idx}
              onClick={isClickable ? () => onContactClick({ name: pc.fullName, email: pc.email, title: pc.title }) : undefined}
              style={{
                padding: '20px 8px',
                borderTop: idx > 0 ? '1px solid rgba(255,255,255,.1)' : 'none',
                cursor: isClickable ? 'pointer' : 'default',
                borderRadius: 6,
                background: isActive ? 'rgba(0,169,157,.12)' : 'transparent',
                borderLeft: isActive ? '3px solid #00A99D' : '3px solid transparent',
                transition: 'background 120ms ease',
              }}
              onMouseOver={(e) => { if (isClickable && !isActive) e.currentTarget.style.background = 'rgba(255,255,255,.04)'; }}
              onMouseOut={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#00A99D',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 8,
              }}>
                {pc.products.join(' & ')} — Primary Contact
                {isActive && <span style={{ color: '#C8D943', marginLeft: 8, fontSize: 10 }}>DRAFTING</span>}
              </div>
              <div className="contact-name" style={{ fontSize: 32 }}>{pc.fullName}</div>
              <div className="contact-title" style={{ fontSize: 16 }}>{pc.title}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                {pc.email && (
                  <span className="contact-action-btn" style={{ height: 34, fontSize: 13, padding: '0 14px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    {pc.email}
                  </span>
                )}
                <LinkedInButton url={pc.linkedinUrl} size="small" contactName={pc.fullName} companyName={account.customerName} onToast={showToast} onClick={(e) => e.stopPropagation()} />
              </div>
            </div>
          );
        })
      ) : (
        <div className="contact-hero-header">
          <div>
            <div className="contact-name">{contact.fullName}</div>
            <div className="contact-title">{contact.title}</div>
            {contact.matchedProduct && (
              <div style={{ fontSize: 13, color: '#00A99D', marginTop: 6, fontWeight: 500 }}>
                Mapped via {contact.matchedProduct} product line
              </div>
            )}
          </div>
        </div>
      )}

      {/* Known POC context */}
      {contact.knownPOC && (
        <div style={{
          padding: '12px 18px',
          background: 'rgba(255,255,255,.08)',
          border: '1px solid rgba(255,255,255,.15)',
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 14,
          color: '#FFFFFF',
        }}>
          <span style={{ color: '#E2E8F0', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Account Team Contact:
          </span>{' '}
          {contact.knownPOC.name}
          {contact.knownPOC.title && (
            <span style={{ color: '#CBD5E1' }}> — {contact.knownPOC.title}</span>
          )}
          {contact.knownPOC.source === 'sheet' && (
            <span style={{
              marginLeft: 8,
              fontSize: 10,
              fontWeight: 600,
              color: '#94A3B8',
              background: 'rgba(148,163,184,.12)',
              padding: '2px 6px',
              borderRadius: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              From Sheet
            </span>
          )}
        </div>
      )}

      {/* Data pills */}
      <div className="data-pills">
        <div className="data-pill">
          <span className="pill-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </span>
          <span className="pill-label">ARR</span>
          <span className="pill-value lime">{formatARR(account.totalARR)}</span>
        </div>

        <div className="data-pill">
          <span className="pill-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 3H8l-2 4h12l-2-4z" />
            </svg>
          </span>
          <span className="pill-label">Products</span>
          <span className="pill-value teal">{account.products.join(', ')}</span>
        </div>

        <div className="data-pill">
          <span className="pill-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </span>
          <span className="pill-label">Status</span>
          <span className="pill-value teal">{statusLabel(account.status)}</span>
        </div>
      </div>

      {/* Action buttons (single-product view only) */}
      {!hasMultipleProductContacts && (
        <div className="contact-actions">
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className="contact-action-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              {contact.email}
            </a>
          ) : (
            <span className="contact-action-btn" style={{ color: '#E2E8F0', borderColor: '#475569', cursor: 'default' }}>
              No email found
            </span>
          )}

          <LinkedInButton url={contact.linkedinUrl} contactName={contact.fullName} companyName={account.customerName} onToast={showToast} />
        </div>
      )}

      {/* Other Senior Contacts */}
      {filteredSecondary.length > 0 && (
        <div style={{
          marginTop: 20,
          padding: '16px 20px',
          background: 'rgba(255,255,255,.06)',
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 8,
          color: 'rgba(255,255,255,.7)',
        }}>
          <div style={{ color: '#E2E8F0', fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            Other Senior Contacts Found
            <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,.4)', textTransform: 'none', letterSpacing: 'normal' }}>
              Click a verified contact to draft an email
            </span>
            {verifyingEmails && (
              <span style={{ fontSize: 11, fontWeight: 400, color: '#FBBF24', textTransform: 'none', letterSpacing: 'normal', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                Verifying emails...
              </span>
            )}
          </div>
          {filteredSecondary.map((c, i) => {
            const hunterStatus = c.email ? hunterResults[c.email] : null;
            const isVerifiedByHunter = hunterStatus === 'deliverable';
            const hasDomainMismatch = !!c.domainMismatch;
            const isClickable = c.email && !hasDomainMismatch && (c.verified || isVerifiedByHunter);
            const isActive = activeContactEmail && c.email === activeContactEmail;
            return (
              <div
                key={i}
                onClick={isClickable ? () => onContactClick(c) : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  padding: '8px 6px',
                  borderBottom: i < filteredSecondary.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none',
                  fontSize: 13,
                  cursor: isClickable ? 'pointer' : 'default',
                  borderRadius: 4,
                  background: isActive ? 'rgba(0,169,157,.15)' : 'transparent',
                  borderLeft: isActive ? '3px solid #00A99D' : '3px solid transparent',
                  transition: 'background 120ms ease',
                }}
                onMouseOver={(e) => { if (isClickable && !isActive) e.currentTarget.style.background = 'rgba(255,255,255,.06)'; }}
                onMouseOut={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Name */}
                <span style={{ fontWeight: 600, color: '#FFFFFF' }}>{c.name}</span>

                <span style={{ color: 'rgba(255,255,255,.4)' }}>—</span>
                <span style={{ color: '#F1F5F9', flex: 1 }}>{c.title}</span>

                {/* Product badge */}
                {c.matchedProduct && (
                  <span style={{
                    color: '#00A99D',
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '2px 8px',
                    background: 'rgba(0,169,157,.1)',
                    borderRadius: 99,
                  }}>
                    {c.matchedProduct}
                  </span>
                )}

                {/* LinkedIn */}
                {c.linkedinUrl ? (
                  <a
                    href={c.linkedinUrl}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const isV = c.linkedinUrl.includes('linkedin.com/in/');
                      if (isV) {
                        const note = generateConnectNote(c.name, account.customerName);
                        navigator.clipboard.writeText(note).then(() => showToast('Note copied to clipboard — paste it into LinkedIn\'s connect dialog'));
                      }
                      window.open(c.linkedinUrl, '_blank');
                    }}
                    style={{ color: '#94A3B8', fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                    onMouseOver={(e) => e.currentTarget.style.color = '#00A99D'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#94A3B8'}
                  >
                    {liSvgSmall}
                    <LinkedInBadge url={c.linkedinUrl} />
                  </a>
                ) : (
                  <span style={{ color: 'rgba(255,255,255,.2)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" opacity="0.3"><path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z"/></svg>
                  </span>
                )}

                {/* Email */}
                {c.email ? (
                  <span style={{ color: '#94A3B8', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    {c.email}
                  </span>
                ) : (
                  <span style={{ color: 'rgba(255,255,255,.25)', fontSize: 12 }}>no email</span>
                )}

                {/* Email verified indicator (Apollo + Hunter) */}
                <EmailVerifyBadge email={c.email} apolloVerified={c.verified} hunterResults={hunterResults} domainMismatch={c.domainMismatch} />
              </div>
            );
          })}
        </div>
      )}

      {/* Salesforce signal */}
      {salesforceSignal && (
        <div className="sf-signal">
          <div className="sf-label">Salesforce Signal</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {salesforceSignal.owner && (
              <div><span style={{ color: 'rgba(255,255,255,.4)' }}>Owner:</span> {salesforceSignal.owner}</div>
            )}
            {salesforceSignal.industry && (
              <div><span style={{ color: 'rgba(255,255,255,.4)' }}>Industry:</span> {salesforceSignal.industry}</div>
            )}
            {salesforceSignal.annualRevenue && (
              <div><span style={{ color: 'rgba(255,255,255,.4)' }}>Revenue:</span> ${salesforceSignal.annualRevenue.toLocaleString()}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
