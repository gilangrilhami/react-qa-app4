// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { DEEPGRAM_KEY } from "./configs.ts"
import { uploadAudioFile, uploadTextFile, uploadJsonFile, getFileSignedUrl } from "./storage.ts"

const addFileNameSafety = (fileName: string): string => {
  const prefix = `transcript-${Date.now()}-`;
  const name = fileName.split('.').slice(0, -1).join('.');
  return `${prefix}${name}`;
}

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
  console.log("Starting Deepgram transcription for file:", audioFile.name, "size:", audioFile.size, "type:", audioFile.type);
  const audioBuffer = await audioFile.arrayBuffer()
  const audioFileName = addFileNameSafety(audioFile.name);

  const audioMp3FileName = `${audioFileName}.mp3`;
  const audioFilePath = await uploadAudioFile(audioMp3FileName, audioBuffer)
  console.log("Audio file uploaded to Supabase Storage at path:", audioFilePath);

  // Set up Deepgram API request configuration with diarization enabled
  const response = await fetch('https://api.deepgram.com/v1/listen?detect_language=true&punctuate=true&diarize=true', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${DEEPGRAM_KEY}`,
      'Content-Type': audioFile.type || 'audio/mpeg',
    },
    body: audioBuffer
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deepgram API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log("Deepgram response:", data);

  const audioJsonFilePath = await uploadJsonFile(
    `${audioFileName}.json`,
    data,
  );
  console.log("Audio JSON file uploaded to Supabase Storage at path:", audioJsonFilePath);

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

  const audioTextFilePath = await uploadTextFile(
    `${audioFileName}.txt`,
    formattedTranscript,
  );
  console.log("Audio text file uploaded to Supabase Storage at path:", audioTextFilePath);
  // Save the transcription metadata to the database

  const audioMp3SignedUrl = await getFileSignedUrl(audioFilePath);
  const audioTextSignedUrl = await getFileSignedUrl(audioTextFilePath);
  const audioJsonSignedUrl = await getFileSignedUrl(audioJsonFilePath);

  const result = {
    audioUrl: audioMp3SignedUrl,
    textUrl: audioTextSignedUrl,
    jsonUrl: audioJsonSignedUrl,
  }


  return new Response(
    JSON.stringify(result),
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
