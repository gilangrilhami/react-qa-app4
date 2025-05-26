type ValidationStatus = 'approved' | 'rejected' | 'needs_review';

export interface VehicleInfo {
  year: string;
  make: string;
  model: string;
  confidence?: number;
  suggested_correction?: {
    year?: string;
    make?: string;
    model?: string;
    reason?: string;
  };
}

export interface AutoInsurance {
  main_vehicle?: VehicleInfo;
  secondary_vehicle?: VehicleInfo;
  current_provider?: string;
}

export interface HomeInsurance {
  interested?: boolean | null;
  ownership?: string;
  home_type?: string;
  current_provider?: string;
}

export interface HealthInsurance {
  interested?: boolean | null;
  household_size?: number | string | null;
  current_provider?: string;
}

export interface AgentFeedback {
  asked_for_callback_number: boolean;
  asked_for_first_and_last_name: boolean;
  asked_for_vehicle_year_make_model: boolean;
  asked_for_secondary_vehicle: boolean;
  asked_for_current_insurance_provider: boolean;
  asked_for_own_rent_home: boolean;
  asked_for_dob: boolean;
  asked_for_address: boolean;
}

export interface ExtractedData {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  phone_number?: string;
  address?: string;
  zip_code?: string;
  state?: string;
  email?: string;
  auto_insurance?: AutoInsurance;
  home_insurance?: HomeInsurance;
  health_insurance?: HealthInsurance;
}

export interface ValidationResult {
  classification: ValidationStatus;
  confidence_score: number;
  reasons?: string[];
  extracted_data: ExtractedData;
  missing_information?: string[];
  data_discrepancies?: string[];
  agent_feedback?: AgentFeedback;
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
