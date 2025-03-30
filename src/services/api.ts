import { ValidationResult, ValidationStatus, TranscriptData, MelissaData, VerificationStatus } from '../types';
// Removed unused import: config

// Function to transcribe audio using Deepgram API with diarization enabled
export const transcribeAudio = async (audioFile: File): Promise<string> => {
  try {
    console.log("Starting Deepgram transcription for file:", audioFile.name, "size:", audioFile.size, "type:", audioFile.type);
    
    // Convert the file to an ArrayBuffer
    const arrayBuffer = await audioFile.arrayBuffer();
    
    // Set up Deepgram API request configuration with diarization enabled
    const response = await fetch('https://api.deepgram.com/v1/listen?detect_language=true&punctuate=true&diarize=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REACT_APP_DEEPGRAM_API_KEY || ''}`,
        'Content-Type': audioFile.type || 'audio/wav'
      },
      body: arrayBuffer
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Deepgram API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("Deepgram response:", data);
    
    let formattedTranscript = '';
    
    if (data.results?.utterances) {
      formattedTranscript = data.results.utterances
        .map((utterance: any) => `[Speaker:${utterance.speaker}] ${utterance.transcript}`)
        .join('\n');
    } else if (data.results?.channels?.[0]?.alternatives?.[0]?.words) {
      const words = data.results.channels[0].alternatives[0].words;
      let currentSpeaker = null;
      let currentText = '';
      
      for (const word of words) {
        if (currentSpeaker === null) {
          currentSpeaker = word.speaker;
          currentText = `[Speaker:${word.speaker}] ${word.word}`;
        } else if (currentSpeaker !== word.speaker) {
          formattedTranscript += currentText + '\n';
          currentSpeaker = word.speaker;
          currentText = `[Speaker:${word.speaker}] ${word.word}`;
        } else {
          currentText += ' ' + word.word;
        }
      }
      
      if (currentText) {
        formattedTranscript += currentText;
      }
    } else {
      formattedTranscript = data.results?.channels[0]?.alternatives[0]?.transcript || '';
    }
    
    return formattedTranscript;
    
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw error;
  }
};

interface MelissaContext {
  firstName?: string;
  lastName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  email?: string;        
  dob?: string;    
  nameVerified?: boolean;
  addressVerified?: boolean;
  phoneVerified?: boolean;
}

const compareStringsLoosely = (str1?: string, str2?: string, isZip: boolean = false): boolean => {
  if (!str1 && !str2) return true;
  if (!str1 || !str2) return false;

  if (isZip) {
    const normalizeZip = (zip: string) => zip.split("-")[0].trim();
    return normalizeZip(str1).toLowerCase() === normalizeZip(str2).toLowerCase();
  }

  return str1.trim().toLowerCase() === str2.trim().toLowerCase();
};

