import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { findOwned, newShareToken } from '@/lib/server/personalities';
import { store } from '@/lib/server/store';

// Replaces the share link. The old link stops working immediately.
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const p = await findOwned((await params).id, user.uid);
  const updated = { ...p, shareToken: newShareToken(p.name), updatedAt: Date.now() };
  return json({ personality: await store.savePersonality(updated) });
});
