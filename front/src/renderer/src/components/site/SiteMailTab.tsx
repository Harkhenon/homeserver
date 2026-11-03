import { useState } from 'react';
import { Alert, Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { useModuleQuery } from '../../api/hooks';
import { ErrorBlock, LoadingBlock } from '../StateBlocks';
import { MailboxesPanel, mailCall } from '../mail/MailboxesPanel';
import type { MailDomain, MailStatus, Zone } from '../../types';

/** Plus long domaine connu dont `host` est lui-même ou un sous-domaine (blog.exemple.fr → exemple.fr). */
function longestSuffix(host: string, candidates: string[]): string | null {
  return candidates
    .filter((d) => host === d || host.endsWith(`.${d}`))
    .sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * Le mail dépend du domaine, pas du site : cet onglet est un raccourci vers les boîtes du domaine
 * de ce site. Elles survivent à la suppression du site.
 */
export function SiteMailTab({ vhost }: { vhost: { domain: string } }) {
  const status = useModuleQuery<MailStatus>('mail', 'status');
  const domains = useModuleQuery<{ domains: MailDomain[] }>('mail', 'domains.list');
  const zones = useModuleQuery<Zone[]>('bind9', 'zones.list');
  const [busy, setBusy] = useState(false);

  if ((status.loading && !status.data) || (domains.loading && !domains.data)) return <LoadingBlock />;
  if (status.error) return <ErrorBlock error={status.error} />;
  if (domains.error) return <ErrorBlock error={domains.error} />;

  if (!status.data?.configured) {
    return (
      <Alert color="blue" title="Service e-mail non activé">
        <Group justify="space-between">
          <Text size="sm">Active-le une fois pour ce serveur, puis crée les boîtes de ce site.</Text>
          <Button size="xs" component={Link} to="/mail">Activer</Button>
        </Group>
      </Alert>
    );
  }

  const mailDomain = longestSuffix(vhost.domain, (domains.data?.domains ?? []).map((d) => d.domain));
  if (mailDomain) {
    return (
      <Stack>
        <Text size="sm" c="dimmed">
          Boîtes de <Anchor component={Link} to={`/mail/${mailDomain}`}>{mailDomain}</Anchor>, le domaine de ce site. Elles ne sont pas supprimées avec le site.
        </Text>
        <MailboxesPanel domain={mailDomain} />
      </Stack>
    );
  }

  // Domaine à activer : celui de la zone DNS s'il est connu, sinon le nom du site sans www.
  const target = longestSuffix(vhost.domain, (zones.data ?? []).map((z) => z.domain)) ?? vhost.domain.replace(/^www\./, '');
  const enable = async () => {
    setBusy(true);
    const res = await mailCall('domains.add', { domain: target }, `Messagerie activée pour ${target}`);
    setBusy(false);
    if (res) void domains.reload(true);
  };
  return (
    <Alert color="blue" title={`Messagerie non activée pour ${target}`}>
      <Group justify="space-between">
        <Text size="sm">Active-la pour créer des adresses en @{target}.</Text>
        <Button size="xs" loading={busy} onClick={() => void enable()}>Activer</Button>
      </Group>
    </Alert>
  );
}
