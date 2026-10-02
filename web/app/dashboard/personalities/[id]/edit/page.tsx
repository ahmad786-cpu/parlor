'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Personality } from '@/lib/types';
import { PersonalityForm } from '@/components/PersonalityForm';

export default function EditPersonality() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [personality, setPersonality] = useState<Personality | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await api<{ personality: Personality }>(`/personalities/${id}`, { token: await getToken() });
        if (!live) return;
        if (res.personality.featured) setError('Featured personalities can\'t be edited.');
        else setPersonality(res.personality);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    })();
    return () => { live = false; };
  }, [id, getToken]);

  if (error) return <p className="alert" role="alert">{error}</p>;
  if (!personality) return <p className="center-note">Loading…</p>;
  return (
    <>
      <header className="page-head">
        <h1>Edit {personality.name}</h1>
      </header>
      <PersonalityForm existing={personality} />
    </>
  );
}
