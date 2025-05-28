import supabase from '../core/supabase'
import { ValidationResult } from '../types';

const BUCKET_NAME = 'transcript';

export type AudioTranscriptionResponse = {
    audioUrl: string;
    textUrl: string;
    jsonUrl: string;
    transcriptTextPath: string;
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

type LeadValidationPayload = {
    transcriptTextPath: string;
    phoneNumber: string;
    melissaData: MelissaContext;
};

export const transcribeAudio = async (audioFile: File): Promise<AudioTranscriptionResponse> => {
    const formData = new FormData();
    formData.append('audio', audioFile);

    const { data, error } = await supabase.functions.invoke<AudioTranscriptionResponse>('transcribe-audio', {
        body: formData,
    });
    console.log('Transcribe audio function response:', data, error);
    if (error) {
        console.error('Error invoking transcribe-audio function:', error);
        throw new Error('Failed to transcribe audio');
    }
    if (!data) {
        throw new Error('No data returned from transcribe-audio function');
    }

    return data;
}

export const validateLead = async (transcriptTextPath: string, phoneNumber: string, context?: { melissaData?: MelissaContext }): Promise<ValidationResult> => {
    const payload: LeadValidationPayload = {
        transcriptTextPath,
        phoneNumber,
        melissaData: context?.melissaData || {},
    };
    console.log('Payload for validateLead:', payload);

    const { data, error } = await supabase.functions.invoke<ValidationResult>('validate-lead', {
        body: payload,
    });

    if (error) {
        console.error('Error invoking validate-lead function:', error);
        throw new Error('Failed to validate lead');
    }
    if (!data) {
        throw new Error('No data returned from validate-lead function');
    }

    return data;
}