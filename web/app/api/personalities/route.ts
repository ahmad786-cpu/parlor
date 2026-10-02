import { requireUser } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { create, toPublic } from '@/lib/server/personalities';
import { FEATURED } from '@/lib/server/seed';
import { store } from '@/lib/server/store';

export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  return json({
    mine: await store.listPersonalities(user.uid),
    featured: FEATURED.map((p) => ({ ...toPublic(p), shareToken: p.shareToken })),
  });
});

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  return json({ personality: await create(user.uid, await readJson(req)) }, 201);
});
