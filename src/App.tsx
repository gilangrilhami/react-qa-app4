import React, { useState, useEffect } from 'react';
import './App.css';
// Check if these paths match your project structure
import { AudioTranscriptionResponse, transcribeAudio, validateLead, } from './services/edgeFunctions';
import { getFileText } from './services/storage';
import { ValidationResult } from './types';
import FileUpload from './components/FileUpload';
import ValidationResultComponent from './components/ValidationResult';
import ValidationResultsList from './components/ValidationResultsList';
import { verifyContact } from './services/melissaApi';
import { isValidZipCode } from './util';
import { saveValidationResult, getValidationResults, getValidationResultById, StoredValidationResult } from './services/validationResult';
import { FaArrowLeft } from 'react-icons/fa';

const App: React.FC = () => {
  console.log("Deepgram API Key:", process.env.REACT_APP_DEEPGRAM_API_KEY ? "Set (length: " + process.env.REACT_APP_DEEPGRAM_API_KEY.length + ")" : "Not set");
  console.log("OpenAI API Key:", process.env.REACT_APP_OPENAI_API_KEY ? "Set (length: " + process.env.REACT_APP_OPENAI_API_KEY.length + ")" : "Not set");
  console.log("Melissa API Key:", process.env.REACT_APP_MELISSA_API_KEY ? "Set (length: " + process.env.REACT_APP_MELISSA_API_KEY.length + ")" : "Not set");

  // State for file and processing
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  
  // State for saved results
  const [savedResults, setSavedResults] = useState<StoredValidationResult[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState<boolean>(false);
  const [selectedResult, setSelectedResult] = useState<StoredValidationResult | null>(null);
  const [view, setView] = useState<'list' | 'detail'>('list');

  // Load validation results when the component mounts
  useEffect(() => {
    fetchValidationResults();
  }, []);

  // Fetch validation results from Supabase
  const fetchValidationResults = async () => {
    setIsLoadingResults(true);
    try {
      const results = await getValidationResults();
      console.log('Fetched validation results:', results);
      setSavedResults(results);
    } catch (error) {
      console.error('Error fetching validation results:', error);
    } finally {
      setIsLoadingResults(false);
    }
  };

  // Handle showing details of a selected validation result
  const handleSelectResult = (result: StoredValidationResult) => {
    setSelectedResult(result);
    setTranscript(result.transcript || '');
    setView('detail');
  };

  // Go back to the results list
  const handleBackToList = () => {
    setSelectedResult(null);
    setView('list');
  };

  // After file processing is complete, save to Supabase and refresh the list
  const handleSaveResult = async (result: ValidationResult, transcript: string, fileName: string) => {
    try {
      const savedResult = await saveValidationResult(result, transcript, fileName);
      // Refresh the results list
      await fetchValidationResults();
      
      // If the result was saved successfully, switch to detail view
      if (savedResult) {
        setSelectedResult(savedResult);
        setView('detail');
      }
    } catch (error) {
      console.error('Error saving validation result:', error);
    }
  };

  // Extract phone number from filename (assuming filename contains a 10-digit number)
  const extractPhoneFromFilename = (filename: string): string => {
    const match = filename.match(/\d{10}/);
    return match ? match[0] : '';
  };

  // Process the dropped or selected file
  const processFile = async (file: File) => {
    setIsLoading(true);
    setFile(file);
    setFileName(file.name);
    
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
      const transcription: AudioTranscriptionResponse = await getTranscription(file);
      const transcriptAudioUrl = transcription.audioUrl;
      const trancriptJsonUrl = transcription.jsonUrl;
      const transcriptTextPath = transcription.transcriptTextPath;
      const transcript = await getFileText(transcriptTextPath);
      setTranscript(transcript);
      
      // Step 4: Use OpenAI to validate the lead based on transcript and Melissa data
      // Pass both the transcript and the Melissa data to OpenAI
      const openAIResult: ValidationResult = await validateLead(
        transcriptTextPath, 
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
        
        // Save to Supabase
        await handleSaveResult(mergedResult, transcript, fileName);
      } else {
        // If OpenAI didn't return results, just use what we have from Melissa
        setValidationResult(result);
        console.log("Using Melissa-only validation result:", result);
        
        // Save to Supabase
        await handleSaveResult(result, transcript, fileName);
      }
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Error processing file. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Get transcription from Deepgram API
  const getTranscription = async (file: File): Promise<AudioTranscriptionResponse> => {
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
          {/* Always show the file upload component */}
          <FileUpload onFileSelect={processFile} />
          
          {/* Display content based on current view state */}
          <div className="result-container">
            {/* Show loading spinner when processing a file */}
            {isLoading && (
              <div className="loading">
                <div className="spinner"></div>
                <p>Processing audio file...</p>
              </div>
            )}
            
            {/* In list view mode, show the validation results list */}
            {!isLoading && view === 'list' && (
              <ValidationResultsList 
                results={savedResults}
                onSelectResult={handleSelectResult}
                isLoading={isLoadingResults}
              />
            )}
            
            {/* In detail view mode, show the selected validation result */}
            {!isLoading && view === 'detail' && selectedResult && (
              <>
                <button className="back-button" onClick={handleBackToList}>
                  <FaArrowLeft className="back-icon" /> Back to results
                </button>
                <ValidationResultComponent 
                  result={selectedResult}
                  transcript={selectedResult.transcript}
                />
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;