// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { supabaseClient, OPENAI_KEY } from "./configs.ts";
import { createUserPrompt, SYSTEM_PROMPT } from "./prompts.ts";
import { normalizeSpelledOutName, extractSpelledOutNames, compareStringsLoosely } from "./helpers.ts";
import { RequestPayload, TranscriptData, MelissaData, VerificationStatus, ValidationResult, ValidationStatus } from "./interfaces.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "OPTIONS, POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


const BUCKET_NAME = 'transcript';

const getTranscriptText = async (audioTextPath: string): Promise<string> => {
  const { data, error } = await supabaseClient.storage
    .from(BUCKET_NAME)
    .download(audioTextPath);
  if (error) {
    console.error("Error downloading transcript text:", error);
    throw new Error(`Failed to download transcript text: ${error.message}`);
  }
  const text = await data.text();
  console.log("Transcript text downloaded successfully:", audioTextPath);
  return text;
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
    const { transcriptTextPath, phoneNumber, melissaData } = payload;

    if (!transcriptTextPath) {
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

    if (melissaData) {
      console.log("With Melissa context:", melissaData);
    }



    // Step 1: Extract the spelled-out names using a rule-based approach
    const transcript = await getTranscriptText(transcriptTextPath);
    console.log("Transcript text retrieved successfully");
    console.log("Starting OpenAI validation for transcript:", transcript.substring(0, 100) + "...");

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
      }

      if (
        extractedLastName &&
        extractedLastName === melissaLastName &&
        !transcriptLower.includes(extractedLastName)
      ) {
        console.warn("Extracted last_name matches Melissa data but isn't in transcript. Clearing it:", extractedLastName);
        result.extracted_data.last_name = '';
      }
    }

    const transcriptData: TranscriptData = {
      firstName: result.extracted_data?.first_name || undefined,
      lastName: result.extracted_data?.last_name || undefined,
      address: result.extracted_data?.address || undefined,
      zip: result.extracted_data?.zip_code || undefined,
      state: result.extracted_data?.state || undefined,
      phoneNumber: result.extracted_data?.phone_number || phoneNumber || undefined,
      email: result.extracted_data?.email || undefined,
      dob: result.extracted_data?.date_of_birth || undefined,
      autoInsurance: {
        mainVehicle: result.extracted_data?.auto_insurance?.main_vehicle ? {
          year: result.extracted_data.auto_insurance.main_vehicle.year || '',
          make: result.extracted_data.auto_insurance.main_vehicle.make || '',
          model: result.extracted_data.auto_insurance.main_vehicle.model || '',
          ...(result.extracted_data.auto_insurance.main_vehicle.confidence && {
            confidence: result.extracted_data.auto_insurance.main_vehicle.confidence
          }),
          ...(result.extracted_data.auto_insurance.main_vehicle.suggested_correction && {
            suggestedCorrection: {
              make: result.extracted_data.auto_insurance.main_vehicle.suggested_correction.make,
              model: result.extracted_data.auto_insurance.main_vehicle.suggested_correction.model,
              year: result.extracted_data.auto_insurance.main_vehicle.suggested_correction.year,
              reason: result.extracted_data.auto_insurance.main_vehicle.suggested_correction.reason
            }
          })
        } : undefined,
        secondaryVehicle: result.extracted_data?.auto_insurance?.secondary_vehicle ? {
          year: result.extracted_data.auto_insurance.secondary_vehicle.year || '',
          make: result.extracted_data.auto_insurance.secondary_vehicle.make || '',
          model: result.extracted_data.auto_insurance.secondary_vehicle.model || '',
          ...(result.extracted_data.auto_insurance.secondary_vehicle.confidence && {
            confidence: result.extracted_data.auto_insurance.secondary_vehicle.confidence
          }),
          ...(result.extracted_data.auto_insurance.secondary_vehicle.suggested_correction && {
            suggestedCorrection: {
              make: result.extracted_data.auto_insurance.secondary_vehicle.suggested_correction.make,
              model: result.extracted_data.auto_insurance.secondary_vehicle.suggested_correction.model,
              year: result.extracted_data.auto_insurance.secondary_vehicle.suggested_correction.year,
              reason: result.extracted_data.auto_insurance.secondary_vehicle.suggested_correction.reason
            }
          })
        } : undefined,
        currentProvider: result.extracted_data?.auto_insurance?.current_provider || ''
      },
      homeInsurance: {
        interested: result.extracted_data?.home_insurance?.interested,
        ownership: result.extracted_data?.home_insurance?.ownership || '',
        homeType: result.extracted_data?.home_insurance?.home_type || '',
        currentProvider: result.extracted_data?.home_insurance?.current_provider || ''
      },
      healthInsurance: {
        interested: result.extracted_data?.health_insurance?.interested,
        householdSize: result.extracted_data?.health_insurance?.household_size || null,
        currentProvider: result.extracted_data?.health_insurance?.current_provider || ''
      }
    };

    const checkMelissaData: MelissaData = {
      firstName: melissaData?.firstName || undefined,
      lastName: melissaData?.lastName || undefined,
      address: melissaData?.address || undefined,
      city: melissaData?.city || undefined,
      state: melissaData?.state || undefined,
      zip: melissaData?.zip || undefined,
      phoneNumber: phoneNumber || undefined,
      email: melissaData?.email || undefined,
      dob: melissaData?.dob || undefined,
      isVerified: !!melissaData?.nameVerified || !!melissaData?.addressVerified
    };

    const transcriptFirstName = transcriptData.firstName;
    const transcriptLastName = transcriptData.lastName;
    const transcriptAddress = transcriptData.address;

    const verification: VerificationStatus = {
      nameMatches:
        (transcriptData.firstName || transcriptData.lastName) &&
          (checkMelissaData.firstName || checkMelissaData.lastName) ?
          compareStringsLoosely(
            `${transcriptData.firstName || ''} ${transcriptData.lastName || ''}`.trim(),
            `${checkMelissaData.firstName || ''} ${checkMelissaData.lastName || ''}`.trim()
          ) : undefined,
      addressMatches:
        transcriptData.address && checkMelissaData.address ?
          compareStringsLoosely(transcriptData.address, checkMelissaData.address) : undefined,
      zipMatches:
        transcriptData.zip && checkMelissaData.zip ?
          compareStringsLoosely(transcriptData.zip, checkMelissaData.zip, true) : undefined,
      stateMatches:
        transcriptData.state && checkMelissaData.state ?
          compareStringsLoosely(transcriptData.state, checkMelissaData.state) : undefined
    };

    const validationResult: ValidationResult = {
      status: result.classification.toLowerCase() as ValidationStatus,
      confidenceScore: result.confidence_score || 0.8,
      reasons: result.reasons || [],

      transcriptData,
      melissaData: checkMelissaData,
      verification,

      transcriptFirstName,
      transcriptLastName,
      transcriptAddress,
      melissaLookupAttempted: !!melissaData,
      nameVerified: !!melissaData?.nameVerified,
      addressVerified: !!melissaData?.addressVerified,
      nameFromMelissa: !!melissaData?.firstName || !!melissaData?.lastName,
      addressFromMelissa: !!melissaData?.address,
      addressMatchesMelissa: verification.addressMatches,

      extractedData: {
        firstName: transcriptData.firstName || '',
        lastName: transcriptData.lastName || '',
        dob: transcriptData.dob || '',
        phoneNumber: phoneNumber || transcriptData.phoneNumber || '',
        address: transcriptData.address || '',
        zip: transcriptData.zip || '',
        state: transcriptData.state || '',
        email: transcriptData.email || '',

        vehicleInfo: result.extracted_data?.auto_insurance?.main_vehicle ?
          `${result.extracted_data.auto_insurance.main_vehicle.year || ''} ${result.extracted_data.auto_insurance.main_vehicle.make || ''} ${result.extracted_data.auto_insurance.main_vehicle.model || ''}`.trim() : '',

        autoInsurance: {
          mainVehicle: {
            year: result.extracted_data?.auto_insurance?.main_vehicle?.year || '',
            make: result.extracted_data?.auto_insurance?.main_vehicle?.make || '',
            model: result.extracted_data?.auto_insurance?.main_vehicle?.model || '',
            ...(result.extracted_data?.auto_insurance?.main_vehicle?.confidence && {
              confidence: result.extracted_data.auto_insurance.main_vehicle.confidence
            }),
            ...(result.extracted_data?.auto_insurance?.main_vehicle?.suggested_correction && {
              suggestedCorrection: {
                make: result.extracted_data.auto_insurance.main_vehicle.suggested_correction.make,
                model: ruleBasedFirstName,
                year: result.extracted_data.auto_insurance.main_vehicle.suggested_correction.year,
                reason: result.extracted_data.auto_insurance.main_vehicle.suggested_correction.reason
              }
            })
          },
          secondaryVehicle: result.extracted_data?.auto_insurance?.secondary_vehicle ? {
            year: result.extracted_data.auto_insurance.secondary_vehicle.year || '',
            make: result.extracted_data.auto_insurance.secondary_vehicle.make || '',
            model: result.extracted_data.auto_insurance.secondary_vehicle.model || '',
            ...(result.extracted_data.auto_insurance.secondary_vehicle.confidence && {
              confidence: result.extracted_data.auto_insurance.secondary_vehicle.confidence
            }),
            ...(result.extracted_data.auto_insurance.secondary_vehicle.suggested_correction && {
              suggestedCorrection: {
                make: result.extracted_data.auto_insurance.secondary_vehicle.suggested_correction.make,
                model: result.extracted_data.auto_insurance.secondary_vehicle.suggested_correction.model,
                year: result.extracted_data.auto_insurance.secondary_vehicle.suggested_correction.year,
                reason: result.extracted_data.auto_insurance.secondary_vehicle.suggested_correction.reason
              }
            })
          } : undefined,
          currentProvider: result.extracted_data?.auto_insurance?.current_provider || ''
        },
        homeInsurance: {
          interested: result.extracted_data?.home_insurance?.interested,
          ownership: result.extracted_data?.home_insurance?.ownership || '',
          homeType: result.extracted_data?.home_insurance?.home_type || '',
          currentProvider: result.extracted_data?.home_insurance?.current_provider || ''
        },
        healthInsurance: {
          interested: result.extracted_data?.health_insurance?.interested,
          householdSize: result.extracted_data?.health_insurance?.household_size || null,
          currentProvider: result.extracted_data?.health_insurance?.current_provider || ''
        },
        agentFeedback: {
          askedForCallbackNumber: result.agent_feedback?.asked_for_callback_number || false,
          askedForFirstAndLastName: result.agent_feedback?.asked_for_first_and_last_name || false,
          askedForVehicleYearMakeModel: result.agent_feedback?.asked_for_vehicle_year_make_model || false,
          askedForSecondaryVehicle: result.agent_feedback?.asked_for_secondary_vehicle || false,
          askedForCurrentInsuranceProvider: result.agent_feedback?.asked_for_current_insurance_provider || false,
          askedForOwnRentHome: result.agent_feedback?.asked_for_own_rent_home || false,
          askedForDob: result.agent_feedback?.asked_for_dob || false,
          askedForAddress: result.agent_feedback?.asked_for_address || false
        }
      }
    };

    if (result.missing_information && result.missing_information.length > 0) {
      validationResult.needsManualReview = true;
      validationResult.manualReviewReasons = result.missing_information.map((field: string) => `Missing: ${field}`);
    }

    if (result.data_discrepancies && result.data_discrepancies.length > 0) {
      validationResult.needsManualReview = true;
      validationResult.manualReviewReasons = validationResult.manualReviewReasons
        ? [...validationResult.manualReviewReasons, ...result.data_discrepancies]
        : result.data_discrepancies;
    }

    // Return the validated result
    return new Response(
      JSON.stringify(validationResult),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
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
