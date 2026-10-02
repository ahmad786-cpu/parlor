'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/dashboard', label: 'Personalities' },
  { href: '/dashboard/history', label: 'History' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { user, loading, devMode, signIn, signOut } = useAuth();

  // Anyone holding a share link can open the demo without an account.
  const publicDemo = pathname === '/dashboard/personality-demo' && params.has('token');
  // Embedded in another site: just the conversation, no Parlor header or page padding.
  if (publicDemo && params.get('embed') === '1') {
    return <main className="bare-main embed">{children}</main>;
  }
  if (publicDemo) {
    return (
      <div className="bare">
        <header className="bare-bar">
          <span className="brand">Parlor</span>
        </header>
        <main className="bare-main">{children}</main>
      </div>
    );
  }

  if (loading) return <p className="center-note">Loading…</p>;

  if (!user) {
    return (
      <main className="signin">
        <span className="brand">Parlor</span>
        <h1>Give your ideas a voice</h1>
        <p>Create a personality, pick how it sounds, and talk to it out loud. Share a link so anyone can try it.</p>
        <button className="btn primary" onClick={() => signIn().catch(() => {})}>
          Sign in with Google
        </button>
      </main>
    );
  }

  return (
    <div className="shell">
      <aside className="rail">
        <Link href="/dashboard" className="brand">Parlor</Link>
        <nav aria-label="Main">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <Link href="/dashboard/personalities/new" className="btn primary rail-new">New personality</Link>
        <div className="rail-user">
          <span>{user.name}</span>
          {devMode ? <small>No sign-in configured</small> : (
            <button className="link-btn" onClick={() => signOut()}>Sign out</button>
          )}
        </div>
      </aside>
      <main className="page">{children}</main>
    </div>
  );
}
