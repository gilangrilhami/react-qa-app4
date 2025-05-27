// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { DEEPGRAM_KEY, supabaseClient } from "../_shared/configs"

console.log("Hello from Functions!")

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    )
  }
  const formData = await req.formData()
  if (!formData.has("audio")) {
    return new Response(
      JSON.stringify({ error: "Missing 'audio' field in form data." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }
  const audioFile = formData.get("audio") as File
  if (!audioFile || audioFile.type !== "audio/mpeg") {
    return new Response(
      JSON.stringify({ error: "Invalid or missing audio file." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }
  const audioBuffer = await audioFile.arrayBuffer()
  const { name } = await req.json()
  const data = {
    message: `Hello ${name}!`,
  }

  return new Response(
    JSON.stringify(data),
    { headers: { "Content-Type": "application/json" } },
  )
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/transcribe-audio' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
