import { useParams, useNavigate } from 'react-router-dom';
import { ActivationForm } from '../components/ActivationForm.js';
import { useState } from 'react';

export default function ActivationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [activated, setActivated] = useState(false);

  const handleSuccess = (user: any) => {
    setActivated(true);
    setTimeout(() => {
      navigate('/login');
    }, 3000);
  };

  if (!token) {
    return <div className="text-center p-10 text-red-600">Invalid activation link.</div>;
  }

  if (activated) {
    return (
      <div className="max-w-md mx-auto mt-20 p-10 bg-green-50 rounded border border-green-200 text-center">
        <h2 className="text-2xl font-bold text-green-800 mb-2">Account Activated!</h2>
        <p className="text-green-700">Your profile has been completed. Redirecting to login...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <ActivationForm token={token} onSuccess={handleSuccess} />
    </div>
  );
}
