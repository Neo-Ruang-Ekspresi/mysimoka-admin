import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthExpiredError, PermissionError } from '@/api/errors';
import { AuthProvider } from '@/auth/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import { applyInitialTheme } from '@/components/layout/theme';
import { App } from './App';
import './index.css';

applyInitialTheme();

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: error => {
      // Sesi habis: AuthContext otomatis menerima session kosong → RequireAuth redirect ke /login.
      if (error instanceof AuthExpiredError) queryClient.clear();
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof PermissionError || error instanceof AuthExpiredError) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
