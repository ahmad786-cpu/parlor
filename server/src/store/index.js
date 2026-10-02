import { supabaseEnabled } from '../config.js';
import { fileStore } from './fileStore.js';
import { supabaseStore } from './supabaseStore.js';

export const store = supabaseEnabled ? supabaseStore : fileStore;
