// src/types.ts

export type ValidationStatus = 'approved' | 'rejected' | 'needs_review';

export interface VehicleInfo {
    year: string;
    make: string;
    model: string;
    confidence?: number;
    suggestedCorrection?: {
        year?: string;
        make?: string;
        model?: string;
        reason?: string;
    };
    potentialHallucination?: boolean;
    originalText?: string;
    corrected?: boolean;
}

export interface AutoInsurance {
    mainVehicle?: VehicleInfo;
    secondaryVehicle?: VehicleInfo;
    currentProvider?: string;
}

export interface HomeInsurance {
    interested?: boolean | null;
    ownership?: string;
    homeType?: string;
    currentProvider?: string;
}

export interface HealthInsurance {
    interested?: boolean | null;
    householdSize?: number | string | null; // Updated to accept string to fix errors
    currentProvider?: string;
}

export interface AgentFeedback {
    askedForCallbackNumber: boolean;
    askedForFirstAndLastName: boolean;
    askedForVehicleYearMakeModel: boolean;
    askedForSecondaryVehicle: boolean;
    askedForCurrentInsuranceProvider: boolean;
    askedForOwnRentHome: boolean;
    askedForDob: boolean;
    askedForAddress: boolean;
}

export interface ExtractedData {
    firstName?: string;
    lastName?: string;
    dob?: string;
    phoneNumber?: string;
    address?: string;
    zip?: string;
    state?: string;
    city?: string; // Added city property
    email?: string;
    vehicleInfo?: string; // Legacy field
    autoInsurance?: AutoInsurance;
    homeInsurance?: HomeInsurance;
    healthInsurance?: HealthInsurance;
    agentFeedback?: AgentFeedback;
}

// New interfaces for separate data sources
export interface TranscriptData {
    firstName?: string;
    lastName?: string;
    dob?: string;
    phoneNumber?: string;
    address?: string;
    zip?: string;
    state?: string;
    city?: string; // Added city property
    email?: string;
    // Add insurance properties to match usage in api.ts
    autoInsurance?: {
        mainVehicle?: any;
        secondaryVehicle?: any;
        currentProvider?: any;
    };
    homeInsurance?: {
        interested?: boolean | null;
        ownership?: string;
        homeType?: string;
        currentProvider?: string;
    };
    healthInsurance?: {
        interested?: boolean | null;
        householdSize?: string | number | null;
        currentProvider?: string;
    };
}

export interface MelissaData {
    firstName?: string;
    lastName?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phoneNumber?: string;
    email?: string;
    dob?: string;
    isVerified: boolean;
}

export interface VerificationStatus {
    nameMatches?: boolean;
    addressMatches?: boolean;
    zipMatches?: boolean;
    stateMatches?: boolean;
}


export interface ValidationResult {
    status: ValidationStatus;
    confidenceScore: number;
    reasons?: string[];
    extractedData: ExtractedData;

    // New fields for separate data display
    transcriptData?: TranscriptData;
    melissaData?: MelissaData;
    verification?: VerificationStatus;
    melissaLookupAttempted?: boolean;

    // Fields for backward compatibility
    needsManualReview?: boolean;
    manualReviewReasons?: string[];

    // Legacy fields (for backward compatibility)
    nameVerified?: boolean;
    addressVerified?: boolean;
    nameFromMelissa?: boolean;
    addressFromMelissa?: boolean;
    addressMatchesMelissa?: boolean;
    invalidZip?: boolean; // Kept this instance, removed the duplicate
    zipMismatch?: boolean;

    // Fields used for displaying comparison data
    transcriptFirstName?: string;
    transcriptLastName?: string;
    transcriptAddress?: string;
    transcriptZip?: string; // Added missing property

    // Additional fields being accessed in the code
    melissaAddressFound?: boolean;
    melissaNameFound?: boolean;
    suggestedAddress?: string;
    suggestedName?: string;
}

export interface MelissaContext {
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


export interface RequestPayload {
    transcript: string;
    phoneNumber: string;
    melissaData?: MelissaContext;
}