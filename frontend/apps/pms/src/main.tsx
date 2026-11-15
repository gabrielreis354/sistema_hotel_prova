import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient.js';
import { App } from './App.js';
// Fonte e tokens antes do CSS do app: a Inter vai no bundle (sem CDN, a comanda roda sem rede) e a
// marca é variável CSS (T-08.1).
import '@fontsource-variable/inter';
import '@hotel/ui/tokens.css';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root não encontrado');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
