import { requireUser } from '@/lib/server/auth';
import { HttpError, json, readJson, route } from '@/lib/server/http';
import { findById, findOwned, sanitize, toPublic } from '@/lib/server/personalities';
import { store } from '@/lib/server/store';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req);
  const p = await findById((await params).id);
  if (p?.featured) return json({ personality: { ...toPublic(p), shareToken: p.shareToken } });
  if (!p || p.ownerId !== user.uid) throw new HttpError(404, 'Personality not found.');
  return json({ personality: p });
});

export const PUT = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req);
  const p = await findOwned((await params).id, user.uid);
  const updated = { ...p, ...sanitize(await readJson(req)), updatedAt: Date.now() };
  return json({ personality: await store.savePersonality(updated) });
});

export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req);
  const p = await findOwned((await params).id, user.uid);
  await store.deletePersonality(p.id);
  return json({ ok: true });
});
