import { supabaseEnabled } from './env';
import { HttpError } from './http';
import { supabaseAdmin } from './supabaseAdmin';
import type { AppUser } from './types';

const DEV_USER: AppUser = { uid: 'dev-user', name: 'Local dev' };

// Returns the signed-in user or null. Without Supabase configured, everyone is the dev user.
export async function authenticate(req: Request): Promise<AppUser | null> {
  if (!supabaseEnabled) return DEV_USER;
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    const { data, error } = await supabaseAdmin().auth.getUser(token);
    if (error || !data.user) return null;
    const meta = data.user.user_metadata || {};
    return { uid: data.user.id, name: meta.full_name || meta.name || data.user.email || 'User' };
  } catch {
    return null;
  }
}

export async function requireUser(req: Request): Promise<AppUser> {
  const user = await authenticate(req);
  if (!user) throw new HttpError(401, 'Sign in to continue.');
  return user;
}
