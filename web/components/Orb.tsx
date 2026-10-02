import type { SessionStatus } from '@/lib/useVoiceSession';

// The orb is the one moving thing on the page: it shows whose turn it is.
export function Orb({ emoji, status }: { emoji: string; status: SessionStatus }) {
  return (
    <div className="orb" data-state={status} aria-hidden="true">
      <span className="orb-ring" />
      <span className="orb-ring" />
      <span className="orb-ring" />
      <span className="orb-core">{emoji}</span>
    </div>
  );
}
