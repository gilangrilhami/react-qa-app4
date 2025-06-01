-- Create validation_results table
CREATE TABLE IF NOT EXISTS public.validation_results (
    id SERIAL PRIMARY KEY,
    guid UUID DEFAULT gen_random_uuid() NOT NULL,
    file_name TEXT NOT NULL,
    phone_number TEXT,
    status TEXT NOT NULL,
    confidence_score FLOAT NOT NULL,
    needs_manual_review BOOLEAN DEFAULT FALSE,
    manual_review_reasons JSONB,
    extracted_data JSONB NOT NULL,
    transcript_data JSONB,
    melissa_data JSONB,
    verification JSONB,
    transcript TEXT,
    melissa_lookup_attempted BOOLEAN DEFAULT FALSE,
    name_verified BOOLEAN,
    address_verified BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);