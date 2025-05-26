// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { supabaseClient, OPENAI_KEY } from "./configs.ts";
import { createUserPrompt, SYSTEM_PROMPT } from "./prompts.ts";
import { normalizeSpelledOutName, extractSpelledOutNames } from "./helpers.ts";
import { RequestPayload } from "./interfaces.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  try {
    // Handle CORS preflight request
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Check if the request method is POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Parse request body
    const payload: RequestPayload = await req.json();
    const { transcript, phoneNumber, melissaData } = payload;

    if (!transcript) {
      return new Response(
        JSON.stringify({ error: 'Transcript is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!phoneNumber) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!melissaData || typeof melissaData !== 'object') {
      console.warn("Melissa data is missing or invalid, proceeding without it.");
      return new Response(
        JSON.stringify({ error: 'Melissa data is required and must be an object' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log("Starting OpenAI validation for transcript:", transcript.substring(0, 100) + "...");
    if (melissaData) {
      console.log("With Melissa context:", melissaData);
    }

    // Step 1: Extract the spelled-out names using a rule-based approach
    const { firstName: ruleBasedFirstName, lastName: ruleBasedLastName } = extractSpelledOutNames(transcript);
    console.log("Rule-based extracted first name:", ruleBasedFirstName);
    console.log("Rule-based extracted last name:", ruleBasedLastName);

    // Prepare OpenAI API request
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          {
            role: "user",
            content: createUserPrompt(transcript, phoneNumber, melissaData)
          }
        ],
        temperature: 0
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: `OpenAI API error: ${response.status} - ${errorText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log("OpenAI response received");

    let result;
    try {
      const content = data.choices[0].message.content;
      console.log("Type of OpenAI response content:", typeof content);
      result = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (e) {
      console.error("Error parsing OpenAI response:", e);
      return new Response(
        JSON.stringify({ error: "Failed to parse OpenAI response as JSON" }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    console.log("Parsed OpenAI result");

    // Log the extracted names from OpenAI for debugging
    console.log("Extracted first_name from OpenAI:", result.extracted_data?.first_name);
    console.log("Extracted last_name from OpenAI:", result.extracted_data?.last_name);

    // Override OpenAI's extracted names with the rule-based extracted names if available
    if (ruleBasedFirstName) {
      console.log("Overriding OpenAI first_name with rule-based first_name:", ruleBasedFirstName);
      result.extracted_data.first_name = ruleBasedFirstName;
    }
    if (ruleBasedLastName) {
      console.log("Overriding OpenAI last_name with rule-based last_name:", ruleBasedLastName);
      result.extracted_data.last_name = ruleBasedLastName;
    }

    // Safeguard: Ensure extracted_data doesn't include Melissa data for name fields
    if (melissaData) {
      const melissaFirstName = melissaData.firstName?.toLowerCase() || '';
      const melissaLastName = melissaData.lastName?.toLowerCase() || '';
      const extractedFirstName = (result.extracted_data?.first_name || '').toLowerCase();
      const extractedLastName = (result.extracted_data?.last_name || '').toLowerCase();

      // Normalize the transcript to handle spelled-out names
      const transcriptLower = normalizeSpelledOutName(transcript.toLowerCase());

      // Check if extracted names match Melissa data but aren't in the transcript
      if (
        extractedFirstName &&
        extractedFirstName === melissaFirstName &&
        !transcriptLower.includes(extractedFirstName)
      ) {
        console.warn("Extracted first_name matches Melissa data but isn't in transcript. Clearing it:", extractedFirstName);
        result.extracted_data.first_name = '';
        if (!result.data_discrepancies) result.data_discrepancies = [];
        result.data_discrepancies.push("First name from OpenAI matched Melissa data but wasn't found in transcript");
      }

      if (
        extractedLastName &&
        extractedLastName === melissaLastName &&
        !transcriptLower.includes(extractedLastName)
      ) {
        console.warn("Extracted last_name matches Melissa data but isn't in transcript. Clearing it:", extractedLastName);
        result.extracted_data.last_name = '';
        if (!result.data_discrepancies) result.data_discrepancies = [];
        result.data_discrepancies.push("Last name from OpenAI matched Melissa data but wasn't found in transcript");
      }
    }

    // Return the validated result
    return new Response(
      JSON.stringify(result),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in OpenAI validation:', error);
    return new Response(
      JSON.stringify({ error: `Server error: ${error.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/openai-chat-completions' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{
      "transcript": "Your transcript here",
      "phoneNumber": "1234567890",
      "melissaData": {
        "firstName": "John",
        "lastName": "Doe",
        "address": "123 Main St",
        "city": "Anytown",
        "state": "CA",
        "zip": "12345",
        "nameVerified": true,
        "addressVerified": true
      }
    }'

*/
