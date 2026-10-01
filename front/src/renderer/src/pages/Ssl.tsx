import { useState } from 'react';
import { Table, Button, Modal, TextInput, Stack, Badge, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';
import type { CertInfo } from '../types';

export function SslPage() {
  const certs = useModuleQuery<{ domains: string[]; count: number }>('ssl', 'certs.list');
  const action = useModuleAction('ssl');
  const [issueOpen, setIssueOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const info = useModuleQuery<CertInfo>('ssl', 'certs.info', selected ? { domain: selected } : undefined);

  const renew = async (domain: string) => {
    const res = await action.run('certs.renew', { domain });
    if (res !== null) {
      notifications.show({ message: `Certificat ${domain} renouvelé`, color: 'green' });
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  if (certs.loading) return <LoadingBlock />;
  if (certs.error) return <ErrorBlock error={certs.error} />;

  return (
    <div>
      <PageHeader
        title="Certificats SSL"
        description="Let's Encrypt — renouvellement automatique"
        actions={<Button onClick={() => setIssueOpen(true)}>Émettre un certificat</Button>}
      />
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Domaine</Table.Th>
            <Table.Th>Expiration</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(certs.data?.domains ?? []).map((domain) => (
            <CertRow key={domain} domain={domain} onRenew={() => void renew(domain)} />
          ))}
        </Table.Tbody>
      </Table>
      <IssueModal opened={issueOpen} onClose={() => setIssueOpen(false)} onIssued={() => { setIssueOpen(false); void certs.reload(); }} />
    </div>
  );
}

function CertRow({ domain, onRenew }: { domain: string; onRenew: () => void }) {
  const info = useModuleQuery<CertInfo>('ssl', 'certs.info', { domain });
  if (info.loading) return <Table.Tr><Table.Td colSpan={3}>{domain}</Table.Td></Table.Tr>;
  if (info.error) {
    return (
      <Table.Tr>
        <Table.Td fw={600}>{domain}</Table.Td>
        <Table.Td colSpan={2}><Text c="dimmed" size="sm">Erreur de lecture</Text></Table.Td>
      </Table.Tr>
    );
  }
  const days = info.data?.daysLeft ?? 0;
  return (
    <Table.Tr>
      <Table.Td fw={600}>{domain}</Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Badge color={days < 15 ? 'red' : days < 30 ? 'orange' : 'green'} variant="light">
            {days} j
          </Badge>
          {info.data?.autoRenew && <Badge variant="light" size="sm">auto</Badge>}
        </Group>
      </Table.Td>
      <Table.Td>
        <Button size="compact-xs" variant="light" onClick={onRenew}>Renouveler</Button>
      </Table.Td>
    </Table.Tr>
  );
}

function IssueModal({ opened, onClose, onIssued }: { opened: boolean; onClose: () => void; onIssued: () => void }) {
  const action = useModuleAction('ssl');
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState('');
  const submit = async () => {
    const res = await action.run('certs.issue', { domain, email });
    if (res !== null) {
      notifications.show({ message: `Certificat ${domain} émis`, color: 'green' });
      onIssued();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };
  return (
    <Modal opened={opened} onClose={onClose} title="Émettre un certificat Let's Encrypt">
      <Stack>
        <TextInput label="Domaine" placeholder="exemple.com" value={domain} onChange={(e) => setDomain(e.currentTarget.value)} required />
        <TextInput label="Email" placeholder="admin@exemple.com" value={email} onChange={(e) => setEmail(e.currentTarget.value)} required />
        <Button loading={action.loading} onClick={() => void submit()}>Émettre</Button>
      </Stack>
    </Modal>
  );
}
