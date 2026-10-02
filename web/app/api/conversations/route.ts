import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { store } from '@/lib/server/store';

export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  const all = await store.listConversations(user.uid);
  // A conversation is stored when it opens; only show the ones where someone actually said something.
  return json({ conversations: all.filter((c) => c.messages.some((m) => m.role === 'user')) });
});
