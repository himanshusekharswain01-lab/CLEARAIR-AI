import React, { useState } from 'react';
import { Download, WifiOff } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Install on iOS
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          >
            <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
              <h3 id="ios-install-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Install ClearAir AI on iOS
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                1. Tap the <strong>Share</strong> icon in Safari’s toolbar.
                <br />
                2. Scroll down and select <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-slate-900 dark:bg-slate-100 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:opacity-90 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-950 px-3.5 py-2 text-xs font-medium text-amber-100 shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
      <span>Offline Mode — Showing last cached environmental readings</span>
    </div>
  );
};
