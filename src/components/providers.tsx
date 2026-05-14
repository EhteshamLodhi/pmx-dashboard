'use client';

import { useEffect, type ReactNode } from 'react';
import { AppProvider } from '@/app/context/AppContext';
import { PwaInstallPrompt } from '@/components/pwa-install-prompt';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  return (
    <AppProvider>
      {children}
      <PwaInstallPrompt />
    </AppProvider>
  );
}
