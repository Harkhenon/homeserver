import { useState, useEffect } from 'react';
import { Switch, Group, Text, Tooltip, Badge, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconLock } from '@tabler/icons-react';
import { call } from '../api/client';
import type { CertInfo } from '../types';

interface SslToggleProps {
  domain: string;
  onChanged?: () => void;
}

export function SslToggle({ domain, onChanged }: SslToggleProps) {
  const [certInfo, setCertInfo] = useState<CertInfo | null>(null);
  const [certExists, setCertExists] = useState<boolean | null>(null);
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    call<{ domains: string[] }>('ssl', 'certs.list')
      .then((d) => { if (!cancelled) setCertExists((d.domains ?? []).includes(domain)); })
      .catch(() => { if (!cancelled) setCertExists(false); });
    call<CertInfo>('ssl', 'certs.info', { domain })
      .then((info) => { if (!cancelled) setCertInfo(info); })
      .catch(() => { if (!cancelled) setCertInfo(null); });
    return () => { cancelled = true; };
  }, [domain]);

  const toggle = async (checked: boolean) => {
    if (!checked) {
      notifications.show({ message: 'La révocation manuelle n\'est pas gérée — supprime le cert via certbot.', color: 'orange' });
      return;
    }
    setIssuing(true);
    try {
      await call('ssl', 'certs.issue', { domain, email: `admin@${domain}` });
      notifications.show({ message: `Certificat SSL émis pour ${domain}`, color: 'green' });
      setCertExists(true);
      const info = await call<CertInfo>('ssl', 'certs.info', { domain });
      setCertInfo(info);
      onChanged?.();
    } catch (err) {
      notifications.show({ message: err instanceof Error ? err.message : 'Échec de l\'émission', color: 'red' });
    } finally {
      setIssuing(false);
    }
  };

  if (issuing) {
    return (
      <Group gap={6} wrap="nowrap">
        <Switch checked size="sm" disabled />
        <Loader size="xs" color="teal" />
        <Text size="xs" c="dimmed">Émission…</Text>
      </Group>
    );
  }

  if (certExists && certInfo) {
    const days = certInfo.daysLeft ?? 0;
    return (
      <Tooltip label={`Expire dans ${days} jours${certInfo.autoRenew ? ' — renouvellement auto' : ''}`} withinPortal>
        <Group gap={6} wrap="nowrap">
          <Switch checked size="sm" onChange={(e) => void toggle(e.currentTarget.checked)} />
          <Badge color={days < 15 ? 'red' : days < 30 ? 'orange' : 'teal'} variant="light" size="sm">
            {days} j
          </Badge>
        </Group>
      </Tooltip>
    );
  }

  return (
    <Tooltip label={`Émettre un certificat Let's Encrypt pour ${domain}`} withinPortal>
      <Group gap={6} wrap="nowrap">
        <Switch checked={false} size="sm" onChange={(e) => void toggle(e.currentTarget.checked)} />
        <IconLock size={14} stroke={1.5} style={{ opacity: 0.5 }} />
      </Group>
    </Tooltip>
  );
}
