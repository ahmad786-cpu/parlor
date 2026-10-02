// Server-only settings. None of these reach the browser except the Supabase URL, which is public anyway.
const env = process.env;

export const serverConfig = {
  llm: {
    baseUrl: (env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    apiKey: env.LLM_API_KEY || '',
    model: env.LLM_MODEL || '',
    maxTokens: env.LLM_MAX_TOKENS ? Number(env.LLM_MAX_TOKENS) : null,
  },
  supabase: {
    url: (env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, ''),
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  // Server-side voice: the same voice on every device (browsers, especially on phones, often only
  // offer a female voice). Used for personalities whose voice type is Male or Female.
  tts: {
    baseUrl: (env.TTS_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
    apiKey: env.TTS_API_KEY || (/groq\.com/.test(env.LLM_BASE_URL || '') ? env.LLM_API_KEY || '' : ''),
    model: env.TTS_MODEL || 'canopylabs/orpheus-v1-english',
    maleVoice: env.TTS_VOICE_MALE || 'troy',
    femaleVoice: env.TTS_VOICE_FEMALE || 'hannah',
    format: env.TTS_FORMAT || 'wav',
  },
  dataFile: env.DATA_FILE || './data/parlor.json',
};

export const supabaseEnabled = Boolean(serverConfig.supabase.url && serverConfig.supabase.serviceKey);
export const llmConfigured = Boolean(serverConfig.llm.apiKey && serverConfig.llm.model);
export const ttsConfigured = Boolean(serverConfig.tts.apiKey);
