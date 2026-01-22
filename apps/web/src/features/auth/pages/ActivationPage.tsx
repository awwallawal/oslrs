import { useParams, useNavigate } from 'react-router-dom';
import { ActivationForm } from '../components/ActivationForm';
import { useState } from 'react';

export default function ActivationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [activated, setActivated] = useState(false);

  const handleSuccess = () => {
    setActivated(true);
    // Optional: Auto-redirect after delay, but provide manual link
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
        <p className="text-green-700 mb-6">Your profile has been completed.</p>
        <button 
          onClick={() => navigate('/login')}
          className="px-6 py-2 bg-green-700 text-white rounded hover:bg-green-800 font-medium"
        >
          Login Now
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <ActivationForm token={token} onSuccess={handleSuccess} />
    </div>
  );
}
