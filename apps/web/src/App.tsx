import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ActivationPage from './features/auth/pages/ActivationPage';
import ProfileCompletionPage from './features/onboarding/pages/ProfileCompletionPage';
import VerificationPage from './features/onboarding/pages/VerificationPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={
          <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-h1 text-primary-600 font-brand mb-4">OSLSR</h1>
              <p className="text-body text-neutral-700">Oyo State Labour & Skills Registry</p>
            </div>
          </div>
        } />
        <Route path="/activate/:token" element={<ActivationPage />} />
        <Route path="/profile-completion" element={<ProfileCompletionPage />} />
        <Route path="/verify-staff/:id" element={<VerificationPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
