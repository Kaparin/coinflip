'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center max-w-md animate-fade-up">
        {/* Animated warning icon */}
        <div className="relative mx-auto mb-6 w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-amber-500/10 blur-xl animate-pulse" />
          <div className="relative w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center animate-bounce-slow">
            <AlertTriangle size={36} className="text-amber-400" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6 leading-relaxed">
          An unexpected error occurred. Your wallet and funds are safe.
          Please try again or refresh the page.
        </p>

        <div className="flex gap-3 justify-center">
          <Button variant="warning" size="md" onClick={reset}>
            <RotateCcw size={16} />
            Try again
          </Button>
          <Button variant="secondary" size="md" onClick={() => window.location.reload()}>
            <RefreshCw size={16} />
            Refresh page
          </Button>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <details className="mt-6 text-left">
            <summary className="text-[var(--color-text-secondary)] text-xs cursor-pointer hover:text-[var(--color-text)] transition-colors">
              Error details (dev only)
            </summary>
            <pre className="mt-2 text-xs text-red-400 bg-[var(--color-bg)] border border-[var(--color-border)] p-3 rounded-xl overflow-auto max-h-40">
              {error.message}
              {'\n'}
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
