import { HttpError, json, route } from '@/lib/server/http';
import { findByToken, toPublic } from '@/lib/server/personalities';

// Public: what a visitor with a share link sees.
export const GET = route(async (_req: Request, { params }: { params: Promise<{ token: string }> }) => {
  const p = await findByToken((await params).token);
  if (!p) throw new HttpError(404, 'This demo link is not valid any more.');
  return json({ personality: toPublic(p) });
});
