import { useModuleQuery, useModuleAction } from './hooks';

export interface PanelUpdateStatus {
  schema?: number;
  lastCheck?: string;
  available?: boolean;
  latest?: { version: string; notes?: string } | null;
  lastRun?: { at: string; result: 'ok' | 'failed' | 'rolledBack' | 'running' | 'noop'; message?: string } | null;
  updaterHealth?: { core: string; updater: string; pairVersion?: string; selfUpdated?: boolean; checkedAt?: string };
}

export function usePanelUpdate(pollMs?: number) {
  const status = useModuleQuery<PanelUpdateStatus>('system', 'panel.check', undefined,
    pollMs ? { refetchInterval: pollMs } : undefined);
  const action = useModuleAction('system');
  return { status, action };
}
