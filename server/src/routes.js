import { Router } from 'express';
import { supabaseEnabled, llmConfigured } from './config.js';
import { requireAuth } from './auth.js';
import { store } from './store/index.js';
import { FEATURED } from './seed.js';
import { CATEGORIES, create, findById, findByToken, newShareToken, sanitize, toPublic } from './personalities.js';

export const router = Router();

router.get('/health', (req, res) => res.json({ ok: true }));

router.get('/config', (req, res) =>
  res.json({ authRequired: supabaseEnabled, llmConfigured, categories: CATEGORIES })
);

// Public: what a visitor with a share link sees.
router.get('/demo/:token', async (req, res) => {
  const p = await findByToken(req.params.token);
  if (!p) return res.status(404).json({ error: 'This demo link is not valid any more.' });
  res.json({ personality: toPublic(p) });
});

router.get('/personalities', requireAuth, async (req, res) => {
  const mine = await store.listPersonalities(req.user.uid);
  res.json({
    mine,
    featured: FEATURED.map((p) => ({ ...toPublic(p), shareToken: p.shareToken })),
  });
});

router.post('/personalities', requireAuth, async (req, res) => {
  res.status(201).json({ personality: await create(req.user.uid, req.body) });
});

// Loads a personality the caller owns, or answers with the right error.
async function owned(req, res) {
  const p = await store.getPersonality(req.params.id);
  if (!p || p.ownerId !== req.user.uid) {
    res.status(404).json({ error: 'Personality not found.' });
    return null;
  }
  return p;
}

router.get('/personalities/:id', requireAuth, async (req, res) => {
  const p = await findById(req.params.id);
  if (p?.featured) return res.json({ personality: { ...toPublic(p), shareToken: p.shareToken } });
  if (!p || p.ownerId !== req.user.uid) return res.status(404).json({ error: 'Personality not found.' });
  res.json({ personality: p });
});

router.put('/personalities/:id', requireAuth, async (req, res) => {
  const p = await owned(req, res);
  if (!p) return;
  const updated = { ...p, ...sanitize(req.body), updatedAt: Date.now() };
  res.json({ personality: await store.savePersonality(updated) });
});

router.delete('/personalities/:id', requireAuth, async (req, res) => {
  const p = await owned(req, res);
  if (!p) return;
  await store.deletePersonality(p.id);
  res.json({ ok: true });
});

// Replaces the share link. The old link stops working immediately.
router.post('/personalities/:id/share', requireAuth, async (req, res) => {
  const p = await owned(req, res);
  if (!p) return;
  const updated = { ...p, shareToken: newShareToken(p.name), updatedAt: Date.now() };
  res.json({ personality: await store.savePersonality(updated) });
});

router.get('/conversations', requireAuth, async (req, res) => {
  res.json({ conversations: await store.listConversations(req.user.uid) });
});
