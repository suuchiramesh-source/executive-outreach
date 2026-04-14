import React from 'react';

const KHOROS_SUBS = new Set(['Care', 'Community', 'Marketing', 'Platform', 'Unknown']);
function formatProductLabel(p) {
  return KHOROS_SUBS.has(p) ? `Khoros ${p}` : p;
}

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

function statusClass(status) {
  if (status.includes('partial')) return 'partial';
  return 'active';
}

export default function AccountList({ accounts, selectedId, onSelect }) {
  return (
    <div className="account-list">
      {accounts.map((account) => (
        <div
          key={account.id}
          className={`account-item ${account.id === selectedId ? 'active' : ''}`}
          onClick={() => onSelect(account)}
        >
          <div className="account-name">
            {account.customerName}
            {account.reseller && (
              <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: '#94A3B8', marginTop: 1 }}>
                via {account.reseller}
              </span>
            )}
          </div>
          <div className="account-meta">
            <span className="arr-value">{formatARR(account.totalARR)}</span>
            <span className={`status-badge ${statusClass(account.status)}`}>
              {statusLabel(account.status)}
            </span>
          </div>
          {account.executivePOC && (
            <div className="account-poc">{account.executivePOC}</div>
          )}
          <div className="product-badges">
            {account.products.map((p) => (
              <span key={p} className={`product-badge ${p.toLowerCase()}`}>
                {formatProductLabel(p)}
              </span>
            ))}
          </div>
          {account.hasAnchorContact === false && account.products?.every(p => ['Care','Community','Marketing','Platform','Unknown'].includes(p)) && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontWeight: 600,
              color: '#F59E0B',
              background: 'rgba(245,158,11,.1)',
              padding: '3px 8px',
              borderRadius: 4,
              marginTop: 4,
            }}>
              ⚠ No Account Contact
            </div>
          )}
          {account.lowConfidenceMatch && (
            <div className="low-confidence">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
              </svg>
              Low-confidence match — review needed
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
