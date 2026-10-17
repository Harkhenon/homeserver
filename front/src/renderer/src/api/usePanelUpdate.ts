import { useCallback, useEffect, useRef, useState } from 'react';
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

  // Suivi automatique : si lastRun.result === 'running' (apply lancé où que ce soit,
  // bouton ou timer), on poll la progression toutes les 10s et on maintient
  // applying=true jusqu'à la fin (ok → reload, échec → applying=false).
  useEffect(() => {
    if (status.data?.lastRun?.result !== 'running') return;
    setApplying(true);
    const id = setInterval(() => { void status.reload(true); }, 10_000);
    return () => clearInterval(id);
  }, [status.data?.lastRun?.result]);

  // Fin de running → notification + applying=false
  const prevRunning = useRef(false);
  useEffect(() => {
    const result = status.data?.lastRun?.result;
    const isRunning = result === 'running';
    if (prevRunning.current && !isRunning && result) {
      setApplying(false);
      if (result === 'ok') {
        notifications.show({ message: 'Mise à jour terminée — rechargement de la page', color: 'green' });
        setTimeout(() => window.location.reload(), 1500);
      }
    }
    prevRunning.current = isRunning;
  }, [status.data?.lastRun?.result]);

  const apply = useCallback(async (): Promise<boolean> => {
    setApplying(true);
    const res = await action.run<PanelUpdateStatus>('panel.update');
    setApplying(false);
    if (res === null) {
      if (action.error) notifications.show({ message: action.error, color: 'red' });
      return false;
    }
    const result = res.lastRun?.result;
    if (result === 'running') {
      // L'apply tourne en arrière-plan (systemd oneshot, plusieurs minutes) —
      // on rend la main : le poll de status (panel.check) suit la progression,
      // et la modale affiche l'état « en cours » via useEffect ci-dessous.
      notifications.show({ message: 'Mise à jour lancée — le panel redémarrera à la fin', color: 'blue' });
      return true;
    }
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
