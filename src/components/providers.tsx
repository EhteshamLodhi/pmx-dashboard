'use client';

import { useEffect, type ReactNode } from 'react';
import { AppProvider } from '@/app/context/AppContext';
import { Toaster } from '@/app/components/ui/sonner';
import { PwaInstallPrompt } from '@/components/pwa-install-prompt';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => registration.update())
        .catch((error) => {
          console.error('Service worker registration failed', error);
        });
    }
  }, []);

  return (
    <AppProvider>
      {children}
      <PwaInstallPrompt />
      <Toaster position="top-right" richColors closeButton />
    </AppProvider>
  );
}
