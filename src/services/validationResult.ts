import supabase from '../core/supabase';
import { ValidationResult } from '../types';

export interface StoredValidationResult extends ValidationResult {
    id: string;
    file_name: string;
    created_at: string;
    transcript: string;
}

/**
 * Save a validation result to Supabase
 */
export async function saveValidationResult(
    result: ValidationResult,
    transcript: string,
    fileName: string
): Promise<StoredValidationResult | null> {
    try {
        const { data, error } = await supabase
            .from('validation_results')
            .insert({
                file_name: fileName,
                phone_number: result.extractedData.phoneNumber || null,
                status: result.status,
                confidence_score: result.confidenceScore,
                needs_manual_review: result.needsManualReview || false,
                manual_review_reasons: result.manualReviewReasons || [],
                extracted_data: result.extractedData,
                transcript_data: result.transcriptData || null,
                melissa_data: result.melissaData || null,
                verification: result.verification || null,
                transcript: transcript,
                melissa_lookup_attempted: result.melissaLookupAttempted || false,
                name_verified: result.nameVerified,
                address_verified: result.addressVerified,
            })
            .select()
            .single();

        if (error) {
            console.error('Error saving validation result:', error);
            return null;
        }

        // map the returned data to match the StoredValidationResult type
        const storedResult: StoredValidationResult = {
            id: data.id,
            file_name: data.file_name,
            created_at: data.created_at,
            transcript: data.transcript,

            // map snake_case fields to camelCase
            extractedData: data.extracted_data,
            transcriptData: data.transcript_data,
            melissaData: data.melissa_data,
            verification: data.verification,
            manualReviewReasons: data.manual_review_reasons,
            melissaLookupAttempted: data.melissa_lookup_attempted,
            nameVerified: data.name_verified,
            addressVerified: data.address_verified,
            status: data.status,
            confidenceScore: data.confidence_score,
            needsManualReview: data.needs_manual_review,
        };

        return storedResult;
    } catch (error) {
        console.error('Error saving validation result:', error);
        return null;
    }
}

/**
 * Get all validation results from Supabase
 */
export async function getValidationResults(): Promise<StoredValidationResult[]> {
    try {
        const { data, error } = await supabase
            .from('validation_results')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching validation results:', error);
            return [];
        }

        // map the returned data to match the StoredValidationResult type
        if (!data) {
            console.warn('No validation results found');
            return [];
        }

        const results: StoredValidationResult[] = data.map((item: any) => ({
            id: item.id,
            file_name: item.file_name,
            created_at: item.created_at,
            transcript: item.transcript,
            // map snake_case fields to camelCase
            extractedData: item.extracted_data,
            transcriptData: item.transcript_data,
            melissaData: item.melissa_data,
            verification: item.verification,
            manualReviewReasons: item.manual_review_reasons,
            melissaLookupAttempted: item.melissa_lookup_attempted,
            nameVerified: item.name_verified,
            addressVerified: item.address_verified,
            status: item.status,
            confidenceScore: item.confidence_score,
            needsManualReview: item.needs_manual_review,
        }));

        return results;
    } catch (error) {
        console.error('Error fetching validation results:', error);
        return [];
    }
}

/**
 * Get a validation result by ID from Supabase
 */
export async function getValidationResultById(id: string): Promise<StoredValidationResult | null> {
    try {
        const { data, error } = await supabase
            .from('validation_results')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error(`Error fetching validation result with ID ${id}:`, error);
            return null;
        }

        return data as StoredValidationResult;
    } catch (error) {
        console.error(`Error fetching validation result with ID ${id}:`, error);
        return null;
    }
}
