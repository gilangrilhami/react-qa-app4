interface Config {
    DEEPGRAM_API_KEY: string;
    OPENAI_API_KEY: string;
    IS_DEVELOPMENT: boolean;
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
  }
  
  const config: Config = {
    DEEPGRAM_API_KEY: process.env.REACT_APP_DEEPGRAM_API_KEY || '',
    OPENAI_API_KEY: process.env.REACT_APP_OPENAI_API_KEY || '',
    SUPABASE_URL: process.env.REACT_APP_SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.REACT_APP_SUPABASE_ANON_KEY || '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY || '',
    IS_DEVELOPMENT: process.env.NODE_ENV === 'development'
  };
  
  // Add warning for missing API keys in development mode
  if (config.IS_DEVELOPMENT) {
    if (!config.DEEPGRAM_API_KEY) {
      console.warn('Warning: Deepgram API key is missing. Add it to your .env file.');
    }
    if (!config.OPENAI_API_KEY) {
      console.warn('Warning: OpenAI API key is missing. Add it to your .env file.');
    }
    if (!config.SUPABASE_URL) {
      console.warn('Warning: Supabase URL is missing. Add it to your .env file.');
    }
    if (!config.SUPABASE_ANON_KEY) {
      console.warn('Warning: Supabase Anon Key is missing. Add it to your .env file.');
    }
    if (!config.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('Warning: Supabase Service Role Key is missing. Add it to your .env file.');
    }
  }
  
  export default config;