export const validateLeadWithOpenAI = async (
  transcript: string, 
  phoneNumber: string,
  context?: { melissaData?: MelissaContext }
): Promise<ValidationResult> => {
  try {
    console.log("Starting OpenAI validation for transcript:", transcript.substring(0, 100) + "...");
    console.log("With Melissa context:", context?.melissaData);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY || ''}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are an AI assistant analyzing insurance call transcripts to determine lead quality, extract customer information, and evaluate agent performance.

IMPORTANT: You will receive data from two sources:
1. Melissa (a contact information database) - This data is AUTHORITATIVE for name, address, and contact information when populating the FINAL lead data, but NOT for extraction from the transcript.
2. Call transcript - This contains insurance details, customer information, and agent interactions.

Your task is to:
1. Extract ALL insurance information from the transcript (auto, home, health)
2. Extract contact information from the transcript for comparison with Melissa data
3. Note any discrepancies between transcript and Melissa data
4. Evaluate whether the customer is genuinely interested in insurance quotes
5. Evaluate the agent's performance by checking if they asked specific questions

When analyzing the transcript:
- For contact information (name, address, ZIP, etc.), extract the data as it appears in the TRANSCRIPT ONLY, even if it differs from Melissa data.
- For names (First Name and Last Name):
  - If the name is spelled out letter-by-letter (e.g., "k i n b e r l y" or "K-I-M-B-E-R-L-Y"), convert it to its proper form (e.g., "Kimberly").
  - Use contextual cues like "my name is," "spell your name," "first name," or "last name", "can you verify the spelling of your first name please" and "can you please spell your last name for me" (this question is usually asked, and the customer then spells their name) to identify the correct fields.
  - Combine letters into a single word, capitalizing the first letter (e.g., "k i p p" becomes "Kipp").
  - Last Name ("last_name") is usually provided after the contenxtual clue "can you please spell your last name for me"
  - If only the first name is provided in the transcript (e.g., "My name is Denny"), set "first_name" to "Denny" and "last_name" to "" (empty string).
  - If only the last name is provided, set "first_name" to "" and "last_name" to the provided last name.
  - If no name is provided, set both "first_name" and "last_name" to "".
- DO NOT override the extracted transcript data with Melissa data during extraction, even if Melissa data is provided.
- IGNORE Melissa data when extracting fields for "extracted_data". Melissa data is only for comparison purposes after extraction.
- DO extract any vehicle, home, or health insurance information
- DO NOT hallucinate or guess information not mentioned in the transcript

CRITICAL REQUIREMENTS FOR LEAD APPROVAL:
1. The customer must explicitly express interest in insurance quotes, or willingly give out their information about vehicles, home types, or health insurance questions.
2. The lead must have a name (either from Melissa or transcript)
3. The lead must have an address or ZIP code (either from Melissa or transcript)
4. The transcript must contain either a vehicle description OR clear confirmation they have auto insurance

If ANY of these are missing, the lead MUST be classified as "needs_review" with a confidence score below 0.7.

Extract the following data points from the TRANSCRIPT:
- Personal Information:
  - First Name (convert spelled-out names to proper format, e.g., "j o h n" → "John") - Use contextual cues like "my name is," "spell your name," "first name," or "last name", "can you verify the spelling of your first name please" (this question is usually asked, and the customer then spells their name) to identify the correct fields.
  - Last Name (convert spelled-out names to proper format, e.g., "d o e" → "Doe") - Use contextual cues like "my name is," "spell your name," "first name," or "last name", "can you please spell your last name for me" (this question is usually asked, and the customer then spells their name) to identify the correct fields.
  - Phone Number (if mentioned)
  - Address (complete street address if mentioned) - use contextual clues like "what is your street address" to find this.
  - ZIP Code (extract exactly as mentioned in the transcript, do not use Melissa data for this field) - use contextual clues like "what is your zip code" to find this.
  - State - add this based on the transcript ZIP CODE, with your knowledge of US zips and states.
  - Date of Birth (if mentioned) - use contextual clues like "may i please get your date of birth", "what is your birth year", "what is your birth month", "what is your birth day" to find this and format as MM/DD/YYYY
  - Email (if mentioned)

- Auto Insurance:
  - Use contextual clues like "what is the year and the make of your vehicle and what is the model of your vehicle" (this question is usually asked, and the customer then names their vehicle)
  - Main Vehicle (Year, Make, Model) - Only extract what is explicitly mentioned. If the make or model is not clearly stated, leave those fields empty.
  - Secondary Vehicle (Year, Make, Model), if mentioned - Same rule applies.
  - Current Insurance Provider (or "Not Insured" if they mentioned they don't have insurance) - Use contextual clues like "what is the name of your current insurance" -  Use your knowledge of insurance companies to suggest what the customer might mean (example, transcript might say "i'll state" which should be corrected to "AllState")

- Home Insurance:
  - Whether they're interested in home insurance (Yes/No) - If the customer answers the following questions about rent/own home, type of home etc, they are to be marked as Interested.
  - Whether they rent or own their home - use contextual clues like "do you rent or own your home" to find this.
  - Type of home (Apartment, Condo, Manufactured, Multi-Family, Single-Family, Townhome) - use contextual clues like "what type of home is it", "is it an apartment", "Is it an apartment, condo, manufactured, multi-family, single-family, or townhome" to find this.
  - Current Home Insurance Provider (or "Not Insured" if they mentioned they don't have insurance) - Use your knowledge of insurance companies to suggest what the customer might mean.

- Health Insurance:
  - Whether they're interested in health insurance (Yes/No) - If the customer answers the following questions about Number of people in household and current insurance provider, they are to be marked as Interested.
  - Number of people in household
  - Current Health Insurance Provider (or "Not Insured" if they mentioned they don't have insurance)

For vehicle information, if you detect a make/model that doesn't seem to exist or seems incorrect based on your knowledge of vehicles, do NOT replace it with a corrected version. Instead, include a "suggested_correction" field with your suggested correction and the reason for it. For example:

"main_vehicle": {
  "year": "2005",
  "make": "Maza", // as heard in transcript
  "model": "",
  "confidence": 0.8,
  "suggested_correction": {
    "make": "Mazda",
    "reason": "Maza is not a known vehicle manufacturer, Mazda is the likely correct make."
  }
}

Agent Performance Evaluation:
Analyze the transcript to determine if the agent asked the following questions. Assume the agent is the speaker who is not the customer (e.g., the agent is typically the speaker asking questions, while the customer is the speaker providing answers). Use contextual clues to identify the agent's questions:
- Did the agent ask for the best callback number? (e.g., " this the best phone number that you'd like to be called back on?", "What is the best number to reach you at?", "Can I have a callback number?", "What's a good number to call you back?")
- Did the agent ask for the customer's first and last name? (e.g., "Can you verify the spelling of your first name?", "spell your last name for me", "Can you tell me your full name?", "What's your first and last name?")
- Did the agent ask for the year, make, and model of the vehicle? (e.g., "What is the year, make, and model of your vehicle?", "Can you tell me about your car – year, make, model?")
- Did the agent ask about a secondary vehicle? (e.g., "Do you have another vehicle?", "What's the year, make, and model of your second car?")
- Did the agent ask about the current insurance provider? (e.g., "What is the name of your current insurance", "Who is your current insurance provider?", "Do you have insurance right now, and with whom?")
- Did the agent ask if the customer owns or rents their home? (e.g., "Do you own or rent your home?", "Are you a homeowner or a renter?")
- Did the agent ask for the customer's date of birth? (e.g., "What is your date of birth?", "Can I have your DOB?", "have your Birth Year, Month and Date?", "may i please get your date of birth")
- Did the agent ask for the customer's address? (e.g., "What's your address?", "what is your street address ", "what is your street address and what is your city and state ", "Can you provide your full address?")

Your response must be a valid JSON object with this structure:
{
  "classification": "approved|rejected|needs_review",
  "confidence_score": 0.0-1.0,
  "reasons": ["Reason 1", "Reason 2"],
  "extracted_data": {
    "first_name": "", // From transcript only
    "last_name": "", // From transcript only
    "date_of_birth": "",
    "phone_number": "",
    "address": "",
    "zip_code": "",
    "state": "",
    "email": "",
    "auto_insurance": {
      "main_vehicle": {
        "year": "",
        "make": "",
        "model": "",
        "confidence": 0.0-1.0,
        "suggested_correction": {
          "year": "",
          "make": "",
          "model": "",
          "reason": ""
        }
      },
      "secondary_vehicle": {
        "year": "",
        "make": "",
        "model": "",
        "confidence": 0.0-1.0,
        "suggested_correction": {
          "year": "",
          "make": "",
          "model": "",
          "reason": ""
        }
      },
      "current_provider": ""
    },
    "home_insurance": {
      "interested": true|false|null,
      "ownership": "Rent|Own|",
      "home_type": "Apartment|Condo|Manufactured|Multi-Family|Single-Family|Townhome|",
      "current_provider": ""
    },
    "health_insurance": {
      "interested": true|false|null,
      "household_size": 0,
      "current_provider": ""
    }
  },
  "missing_information": ["List of critical missing fields if any"],
  "data_discrepancies": ["List any discrepancies between Melissa data and transcript if applicable"],
  "agent_feedback": {
    "asked_for_callback_number": true|false,
    "asked_for_first_and_last_name": true|false,
    "asked_for_vehicle_year_make_model": true|false,
    "asked_for_secondary_vehicle": true|false,
    "asked_for_current_insurance_provider": true|false,
    "asked_for_own_rent_home": true|false,
    "asked_for_dob": true|false,
    "asked_for_address": true|false
  }
}`
          },
          {
            role: "user",
            content: `Call transcript: ${transcript}
Phone number from filename: ${phoneNumber}
${context?.melissaData ? `
Melissa Data (for comparison only, do not use for extraction):
First Name: ${context.melissaData.firstName || 'Not found'}
Last Name: ${context.melissaData.lastName || 'Not found'}
Address: ${context.melissaData.address || 'Not found'}
City: ${context.melissaData.city || 'Not found'}
State: ${context.melissaData.state || 'Not found'}
ZIP: ${context.melissaData.zip || 'Not found'}
Name Verified: ${context.melissaData.nameVerified ? 'Yes' : 'No'}
Address Verified: ${context.melissaData.addressVerified ? 'Yes' : 'No'}
` : 'No Melissa data available.'}`
          }
        ],
        temperature: 0
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("OpenAI response received");
    console.log("Raw OpenAI response:", data.choices[0].message.content);
    
    let result;
    try {
      const content = data.choices[0].message.content;
      result = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (e) {
      console.error("Error parsing OpenAI response:", e);
      throw new Error("Failed to parse OpenAI response as JSON");
    }
    
    console.log("Parsed OpenAI result:", result);

    // Safeguard: Ensure extracted_data doesn't include Melissa data for name fields
    const melissaFirstName = context?.melissaData?.firstName?.toLowerCase() || '';
    const melissaLastName = context?.melissaData?.lastName?.toLowerCase() || '';
    const extractedFirstName = (result.extracted_data?.first_name || '').toLowerCase();
    const extractedLastName = (result.extracted_data?.last_name || '').toLowerCase();

    // Check if extracted names match Melissa data but aren't in the transcript
    const transcriptLower = transcript.toLowerCase();
    if (
      extractedFirstName &&
      extractedFirstName === melissaFirstName &&
      !transcriptLower.includes(extractedFirstName)
    ) {
      console.warn(
        `First name "${extractedFirstName}" matches Melissa data but not found in transcript. Setting to empty.`
      );
      result.extracted_data.first_name = '';
    }
    if (
      extractedLastName &&
      extractedLastName === melissaLastName &&
      !transcriptLower.includes(extractedLastName)
    ) {
      console.warn(
        `Last name "${extractedLastName}" matches Melissa data but not found in transcript. Setting to empty.`
      );
      result.extracted_data.last_name = '';
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
    
    const melissaData: MelissaData = {
      firstName: context?.melissaData?.firstName || undefined,
      lastName: context?.melissaData?.lastName || undefined,
      address: context?.melissaData?.address || undefined,
      city: context?.melissaData?.city || undefined,
      state: context?.melissaData?.state || undefined,
      zip: context?.melissaData?.zip || undefined,
      phoneNumber: phoneNumber || undefined,
      email: context?.melissaData?.email || undefined,
      dob: context?.melissaData?.dob || undefined,
      isVerified: !!context?.melissaData?.nameVerified || !!context?.melissaData?.addressVerified
    };
    
    const transcriptFirstName = transcriptData.firstName;
    const transcriptLastName = transcriptData.lastName;
    const transcriptAddress = transcriptData.address;
    
    const verification: VerificationStatus = {
      nameMatches: 
        (transcriptData.firstName || transcriptData.lastName) && 
        (melissaData.firstName || melissaData.lastName) ? 
        compareStringsLoosely(
          `${transcriptData.firstName || ''} ${transcriptData.lastName || ''}`.trim(), 
          `${melissaData.firstName || ''} ${melissaData.lastName || ''}`.trim()
        ) : undefined,
      addressMatches: 
        transcriptData.address && melissaData.address ? 
        compareStringsLoosely(transcriptData.address, melissaData.address) : undefined,
      zipMatches: 
        transcriptData.zip && melissaData.zip ? 
        compareStringsLoosely(transcriptData.zip, melissaData.zip, true) : undefined,
      stateMatches: 
        transcriptData.state && melissaData.state ? 
        compareStringsLoosely(transcriptData.state, melissaData.state) : undefined
    };
    
    const validationResult: ValidationResult = {
      status: result.classification.toLowerCase() as ValidationStatus,
      confidenceScore: result.confidence_score || 0.8,
      reasons: result.reasons || [],
      
      transcriptData,
      melissaData,
      verification,
      
      transcriptFirstName,
      transcriptLastName,
      transcriptAddress,
      melissaLookupAttempted: !!context?.melissaData,
      nameVerified: !!context?.melissaData?.nameVerified,
      addressVerified: !!context?.melissaData?.addressVerified,
      nameFromMelissa: !!context?.melissaData?.firstName || !!context?.melissaData?.lastName,
      addressFromMelissa: !!context?.melissaData?.address,
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
                model: result.extracted_data.auto_insurance.main_vehicle.suggested_correction.model,
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

    return validationResult;
    
  } catch (error) {
    console.error('Error validating lead with OpenAI:', error);
    throw error;
  }
};