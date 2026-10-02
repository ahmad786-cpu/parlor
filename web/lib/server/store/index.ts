import { supabaseEnabled } from '../env';
import type { StoredConversation, StoredPersonality } from '../types';
import { fileStore } from './fileStore';
import { supabaseStore } from './supabaseStore';

export type Store = {
  listPersonalities(ownerId: string): Promise<StoredPersonality[]>;
  getPersonality(id: string): Promise<StoredPersonality | null>;
  getPersonalityByToken(token: string): Promise<StoredPersonality | null>;
  savePersonality(p: StoredPersonality): Promise<StoredPersonality>;
  deletePersonality(id: string): Promise<void>;
  getConversation(id: string): Promise<StoredConversation | null>;
  saveConversation(c: StoredConversation): Promise<void>;
  listConversations(uid: string, limit?: number): Promise<StoredConversation[]>;
};

export const store: Store = supabaseEnabled ? supabaseStore : fileStore;
