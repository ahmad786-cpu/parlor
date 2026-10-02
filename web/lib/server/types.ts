import type { Message, Personality } from '../types';

export type AppUser = { uid: string; name: string };

export type StoredPersonality = Personality & {
  prompt: string;
  ownerId: string;
  shareToken: string;
  createdAt: number;
  updatedAt: number;
};

export type StoredConversation = {
  id: string;
  personalityId: string;
  personalityName: string;
  /** Who sees it in History: the personality's owner, or for featured ones the person talking (null if anonymous) */
  visibleTo: string | null;
  via: 'dashboard' | 'share';
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};
