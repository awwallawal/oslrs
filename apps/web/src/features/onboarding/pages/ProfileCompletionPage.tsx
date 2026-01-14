import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { SkeletonCard } from '../../../components/skeletons';
import LiveSelfieCapture from '../components/LiveSelfieCapture';
import IDCardDownload from '../components/IDCardDownload';

const ProfileCompletionPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'intro' | 'selfie' | 'success'>('intro');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ originalUrl: string; idCardUrl: string } | null>(null);

  const handleSelfieCapture = async (file: File) => {
    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('token'); 
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
      
      const res = await fetch(`${apiUrl}/users/selfie`, {
        method: 'POST',
        headers: {
            'Authorization': token ? `Bearer ${token}` : '',
        },
        body: formData
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || 'Upload failed');
      }

      setResult({
        originalUrl: data.data.liveSelfieOriginalUrl,
        idCardUrl: data.data.liveSelfieIdCardUrl
      });
      setStep('success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Profile Completion</h1>
      
      {step === 'intro' && (
        <div className="space-y-4">
          <p className="text-neutral-700">Please take a live selfie for your ID card.</p>
          <button
            onClick={() => setStep('selfie')}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded transition-colors"
          >
            Start Verification
          </button>
        </div>
      )}

      {step === 'selfie' && (
        <div className="space-y-4">
          {error && <div className="p-4 bg-red-100 text-red-700 rounded">{error}</div>}
          
          {isUploading ? (
            <div className="text-center py-12">
              <SkeletonCard lines={2} className="max-w-sm mx-auto mb-4" />
              <p className="text-neutral-600">Uploading and verifying...</p>
            </div>
          ) : (
            <ErrorBoundary
              fallbackProps={{
                title: 'Camera Error',
                description: 'Unable to access the camera. Please check permissions and try again.',
              }}
            >
              <LiveSelfieCapture onCapture={handleSelfieCapture} />
            </ErrorBoundary>
          )}
        </div>
      )}

      {step === 'success' && result && (
        <div className="space-y-4 text-center">
            <div className="p-4 bg-green-100 text-green-700 rounded">Verification Successful!</div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <p className="text-sm text-gray-500 mb-2">Original</p>
                    <img src={result.originalUrl} alt="Original" className="w-full rounded" />
                </div>
                <div>
                    <p className="text-sm text-gray-500 mb-2">ID Card Crop</p>
                    <img src={result.idCardUrl} alt="ID Card" className="w-full rounded" />
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Your ID Card is Ready</h3>
                <ErrorBoundary
                  fallbackProps={{
                    title: 'Download Error',
                    description: 'Unable to prepare the ID card download. Please try again.',
                    showHomeLink: false,
                  }}
                >
                  <IDCardDownload />
                </ErrorBoundary>
            </div>

            <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded mt-4 transition-colors"
            >
                Continue to Dashboard
            </button>
        </div>
      )}
    </div>
  );
};

export default ProfileCompletionPage;
