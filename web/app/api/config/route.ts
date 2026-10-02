import { CATEGORIES } from '@/lib/config';
import { llmConfigured, supabaseEnabled } from '@/lib/server/env';
import { json } from '@/lib/server/http';

export const GET = async () => json({ authRequired: supabaseEnabled, llmConfigured, categories: CATEGORIES });
