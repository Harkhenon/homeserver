import { useState } from 'react';
import {
  Tabs, Table, Badge, Button, Modal, TextInput, Select, NumberInput, Stack,
  Group, Text, ThemeIcon, Card, Divider,
} from '@mantine/core';
import { useNavigate, useParams } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import {
  IconWorld, IconBinaryTree, IconArrowLeft, IconPlus, IconSubtask,
} from '@tabler/icons-react';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';
import type { Zone, DnsRecord } from '../types';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'PTR'];

export function DomainDetailPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  if (isNew) return <NewDomain onCreated={(domainId) => navigate(`/domains/${encodeURIComponent(domainId)}`)} />;
  if (!id) return <ErrorBlock error="Domaine introuvable" />;

  return (
    <div>
      <Group gap="xs" mb="xs">
        <Button variant="subtle" size="compact-sm" leftSection={<IconArrowLeft size={14} stroke={1.5} />} onClick={() => navigate('/domains')}>
          Domaines
        </Button>
      </Group>
      <DomainTabs zoneId={decodeURIComponent(id)} />
    </div>
  );
}

function DomainTabs({ zoneId }: { zoneId: string }) {
  const zone = useModuleQuery<Zone>('bind9', 'zones.get', { id: zoneId });
  if (zone.loading) return <LoadingBlock />;
  if (zone.error) return <ErrorBlock error={zone.error} />;

  const data = zone.data;

  return (
    <div>
      <PageHeader
        icon={IconWorld}
        title={data?.domain ?? zoneId}
        description={`Zone Bind9 — serial ${data?.serial ?? '?'} — ${data?.records?.length ?? 0} enregistrement(s)`}
      />
      <Tabs defaultValue="zone">
        <Tabs.List mb="md">
          <Tabs.Tab value="zone" leftSection={<IconBinaryTree size={16} stroke={1.5} />}>
            Zone DNS
          </Tabs.Tab>
          <Tabs.Tab value="subdomains" leftSection={<IconSubtask size={16} stroke={1.5} />}>
            Sous-domaines
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="zone">
          <ZoneRecords zoneId={zoneId} />
        </Tabs.Panel>
        <Tabs.Panel value="subdomains">
          <Subdomains zone={data} zoneId={zoneId} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

function ZoneRecords({ zoneId }: { zoneId: string }) {
  const zone = useModuleQuery<Zone>('bind9', 'zones.get', { id: zoneId });
  const action = useModuleAction('bind9');
  const [addOpen, setAddOpen] = useState(false);

  const removeRecord = async (record: DnsRecord) => {
    const res = await action.run('records.delete', {
      zone: zoneId,
      name: record.name,
      type: record.type,
      value: record.value,
    });
    if (res !== null) {
      notifications.show({ message: 'Enregistrement supprimé', color: 'green' });
      void zone.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  if (zone.loading) return <LoadingBlock />;
  if (zone.error) return <ErrorBlock error={zone.error} />;

  return (
    <Stack>
      <Button size="xs" w={160} leftSection={<IconPlus size={14} stroke={1.5} />} onClick={() => setAddOpen(true)}>
        Ajouter un enr.
      </Button>
      <Table.ScrollContainer minWidth={700}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nom</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Valeur</Table.Th>
              <Table.Th>TTL</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(zone.data?.records ?? []).map((r, i) => (
              <Table.Tr key={`${r.name}-${r.type}-${i}`}>
                <Table.Td fw={500}>{r.name}</Table.Td>
                <Table.Td><Badge variant="light">{r.type}</Badge></Table.Td>
                <Table.Td c="dimmed">{r.value}</Table.Td>
                <Table.Td>{r.ttl}</Table.Td>
                <Table.Td>
                  <Button size="compact-xs" variant="light" color="red" onClick={() => void removeRecord(r)}>
                    Suppr.
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <AddRecordModal
        zoneId={zoneId}
        opened={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => { setAddOpen(false); void zone.reload(); }}
      />
    </Stack>
  );
}

function Subdomains({ zone, zoneId }: { zone: Zone | null; zoneId: string }) {
  const [addOpen, setAddOpen] = useState(false);
  const records = (zone?.records ?? []).filter((r) => r.type === 'A' || r.type === 'AAAA' || r.type === 'CNAME');
  const subdomains = records.filter((r) => r.name !== '@' && r.name !== 'ns1' && r.name !== 'www');

  return (
    <Stack>
      <Button size="xs" w={200} leftSection={<IconPlus size={14} stroke={1.5} />} onClick={() => setAddOpen(true)}>
        Ajouter un sous-domaine
      </Button>
      {subdomains.length === 0 && (
        <Text c="dimmed" ta="center" mt="md">
          Aucun sous-domaine — ajoutes-en un pour pointer vers une IP ou un CNAME.
        </Text>
      )}
      <Group gap="md" grow align="flex-start">
        {subdomains.map((r, i) => (
          <Card key={`${r.name}-${i}`} withBorder p="md">
            <Group justify="space-between" wrap="nowrap">
              <Text fw={600}>{r.name === '*' ? '* (joker)' : r.name}</Text>
              <Badge variant="light" size="sm">{r.type}</Badge>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>{r.value}</Text>
          </Card>
        ))}
      </Group>
      <AddRecordModal
        zoneId={zoneId}
        opened={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => setAddOpen(false)}
        subdomainMode
      />
    </Stack>
  );
}

function AddRecordModal({ zoneId, opened, onClose, onAdded, subdomainMode }: {
  zoneId: string;
  opened: boolean;
  onClose: () => void;
  onAdded: () => void;
  subdomainMode?: boolean;
}) {
  const action = useModuleAction('bind9');
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('A');
  const [value, setValue] = useState('');
  const [ttl, setTtl] = useState<number>(3600);

  const submit = async () => {
    const res = await action.run('records.add', {
      zone: zoneId,
      name,
      type,
      value,
      ttl,
    });
    if (res !== null) {
      notifications.show({ message: `Enregistrement ${name} ajouté`, color: 'green' });
      onAdded();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={subdomainMode ? 'Nouveau sous-domaine' : 'Nouvel enregistrement'}>
      <Stack>
        <TextInput
          label={subdomainMode ? 'Sous-domaine' : 'Nom'}
          placeholder={subdomainMode ? 'blog' : '@ ou www'}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
        <Select
          label="Type"
          data={subdomainMode ? ['A', 'AAAA', 'CNAME'] : RECORD_TYPES}
          value={type}
          onChange={(v) => v && setType(v)}
          required
        />
        <TextInput
          label="Valeur"
          placeholder={type === 'CNAME' ? 'cible.exemple.com.' : '192.168.1.10'}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          required
        />
        <NumberInput label="TTL (secondes)" value={ttl} onChange={(v) => setTtl(Number(v) ?? 3600)} min={60} />
        <Button loading={action.loading} onClick={() => void submit()}>Ajouter</Button>
      </Stack>
    </Modal>
  );
}

function NewDomain({ onCreated }: { onCreated: (domainId: string) => void }) {
  const action = useModuleAction('bind9');
  const [domain, setDomain] = useState('');

  const submit = async () => {
    const res = await action.run<{ id: string }>('zones.create', { domain });
    if (res !== null) {
      notifications.show({ message: `Domaine ${domain} créé`, color: 'green' });
      onCreated(domain);
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Card withBorder maw={520} mx="auto" p="lg">
      <Stack>
        <ThemeIcon variant="light" size={44} radius="md" mx="auto">
          <IconWorld size={22} stroke={1.5} />
        </ThemeIcon>
        <Text ta="center" fz="h4" fw={700}>Nouveau domaine</Text>
        <Text ta="center" size="sm" c="dimmed">
          Une zone Bind9 sera créée avec les enregistrements NS et A par défaut.
        </Text>
        <Divider my={4} />
        <TextInput
          label="Nom de domaine"
          placeholder="exemple.com"
          value={domain}
          onChange={(e) => setDomain(e.currentTarget.value)}
          required
        />
        <Button loading={action.loading} onClick={() => void submit()}>Créer le domaine</Button>
      </Stack>
    </Card>
  );
}
