import 'dotenv/config';

const env = process.env;

export const config = {
  port: Number(env.PORT || 4000),
  webOrigins: (env.WEB_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Number of reverse proxies in front of the server (0 = none); used to find the real client IP.
  trustProxy: Math.max(0, Number(env.TRUST_PROXY) || 0),
  llm: {
    baseUrl: (env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    apiKey: env.LLM_API_KEY || '',
    model: env.LLM_MODEL || '',
    maxTokens: env.LLM_MAX_TOKENS ? Number(env.LLM_MAX_TOKENS) : null,
  },
  supabase: {
    url: (env.SUPABASE_URL || '').replace(/\/+$/, ''),
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  dataFile: env.DATA_FILE || './data/parlor.json',
};

export const supabaseEnabled = Boolean(config.supabase.url && config.supabase.serviceKey);
export const llmConfigured = Boolean(config.llm.apiKey && config.llm.model);
