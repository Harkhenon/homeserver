import { useCallback, useState } from 'react';
import { notifications } from '@mantine/notifications';
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
  const [applying, setApplying] = useState(false);

  const apply = useCallback(async (): Promise<boolean> => {
    setApplying(true);
    const res = await action.run<PanelUpdateStatus>('panel.update');
    setApplying(false);
    if (res === null) {
      if (action.error) notifications.show({ message: action.error, color: 'red' });
      return false;
    }
    const result = res.lastRun?.result;
    if (result === 'ok') {
      notifications.show({ message: 'Mise à jour terminée — rechargement de la page', color: 'green' });
      setTimeout(() => window.location.reload(), 1500);
    } else if (result === 'rolledBack') {
      notifications.show({
        message: 'Échec du health-check — retour automatique à la version précédente, rien à faire',
        color: 'orange',
      });
    } else if (result === 'noop') {
      notifications.show({ message: 'Le panel est déjà à jour', color: 'blue' });
    } else {
      notifications.show({ message: res.lastRun?.message ?? 'Mise à jour échouée', color: 'red' });
    }
    void status.reload();
    return result === 'ok';
  }, [action, status]);

  return { status, action, applying, apply };
}
