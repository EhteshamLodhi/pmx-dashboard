'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!installEvent || dismissed) return null;

  const install = async () => {
    if (isInstalling) return;
    try {
      setIsInstalling(true);
      await installEvent.prompt();
      await installEvent.userChoice;
      setInstallEvent(null);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="fixed left-4 right-4 bottom-20 md:left-auto md:right-6 md:bottom-6 md:w-80 z-50 bg-white border border-green-100 shadow-2xl rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
          <Download className="w-4 h-4 text-green-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">Install PowerMatix</p>
          <p className="text-xs text-gray-500 mt-1">Add the portal to your device for quick access.</p>
          <button
            onClick={() => void install()}
            disabled={isInstalling}
            className="mt-3 px-3 py-2 rounded-xl bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isInstalling ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Installing...
              </span>
            ) : 'Install App'}
          </button>
        </div>
        <button onClick={() => setDismissed(true)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
