import { useEffect, useState, useCallback } from 'react';
import { call } from './client';

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface QueryOptions {
  refetchInterval?: number;
}

export function useModuleQuery<T>(prefix: string, action: string, payload?: unknown, options?: QueryOptions) {
  const [state, setState] = useState<QueryState<T>>({ data: null, loading: true, error: null });

  const reload = useCallback(async (silent = false) => {
    setState((s) => ({ ...s, loading: silent ? false : true, error: silent ? s.error : null }));
    try {
      const data = await call<T>(prefix, action, payload);
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: err instanceof Error ? err.message : 'Erreur' });
    }
  }, [prefix, action, JSON.stringify(payload)]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!options?.refetchInterval) return;
    const id = setInterval(() => {
      void reload(true);
    }, options.refetchInterval);
    return () => clearInterval(id);
  }, [reload, options?.refetchInterval]);

  return { ...state, reload };
}

export function useModuleAction(prefix: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(action: string, payload?: unknown): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      return await call<T>(prefix, action, payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      return null;
    } finally {
      setLoading(false);
    }
  }, [prefix]);

  return { run, loading, error, setError };
}
