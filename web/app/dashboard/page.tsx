'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Personality } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { CopyButton, shareUrl } from '@/components/CopyButton';

type Data = { mine: Personality[]; featured: Personality[] };

function Cast({ items, editable }: { items: Personality[]; editable?: boolean }) {
  return (
    <ul className="cast">
      {items.map((p) => (
        <li key={p.id}>
          <Link href={`/dashboard/personality-demo?id=${p.id}`} className="cast-face" aria-label={`Talk to ${p.name}`}>
            <Avatar emoji={p.emoji} color={p.color} />
          </Link>
          <div>
            <h3>{p.name}</h3>
            <p>{p.tagline || p.category}</p>
            <div className="cast-actions">
              <Link href={`/dashboard/personality-demo?id=${p.id}`}>Talk</Link>
              {editable && <Link href={`/dashboard/personalities/${p.id}/edit`}>Edit</Link>}
              {p.shareToken && <CopyButton text={shareUrl(p.shareToken)} />}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Gallery() {
  const { getToken } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await api<Data>('/personalities', { token: await getToken() });
        if (live) setData(res);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    })();
    return () => { live = false; };
  }, [getToken]);

  if (error) return <p className="alert" role="alert">{error}</p>;
  if (!data) return <p className="center-note">Loading…</p>;

  return (
    <>
      <header className="page-head">
        <h1>Personalities</h1>
        <p>Pick someone to talk to, or make your own.</p>
      </header>

      <section aria-labelledby="mine">
        <h2 id="mine">Yours</h2>
        {data.mine.length ? (
          <Cast items={data.mine} editable />
        ) : (
          <div className="empty">
            <p>You haven't made a personality yet. Give it a name, describe how it behaves, and choose a voice.</p>
            <Link href="/dashboard/personalities/new" className="btn primary">New personality</Link>
          </div>
        )}
      </section>

      <section aria-labelledby="featured">
        <h2 id="featured">Featured</h2>
        <Cast items={data.featured} />
      </section>
    </>
  );
}
