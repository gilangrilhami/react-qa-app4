import supabase from '../core/supabase'
import { ValidationResult } from '../types';

const BUCKET_NAME = 'transcript';

type AudioTranscriptionResponse = {
    audioUrl: string;
    textUrl: string;
    jsonUrl: string;
    transcriptTextPath: string;
};


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
