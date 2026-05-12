'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';

function MicrosoftLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export default function SignIn({ initialError }: { initialError?: string | null }) {
  const { isLoggedIn } = useApp();
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError ?? null);

  useEffect(() => {
    if (isLoggedIn) router.push('/dashboard');
  }, [isLoggedIn, router]);

  const handleDemoAccessClick = () => {
    setError('Demo access is unavailable in the live environment. Please sign in with Microsoft.');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50 flex flex-col">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-green-100 opacity-40" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-green-100 opacity-30" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-green-50 opacity-50" />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-10 flex flex-col items-center">
          <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center shadow-lg mb-4">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-green-900 tracking-tight" style={{ fontSize: '28px', fontWeight: 700 }}>
            PowerMatix
          </h1>
          <p className="text-green-600 mt-1" style={{ fontSize: '13px', letterSpacing: '0.08em', fontWeight: 500 }}>
            ATTENDANCE TRACKING PORTAL
          </p>
        </div>

        <div className="w-full max-w-sm bg-white rounded-[22px] shadow-xl border border-gray-100 px-6 py-7">
          <div className="text-center mb-6">
            <h2 className="text-gray-900 mb-2" style={{ fontSize: '22px', fontWeight: 600 }}>
              Welcome back
            </h2>
            <p className="text-gray-500" style={{ fontSize: '14px' }}>
              Sign in to access the attendance portal
            </p>
          </div>

          <a
            href="/api/auth/sign-in"
            onClick={() => setError(null)}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 transition-all shadow-sm hover:shadow"
          >
            <MicrosoftLogo />
            <span className="text-gray-700" style={{ fontSize: '14px', fontWeight: 500 }}>
              Sign in with Microsoft
            </span>
          </a>

          <div className="mt-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-100" />
            <span className="text-gray-300" style={{ fontSize: '11px', fontWeight: 500 }}>
              OR
            </span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>

          <div className="mt-3 text-center">
            <p className="text-gray-400" style={{ fontSize: '12px' }}>
              Demo access available below
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleDemoAccessClick}
              className="h-10 rounded-xl border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
              style={{ fontSize: '13px', fontWeight: 500 }}
            >
              Employee Demo
            </button>
            <button
              type="button"
              onClick={handleDemoAccessClick}
              className="h-10 rounded-xl border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
              style={{ fontSize: '13px', fontWeight: 500 }}
            >
              Admin Demo
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-red-600" style={{ fontSize: '12px' }}>
              {error}
            </div>
          )}

          <div className="mt-6 flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
            <Shield className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <p className="text-gray-400" style={{ fontSize: '11px', lineHeight: '1.5' }}>
              Your session is secured. This portal is for authorized PowerMatix employees only.
            </p>
          </div>
        </div>

        <p className="mt-8 text-gray-400" style={{ fontSize: '12px' }}>
          © 2026 PowerMatix. All rights reserved.
        </p>
      </div>
    </div>
  );
}
