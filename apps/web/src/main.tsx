import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthPage } from './auth/AuthPage';
import { AuthProvider } from './auth/AuthProvider';
import { CallbackPage } from './auth/CallbackPage';
import { HistoryPage } from './auth/HistoryPage';
import { LandingPage } from './pages/LandingPage';
import { PastePage } from './pages/PastePage';
import { ProductPage } from './pages/ProductPage';
import { RunPage } from './pages/RunPage';
import './styles.css';
import './site.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/product" element={<ProductPage />} />
          <Route path="/app" element={<PastePage />} />
          <Route path="/run" element={<RunPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/auth/callback" element={<CallbackPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
