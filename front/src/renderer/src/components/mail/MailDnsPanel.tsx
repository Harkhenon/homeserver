import { useState } from 'react';
import {
  Alert, Badge, Button, Card, Code, Group, List, Modal, Stack, Table, Text, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCloudUpload, IconKey, IconRefresh } from '@tabler/icons-react';
import { useModuleQuery } from '../../api/hooks';
import { ErrorBlock, LoadingBlock } from '../StateBlocks';
import { CopyValue, mailCall } from './MailboxesPanel';
import type { MailDnsApplyResult, MailDnsRecord, MailDomain } from '../../types';

const STATUS: Record<MailDnsRecord['status'], { label: string; color: string }> = {
  ok: { label: 'Publié', color: 'teal' },
  missing: { label: 'Absent', color: 'red' },
  different: { label: 'Différent', color: 'orange' },
  error: { label: 'Erreur DNS', color: 'gray' },
};

function RecordRow({ record }: { record: MailDnsRecord }) {
  const status = STATUS[record.status];
  return (
    <Table.Tr>
      <Table.Td>
        <Tooltip label={record.purpose} multiline w={260}><Text size="sm" fw={600}>{record.label}</Text></Tooltip>
        {!record.required && <Text size="xs" c="dimmed">Facultatif</Text>}
      </Table.Td>
      <Table.Td><Badge variant="light" color="gray">{record.type}</Badge></Table.Td>
      <Table.Td style={{ minWidth: 0 }}>
        <Group gap={4} wrap="nowrap"><Code>{record.fqdn}</Code><CopyValue value={record.fqdn} /></Group>
      </Table.Td>
      <Table.Td style={{ maxWidth: 340 }}>
        <Group gap={4} wrap="nowrap" align="flex-start">
          <Code style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{record.value}</Code>
          <CopyValue value={record.value} />
        </Group>
        {record.status === 'different' && record.current && (
          <Text size="xs" c="orange" mt={4} style={{ wordBreak: 'break-all' }}>Actuel : {record.current}</Text>
        )}
      </Table.Td>
      <Table.Td><Badge variant="light" color={status.color}>{status.label}</Badge></Table.Td>
    </Table.Tr>
  );
}

function ConflictsModal({ result, onClose, onReplace, busy }: {
  result: MailDnsApplyResult | null;
  onClose: () => void;
  onReplace: () => void;
  busy: boolean;
}) {
  return (
    <Modal opened={(result?.conflicts.length ?? 0) > 0} onClose={onClose} title="Enregistrements déjà présents" size="lg">
      <Stack>
        <Text size="sm">Ces enregistrements existent dans la zone avec une autre valeur. Ils n'ont pas été touchés : ils peuvent être voulus, par exemple si un autre service envoie pour ce domaine.</Text>
        <List spacing="xs" size="sm">
          {result?.conflicts.map((c) => (
            <List.Item key={c.label}>
              <b>{c.label}</b>
              <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>Actuel : {c.current}</Text>
              <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>Proposé : {c.expected}</Text>
            </List.Item>
          ))}
        </List>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Garder l'existant</Button>
          <Button color="orange" loading={busy} onClick={onReplace}>Remplacer</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function MailDnsPanel({ domain, info, onChanged }: { domain: string; info: MailDomain; onChanged: () => void }) {
  const dns = useModuleQuery<{ zone: boolean; records: MailDnsRecord[] }>('mail', 'dns.records', { domain });
  const [applying, setApplying] = useState(false);
  const [conflicts, setConflicts] = useState<MailDnsApplyResult | null>(null);
  const [dkimBusy, setDkimBusy] = useState(false);

  const apply = async (replace: boolean) => {
    setApplying(true);
    const res = await mailCall<MailDnsApplyResult>('dns.apply', { domain, replace });
    setApplying(false);
    if (!res) return;
    const changed = res.added.length + res.replaced.length;
    notifications.show({
      message: changed > 0 ? `${changed} enregistrement(s) publié(s) dans la zone ${domain}` : 'La zone contient déjà ces enregistrements',
      color: 'green',
    });
    setConflicts(res.conflicts.length > 0 ? res : null);
    void dns.reload(true);
  };

  const rotate = async () => {
    setDkimBusy(true);
    const res = await mailCall('dkim.rotate', { domain }, 'Nouvelle clé DKIM prête : publie-la, puis active-la');
    setDkimBusy(false);
    if (res) { onChanged(); void dns.reload(true); }
  };
  const activate = async () => {
    setDkimBusy(true);
    const res = await mailCall('dkim.activate', { domain }, 'Nouvelle clé DKIM active. Garde l\'ancien enregistrement quelques jours : des messages en transit l\'utilisent encore.');
    setDkimBusy(false);
    if (res) { onChanged(); void dns.reload(true); }
  };

  if (dns.loading && !dns.data) return <LoadingBlock />;
  if (dns.error) return <ErrorBlock error={dns.error} />;
  const records = dns.data?.records ?? [];
  const missing = records.filter((r) => r.required && r.status !== 'ok');

  return (
    <Stack>
      <Alert color={missing.length === 0 ? 'teal' : 'orange'} variant="light">
        {missing.length === 0
          ? 'Tous les enregistrements indispensables sont visibles dans le DNS.'
          : `${missing.length} enregistrement(s) indispensable(s) à corriger : sans eux, les messages sont refusés ou classés en spam. Les changements DNS peuvent mettre plusieurs heures à se propager.`}
      </Alert>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {dns.data?.zone
            ? 'Ce domaine a une zone sur ce serveur : le panel peut y publier les enregistrements.'
            : 'Ce domaine n\'a pas de zone sur ce serveur : ajoute ces enregistrements chez ton registrar.'}
        </Text>
        <Group gap="xs">
          <Button variant="default" leftSection={<IconRefresh size={16} stroke={1.5} />} loading={dns.loading} onClick={() => void dns.reload()}>Vérifier</Button>
          {dns.data?.zone && (
            <Button leftSection={<IconCloudUpload size={16} stroke={1.5} />} loading={applying} onClick={() => void apply(false)}>Publier dans la zone</Button>
          )}
        </Group>
      </Group>
      <Table.ScrollContainer minWidth={820}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr><Table.Th>Rôle</Table.Th><Table.Th>Type</Table.Th><Table.Th>Nom</Table.Th><Table.Th>Valeur</Table.Th><Table.Th>État</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>{records.map((r) => <RecordRow key={r.key} record={r} />)}</Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Card withBorder>
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Group gap="xs" mb={4}><IconKey size={16} stroke={1.5} /><Text fw={600}>Rotation de la clé DKIM</Text></Group>
            <Text size="sm" c="dimmed">
              {info.dkimPending
                ? `Nouvelle clé « ${info.dkimPending.selector} » en attente : publie-la ci-dessus, puis active-la. La signature continue avec « ${info.dkim?.selector ?? ''} » d'ici là.`
                : `Clé active : « ${info.dkim?.selector ?? '—'} ». En changer régulièrement limite l'impact d'une clé compromise.`}
            </Text>
          </div>
          {info.dkimPending
            ? <Button loading={dkimBusy} onClick={() => void activate()}>Activer</Button>
            : <Button variant="light" loading={dkimBusy} onClick={() => void rotate()}>Préparer une nouvelle clé</Button>}
        </Group>
      </Card>
      <ConflictsModal result={conflicts} busy={applying} onClose={() => setConflicts(null)} onReplace={() => void apply(true)} />
    </Stack>
  );
}
