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
  dataFile: env.DATA_FILE || './data/parlor.json',
};

export const supabaseEnabled = Boolean(serverConfig.supabase.url && serverConfig.supabase.serviceKey);
export const llmConfigured = Boolean(serverConfig.llm.apiKey && serverConfig.llm.model);
