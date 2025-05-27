import { z } from "npm:zod";
import { createClient } from 'npm:@supabase/supabase-js@2';
const _env = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string(),
  G_OPENAI_API_KEY: z.string(),
  G_DEEPGRAM_API_KEY: z.string().optional(),
});
export const env = _env.parse(Deno.env.toObject());
export const supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
export const OPENAI_KEY = env.G_OPENAI_API_KEY;
export const DEEPGRAM_KEY = env.G_DEEPGRAM_API_KEY;
