import { supabaseEnabled } from './config.js';
import { supabase } from './supabase.js';

const DEV_USER = { uid: 'dev-user', name: 'Local dev' };

// Returns { uid, name } or null. Without Supabase configured, everyone is the dev user.
export async function authenticate(idToken) {
  if (!supabaseEnabled) return DEV_USER;
  if (!idToken) return null;
  try {
    const { data, error } = await supabase().auth.getUser(idToken);
    if (error || !data.user) return null;
    const u = data.user;
    return { uid: u.id, name: u.user_metadata?.full_name || u.user_metadata?.name || u.email || 'User' };
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = await authenticate(token);
  if (!user) return res.status(401).json({ error: 'Sign in to continue.' });
  req.user = user;
  next();
}
