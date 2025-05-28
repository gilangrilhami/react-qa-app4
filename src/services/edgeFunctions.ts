import supabase from '../core/supabase'
import { ValidationResult } from '../types';

const BUCKET_NAME = 'transcript';

type AudioTranscriptionResponse = {
    audioUrl: string;
    textUrl: string;
    jsonUrl: string;
    transcriptTextPath: string;
};

type LeadValidationPayload = {
    transcriptTextPath: string;
    phoneNumber: string;
    melissaData: {
        firstName: string;
        lastName: string;
        address: string;
        city: string;
        state: string;
        zip: string;
        nameVerified: boolean;
        addressVerified: boolean;
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

export const transcribeAudio = async (audioFile: File): Promise<AudioTranscriptionResponse> => {
    const formData = new FormData();
    formData.append('audio', audioFile);

    const { data, error } = await supabase.functions.invoke<AudioTranscriptionResponse>('transcribe-audio', {
        body: formData,
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
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
        melissaData: {
            firstName: context?.melissaData?.firstName || '',
            lastName: context?.melissaData?.lastName || '',
            address: context?.melissaData?.address || '',
            city: context?.melissaData?.city || '',
            state: context?.melissaData?.state || '',
            zip: context?.melissaData?.zip || '',
            nameVerified: context?.melissaData?.nameVerified || false,
            addressVerified: context?.melissaData?.addressVerified || false,
        }
    };

    const { data, error } = await supabase.functions.invoke<ValidationResult>('validate-lead', {
        body: JSON.stringify(payload),
        headers: {
            'Content-Type': 'application/json',
        },
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