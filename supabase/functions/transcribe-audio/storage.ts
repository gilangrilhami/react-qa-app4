import { supabaseClient } from "./configs.ts";

const BUCKET_NAME = "transcript";
const AUDIO_DIR = "audio";
const TEXT_DIR = "text";
const JSON_DIR = "raw";

const SIGNED_URL_EXPIRATION = 60 * 60; // 1 hour

export async function uploadAudioFile(
    fileName: string,
    fileContent: ArrayBuffer
): Promise<string> {
    const { data, error } = await supabaseClient.storage.from(BUCKET_NAME).upload(
        `${AUDIO_DIR}/${fileName}`,
        fileContent,
        {
            contentType: "audio/mpeg",
            upsert: false,
        });
    if (error) {
        throw new Error(`Error uploading audio file: ${error.message}`);
    }
    return data.path;
}

export async function uploadTextFile(
    fileName: string,
    fileContent: string
): Promise<string> {
    const { data, error } = await supabaseClient.storage.from(BUCKET_NAME).upload(
        `${TEXT_DIR}/${fileName}`,
        fileContent,
        {
            contentType: "text/plain",
            upsert: false,
        });
    if (error) {
        throw new Error(`Error uploading text file: ${error.message}`);
    }
    return data.path;
}

export async function uploadJsonFile(
    fileName: string,
    fileContent: object
): Promise<string> {
    const { data, error } = await supabaseClient.storage.from(BUCKET_NAME).upload(
        `${JSON_DIR}/${fileName}`,
        JSON.stringify(fileContent),
        {
            contentType: "application/json",
            upsert: false,
        });
    if (error) {
        throw new Error(`Error uploading JSON file: ${error.message}`);
    }
    return data.path;
}

export async function getFileSignedUrl(
    filePath: string
): Promise<string> {
    const { data, error } = await supabaseClient.storage.from(BUCKET_NAME).createSignedUrl(
        filePath,
        SIGNED_URL_EXPIRATION
    );
    if (error) {
        throw new Error(`Error getting signed URL: ${error.message}`);
    }
    return data.signedUrl;
}