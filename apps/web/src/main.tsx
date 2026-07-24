import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './auth/AuthPage';
import { AuthProvider } from './auth/AuthProvider';
import { CallbackPage } from './auth/CallbackPage';
import { HistoryPage } from './auth/HistoryPage';
import { LandingPage } from './pages/LandingPage';
import { ProductPage } from './pages/ProductPage';
import { WorkbenchPage } from './pages/WorkbenchPage';
import './styles.css';
import './site.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/product" element={<ProductPage />} />
          <Route path="/app" element={<WorkbenchPage />} />
          {/* editing and visualization share one screen now; /run is kept so
              old links and bookmarks still land somewhere sensible */}
          <Route path="/run" element={<Navigate to="/app" replace />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/auth/callback" element={<CallbackPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
