import supabase from '../core/supabase'

const BUCKET_NAME = 'transcript';

export const getFileText = async (filePath: string): Promise<string> => {
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(filePath);
    if (error) {
        console.error('Error downloading transcript text:', error);
        throw new Error('Failed to download transcript text');
    }

    if (!data) {
        throw new Error('No data returned from download');
    }

    const text = await data.text();
    return text;
}