import React, { useState, useEffect } from 'react';

export default function EmailDraft({ contact, account, initialDraft, initialSubject }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    setSubject(initialSubject || `Connecting — ${account.customerName} & Khoros`);
    setBody(initialDraft);
  }, [initialDraft, initialSubject, account.customerName]);

  function handleDraftInGmail() {
    const to = contact?.email || '';
    const url = 'https://mail.google.com/mail/?view=cm&to=' + encodeURIComponent(to) + '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    window.open(url, '_blank');
  }

  function handleCopyToClipboard() {
    const fullEmail = `To: ${contact?.email || '(no email)'}\nSubject: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(fullEmail);
  }

  return (
    <div className="email-card">
      <div className="email-label">Email Draft</div>

      <div className="email-field">
        <span className="email-field-label">To</span>
        <input
          type="text"
          value={contact?.email || '(no email found)'}
          readOnly
          style={{ opacity: contact?.email ? 1 : 0.4 }}
        />
      </div>

      <div className="email-field">
        <span className="email-field-label">Subject</span>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject..."
        />
      </div>

      <div className="email-body-wrap">
        <textarea
          className="email-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message..."
        />
      </div>

      <div className="email-actions">
        <button className="btn btn-outline" onClick={handleCopyToClipboard}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy
        </button>

        <div className="email-actions-right">
          <button className="btn btn-send" onClick={handleDraftInGmail}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Draft in Gmail
          </button>
        </div>
      </div>
    </div>
  );
}
