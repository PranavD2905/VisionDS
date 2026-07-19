import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PastePage } from './pages/PastePage';
import { RunPage } from './pages/RunPage';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PastePage />} />
        <Route path="/run" element={<RunPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
