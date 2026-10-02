import { Suspense } from 'react';
import { Shell } from '@/components/Shell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="center-note">Loading…</p>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
