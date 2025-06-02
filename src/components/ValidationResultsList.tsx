import React from 'react';
import { StoredValidationResult } from '../services/validationResult';
import { FaCheckCircle, FaTimesCircle, FaExclamationTriangle, FaFileAudio } from 'react-icons/fa';

interface ValidationResultsListProps {
  results: StoredValidationResult[];
  onSelectResult: (result: StoredValidationResult) => void;
  isLoading: boolean;
}

const ValidationResultsList: React.FC<ValidationResultsListProps> = ({ 
  results, 
  onSelectResult, 
  isLoading 
}) => {
  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', { 
      dateStyle: 'medium', 
      timeStyle: 'short' 
    }).format(date);
  };

  // Get status icon based on validation status
  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'approved':
        return <FaCheckCircle className="status-icon approved" />;
      case 'rejected':
        return <FaTimesCircle className="status-icon rejected" />;
      case 'needs_review':
        return <FaExclamationTriangle className="status-icon review" />;
      default:
        return null;
    }
  };

  // Display empty state if no results
  if (results.length === 0 && !isLoading) {
    return (
      <div className="empty-state">
        <FaFileAudio className="empty-icon" />
        <h3>No validation results yet</h3>
        <p>Upload an audio file to start validating leads</p>
      </div>
    );
  }

  return (
    <div className="results-list-container">
      <h2>Validation Results</h2>
      
      {isLoading ? (
        <div className="loading-results">
          <div className="spinner" />
          <span>Loading results...</span>
        </div>
      ) : (
        <ul className="results-list">
          {results.map((result) => (
            <li 
              key={result.id} 
              className={`result-item ${result.status}`}
              onClick={() => onSelectResult(result)}
            >
              <div className="result-item-header">
                <div className="result-status">
                  {getStatusIcon(result.status)}
                  <span className="status-text">{result.status.replace('_', ' ')}</span>
                </div>
                <span className="result-date">{formatDate(result.created_at)}</span>
              </div>
              
              <div className="result-item-content">
                <div className="contact-info">
                  <div className="name">
                    {result.extractedData.firstName || result.extractedData.lastName ? (
                      <>
                        {result.extractedData.firstName || ''} {result.extractedData.lastName || ''}
                      </>
                    ) : (
                      <span className="not-detected">Name not detected</span>
                    )}
                  </div>
                  
                  <div className="phone">
                    {result.extractedData.phoneNumber ? (
                      formatPhoneNumber(result.extractedData.phoneNumber)
                    ) : (
                      <span className="not-detected">Phone not detected</span>
                    )}
                  </div>
                </div>
                
                <div className="file-info">
                  <span className="file-name">{result.file_name}</span>
                  <span className="confidence">
                    Confidence: {(result.confidenceScore * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Helper function to format phone numbers as (XXX) XXX-XXXX
function formatPhoneNumber(phoneNumber: string): string {
  const cleaned = ('' + phoneNumber).replace(/\D/g, '');
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return '(' + match[1] + ') ' + match[2] + '-' + match[3];
  }
  return phoneNumber;
}

export default ValidationResultsList;
