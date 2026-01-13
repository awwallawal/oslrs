import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

interface StaffVerificationData {
  id: string;
  fullName: string;
  status: string;
  role: string;
  lga: string;
  photoUrl: string | null;
  verifiedAt: string;
}

const VerificationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<StaffVerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVerification = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
        const response = await fetch(`${API_URL}/users/verify/${id}`);

        if (!response.ok) {
           if (response.status === 404) {
               throw new Error('Staff member not found');
           }
           throw new Error('Verification failed');
        }

        const result = await response.json();
        setData(result.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchVerification();
    }
  }, [id]);

  if (loading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-700 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Verifying staff credentials...</p>
              </div>
          </div>
      );
  }

  if (error || !data) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
              <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center border-t-4 border-red-500">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                      <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Verification Failed</h2>
                  <p className="text-gray-600">{error || 'Staff member not found'}</p>
              </div>
          </div>
      );
  }

  return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-lg border border-gray-200">
              <div className="bg-green-800 py-4 px-6 text-center">
                  <h1 className="text-white font-bold text-lg tracking-wide uppercase">Oyo State Government</h1>
                  <p className="text-green-100 text-sm">Labour & Skills Registry</p>
              </div>
              
              <div className="p-8">
                  <div className="flex flex-col items-center">
                      <div className="relative">
                          {data.photoUrl ? (
                              <img 
                                  className="h-32 w-32 rounded-full object-cover border-4 border-white shadow-lg" 
                                  src={data.photoUrl} 
                                  alt={data.fullName} 
                              />
                          ) : (
                              <div className="h-32 w-32 rounded-full bg-gray-200 flex items-center justify-center border-4 border-white shadow-lg">
                                  <svg className="h-16 w-16 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                                  </svg>
                              </div>
                          )}
                          <div className="absolute bottom-0 right-0 bg-green-500 text-white p-1 rounded-full border-2 border-white shadow-sm" title="Verified">
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                              </svg>
                          </div>
                      </div>

                      <div className="mt-6 text-center">
                          <h2 className="text-2xl font-bold text-gray-900">{data.fullName}</h2>
                          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mt-1">{data.role}</p>
                          
                          <div className="mt-4 flex items-center justify-center space-x-2">
                             <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                                  ● {data.status === 'active' ? 'Verified Active' : data.status}
                             </span>
                          </div>

                          <div className="mt-6 border-t border-gray-100 pt-4 w-full">
                              <div className="flex justify-between text-sm">
                                  <span className="text-gray-500">LGA Assignment</span>
                                  <span className="font-medium text-gray-900">{data.lga || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between text-sm mt-2">
                                  <span className="text-gray-500">Verified On</span>
                                  <span className="font-medium text-gray-900">
                                      {new Date(data.verifiedAt).toLocaleDateString()}
                                  </span>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>

              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 text-center">
                  <p className="text-xs text-gray-500">
                      This is an official verification page of the Oyo State Labour & Skills Registry (OSLSR).
                  </p>
              </div>
          </div>
      </div>
  );
};

export default VerificationPage;
