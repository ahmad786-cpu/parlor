export type Voice = { name: string; lang: string; rate: number; pitch: number };

export type Personality = {
  id: string;
  name: string;
  tagline: string;
  greeting: string;
  category: string;
  emoji: string;
  color: string;
  voice: Voice;
  featured?: boolean;
  /** Only present for personalities you own */
  prompt?: string;
  shareToken?: string;
};

export type PersonalityInput = Omit<Personality, 'id' | 'featured' | 'shareToken' | 'prompt'> & {
  prompt: string;
};

export type Message = { role: 'user' | 'assistant'; content: string; at?: number };

export type Conversation = {
  id: string;
  personalityId: string;
  personalityName: string;
  via: 'dashboard' | 'share';
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};
