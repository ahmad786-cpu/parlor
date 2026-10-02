'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Conversation } from '@/lib/types';

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function History() {
  const { getToken } = useAuth();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await api<{ conversations: Conversation[] }>('/conversations', { token: await getToken() });
        if (live) setItems(res.conversations);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    })();
    return () => { live = false; };
  }, [getToken]);

  if (error) return <p className="alert" role="alert">{error}</p>;
  if (!items) return <p className="center-note">Loading…</p>;

  return (
    <>
      <header className="page-head">
        <h1>History</h1>
        <p>Conversations with your personalities, including ones started from a share link.</p>
      </header>
      {items.length === 0 ? (
        <div className="empty"><p>No conversations yet. Talk to a personality and it will show up here.</p></div>
      ) : (
        <ul className="history">
          {items.map((c) => (
            <li key={c.id}>
              <details>
                <summary>
                  <strong>{c.personalityName}</strong>
                  <span>{when(c.updatedAt)}</span>
                  <span>{c.messages.length} messages</span>
                  <span>{c.via === 'share' ? 'From share link' : 'From dashboard'}</span>
                </summary>
                <div className="log">
                  {c.messages.map((m, i) => (
                    <p key={i} className={`line ${m.role}`}>
                      <span className="who">{m.role === 'user' ? 'Visitor' : c.personalityName}</span>
                      {m.content}
                    </p>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
