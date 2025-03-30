import React, { useState } from 'react';
import './App.css';
// Check if these paths match your project structure
import { transcribeAudio, validateLeadWithOpenAI } from './services/api';
import { ValidationResult } from './types'; // Removed MelissaVerificationResult import
import FileUpload from './components/FileUpload';
import ValidationResultComponent from './components/ValidationResult';
import { verifyContact } from './services/melissaApi';
import { isValidZipCode } from './util';

const App: React.FC = () => {
  console.log("Deepgram API Key:", process.env.REACT_APP_DEEPGRAM_API_KEY ? "Set (length: " + process.env.REACT_APP_DEEPGRAM_API_KEY.length + ")" : "Not set");
  console.log("OpenAI API Key:", process.env.REACT_APP_OPENAI_API_KEY ? "Set (length: " + process.env.REACT_APP_OPENAI_API_KEY.length + ")" : "Not set");
  console.log("Melissa API Key:", process.env.REACT_APP_MELISSA_API_KEY ? "Set (length: " + process.env.REACT_APP_MELISSA_API_KEY.length + ")" : "Not set");

  // Using the file state to keep reference to the current file
  const [, setFile] = useState<File | null>(null); // Removed unused variable
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  // Rest of the component code remains unchanged
  // ... (rest of the existing code)

  // Extract phone number from filename (assuming filename contains a 10-digit number)
  const extractPhoneFromFilename = (filename: string): string => {
    const match = filename.match(/\d{10}/);
    return match ? match[0] : '';
  };

  // Process the dropped or selected file
  const processFile = async (file: File) => {
    setIsLoading(true);
    setFile(file);
    
    try {
      // Step 1: Extract phone number from filename
      const phoneNumber = extractPhoneFromFilename(file.name);
      if (!phoneNumber) {
        console.warn("Couldn't extract phone number from filename");
      } else {
        console.log(`Extracted phone number: ${phoneNumber}`);
      }
      
      // Step 2: First query Melissa API with phone number to get authoritative data
      let melissaData: any = null; // Using proper type
      let result: ValidationResult = {
        status: 'needs_review',
        confidenceScore: 0.5,
        needsManualReview: false,
        extractedData: {
          // Initialize with empty data
          firstName: '',
          lastName: '',
          address: '',
          zip: '',
          state: '',
          phoneNumber: phoneNumber,
          email: '',
          dob: '',
          // Default empty insurance objects
          autoInsurance: {
            mainVehicle: { year: '', make: '', model: '' },
            currentProvider: ''
          },
          homeInsurance: {
            interested: null,
            ownership: '',
            homeType: '',
            currentProvider: ''
          },
          healthInsurance: {
            interested: null,
            householdSize: null,
            currentProvider: ''
          }
        },
        melissaLookupAttempted: false
      };
      
      // Always attempt Melissa lookup if phone number is available
      if (phoneNumber && process.env.REACT_APP_MELISSA_API_KEY) {
        try {
          console.log("Querying Melissa with phone number...");
          melissaData = await verifyContact({ phoneNumber });
          
          result.melissaLookupAttempted = true;
          
          // ALWAYS use Melissa data as authoritative for contact info when available
          if (melissaData.firstName) {
            result.extractedData.firstName = melissaData.firstName;
            result.nameFromMelissa = true;
          }
          
          if (melissaData.lastName) {
            result.extractedData.lastName = melissaData.lastName;
            result.nameFromMelissa = true;
          }
          
          if (melissaData.address) {
            result.extractedData.address = melissaData.address;
            result.addressFromMelissa = true;
          }
          
          if (melissaData.city) {
            result.extractedData.city = melissaData.city;
          }
          
          if (melissaData.state) {
            result.extractedData.state = melissaData.state;
          }
          
          if (melissaData.zip) {
            result.extractedData.zip = melissaData.zip;
            
            // Validate ZIP code
            if (!isValidZipCode(melissaData.zip)) {
              result.invalidZip = true;
              result.needsManualReview = true;
              result.manualReviewReasons = ["Invalid ZIP code from Melissa"];
            }
          }
          
          // Set verification flags directly from Melissa
          result.nameVerified = melissaData.isNameVerified;
          result.addressVerified = melissaData.isAddressVerified;
          result.melissaAddressFound = melissaData.melissaAddressFound;
          result.melissaNameFound = melissaData.melissaNameFound;
          
          // Store suggested corrections from Melissa if available
          if (melissaData.suggestedAddress) {
            result.suggestedAddress = melissaData.suggestedAddress;
          }
          
          if (melissaData.suggestedName) {
            result.suggestedName = melissaData.suggestedName;
          }
          
          console.log("Data obtained from Melissa:", {
            firstName: result.extractedData.firstName,
            lastName: result.extractedData.lastName,
            address: result.extractedData.address,
            city: result.extractedData.city,
            state: result.extractedData.state,
            zip: result.extractedData.zip,
            nameVerified: result.nameVerified,
            addressVerified: result.addressVerified
          });
        } catch (melissaError) {
          console.error('Error with Melissa lookup:', melissaError);
          result.melissaLookupAttempted = true;
          result.needsManualReview = true;
          result.manualReviewReasons = ["Failed to retrieve data from Melissa"];
        }
      } else {
        console.log('Skipping Melissa verification - no phone number or API key');
        result.melissaLookupAttempted = false;
        result.needsManualReview = true;
        result.manualReviewReasons = ["No phone number or Melissa API key available"];
      }
      
      // Step 3: Transcribe audio with Deepgram
      const transcription = await getTranscription(file);
      setTranscript(transcription);
      
      // Step 4: Use OpenAI to validate the lead based on transcript and Melissa data
      // Pass both the transcript and the Melissa data to OpenAI
      const openAIResult = await validateLeadWithOpenAI(
        transcription, 
        phoneNumber,
        {
          melissaData: {
            firstName: result.extractedData.firstName,
            lastName: result.extractedData.lastName,
            address: result.extractedData.address,
            city: result.extractedData.city,
            state: result.extractedData.state,
            zip: result.extractedData.zip,
            nameVerified: result.nameVerified,
            addressVerified: result.addressVerified,
            phoneVerified: result.melissaLookupAttempted
          }
        }
      );
      
      // Step 5: Create final merged result
      if (openAIResult) {
        // Merge OpenAI validation results with Melissa data
        // Keep Melissa's contact data as authoritative but use OpenAI for insurance information
        const mergedResult = {
          ...openAIResult,
          extractedData: {
            ...openAIResult.extractedData,
            // Prioritize Melissa data for contact information
            firstName: result.extractedData.firstName || openAIResult.extractedData.firstName,
            lastName: result.extractedData.lastName || openAIResult.extractedData.lastName,
            address: result.extractedData.address || openAIResult.extractedData.address,
            city: result.extractedData.city || openAIResult.extractedData.city,
            state: result.extractedData.state || openAIResult.extractedData.state,
            zip: result.extractedData.zip || openAIResult.extractedData.zip,
            phoneNumber: phoneNumber || openAIResult.extractedData.phoneNumber
          },
          // Preserve metadata about data origins
          nameFromMelissa: result.nameFromMelissa,
          addressFromMelissa: result.addressFromMelissa,
          nameVerified: result.nameVerified,
          addressVerified: result.addressVerified,
          melissaLookupAttempted: result.melissaLookupAttempted,
          melissaAddressFound: result.melissaAddressFound,
          melissaNameFound: result.melissaNameFound,
          suggestedAddress: result.suggestedAddress,
          suggestedName: result.suggestedName,
          invalidZip: result.invalidZip
        };
        
        // Transfer any manual review reasons
        if (result.manualReviewReasons && result.manualReviewReasons.length > 0) {
          if (!mergedResult.manualReviewReasons) {
            mergedResult.manualReviewReasons = [];
          }
          mergedResult.manualReviewReasons.push(...result.manualReviewReasons);
          mergedResult.needsManualReview = true;
        }
        
        // Store transcript data for comparison if it differs from Melissa
        if (openAIResult.extractedData.firstName && 
            result.extractedData.firstName && 
            openAIResult.extractedData.firstName.toLowerCase() !== result.extractedData.firstName.toLowerCase()) {
          mergedResult.transcriptFirstName = openAIResult.extractedData.firstName;
        }
        
        if (openAIResult.extractedData.lastName && 
            result.extractedData.lastName && 
            openAIResult.extractedData.lastName.toLowerCase() !== result.extractedData.lastName.toLowerCase()) {
          mergedResult.transcriptLastName = openAIResult.extractedData.lastName;
        }
        
        if (openAIResult.extractedData.address && 
            result.extractedData.address && 
            openAIResult.extractedData.address.toLowerCase() !== result.extractedData.address.toLowerCase()) {
          mergedResult.transcriptAddress = openAIResult.extractedData.address;
        }
        
        if (openAIResult.extractedData.zip && 
            result.extractedData.zip && 
            openAIResult.extractedData.zip !== result.extractedData.zip) {
          mergedResult.transcriptZip = openAIResult.extractedData.zip;
        }
        
        // Flag discrepancies for manual review
        const discrepancies = [];
        if (mergedResult.transcriptFirstName) discrepancies.push("First name differs between Melissa and transcript");
        if (mergedResult.transcriptLastName) discrepancies.push("Last name differs between Melissa and transcript");
        if (mergedResult.transcriptAddress) discrepancies.push("Address differs between Melissa and transcript");
        if (mergedResult.transcriptZip) discrepancies.push("ZIP code differs between Melissa and transcript");
        
        if (discrepancies.length > 0) {
          if (!mergedResult.manualReviewReasons) {
            mergedResult.manualReviewReasons = [];
          }
          mergedResult.manualReviewReasons.push(...discrepancies);
          mergedResult.needsManualReview = true;
        }
        
        // Set final validation result
        setValidationResult(mergedResult);
        console.log("Final merged validation result:", mergedResult);
      } else {
        // If OpenAI didn't return results, just use what we have from Melissa
        setValidationResult(result);
        console.log("Using Melissa-only validation result:", result);
      }
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Error processing file. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Get transcription from Deepgram API
  const getTranscription = async (file: File): Promise<string> => {
    try {
      const transcript = await transcribeAudio(file);
      console.log("Transcription successful:", transcript);
      return transcript;
    } catch (error) {
      console.error('Error with Deepgram transcription:', error);
      alert('Error transcribing audio: ' + (error as Error).message);
      throw error;
    }
  };

  return (
    <div className="app-container">
      <header>
        <div className="logo">
          <h1>QUIN<span>AI</span></h1>
        </div>
      </header>
      
      <main className="content">
        <div className="qa-container">
          <FileUpload onFileSelect={processFile} />
          
          <div className="result-container">
            <h2>AI QA Result{isLoading ? '...' : ''}</h2>
            
            {isLoading && (
              <div className="loading">
                <div className="spinner"></div>
                <p>Processing audio file...</p>
              </div>
            )}
            
            {!isLoading && validationResult && (
              <ValidationResultComponent 
                result={validationResult}
                transcript={transcript} 
              />
            )}
            
            {!isLoading && !validationResult && (
              <div className="no-result">
                <p>Upload an audio file to see QA results</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;