'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

type ActionMessages = {
  loading?: string;
  success?: string;
  error?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useActionRunner() {
  const inFlight = useRef(new Set<string>());
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const runAction = useCallback(
    async <T,>(key: string, action: () => Promise<T>, messages: ActionMessages = {}) => {
      if (inFlight.current.has(key)) return undefined;

      inFlight.current.add(key);
      setPending((value) => ({ ...value, [key]: true }));

      const toastId = messages.loading ? toast.loading(messages.loading) : undefined;

      try {
        const result = await action();
        if (messages.success) {
          toast.success(messages.success, toastId ? { id: toastId } : undefined);
        } else if (toastId) {
          toast.dismiss(toastId);
        }
        return result;
      } catch (error) {
        toast.error(getErrorMessage(error, messages.error ?? 'Request failed.'), toastId ? { id: toastId } : undefined);
        throw error;
      } finally {
        inFlight.current.delete(key);
        setPending((value) => ({ ...value, [key]: false }));
      }
    },
    [],
  );

  const isPending = useCallback((key: string) => Boolean(pending[key]), [pending]);

  return { isPending, runAction };
}
