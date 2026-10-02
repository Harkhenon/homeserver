import { useState } from 'react';
import { Table, Badge, Button, Modal, TextInput, Stack, Select, Accordion, Group } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';
import { IconBinaryTree } from '@tabler/icons-react';
import type { Zone, DnsRecord } from '../types';

export function DnsPage() {
  const zones = useModuleQuery<Zone[]>('bind9', 'zones.list');
  const action = useModuleAction('bind9');
  const [createOpen, setCreateOpen] = useState(false);

  if (zones.loading) return <LoadingBlock />;
  if (zones.error) return <ErrorBlock error={zones.error} />;

  return (
    <div>
      <PageHeader
icon={IconBinaryTree}         title="Zones DNS"
        description={`${zones.data?.length ?? 0} zone(s) Bind9`}
        actions={<Button onClick={() => setCreateOpen(true)}>Nouvelle zone</Button>}
      />
      <Accordion>
        {(zones.data ?? []).map((zone) => (
          <Accordion.Item key={zone.id} value={zone.id}>
            <Accordion.Control>
              <Group>
                <span style={{ fontWeight: 600 }}>{zone.domain}</span>
                <Badge variant="light" size="sm">{zone.recordCount ?? 0} enr.</Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <ZoneRecords zoneId={zone.id} />
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
      <CreateZoneModal opened={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); void zones.reload(); }} />
    </div>
  );
}

function ZoneRecords({ zoneId }: { zoneId: string }) {
  const zone = useModuleQuery<Zone>('bind9', 'zones.get', { id: zoneId });
  const action = useModuleAction('bind9');
  const [addOpen, setAddOpen] = useState(false);

  const removeRecord = async (record: DnsRecord) => {
    const res = await action.run('records.delete', { zone: zoneId, name: record.name, type: record.type, value: record.value });
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
      <Button size="xs" w={140} onClick={() => setAddOpen(true)}>Ajouter un enr.</Button>
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
              <Table.Td>{r.name}</Table.Td>
              <Table.Td><Badge variant="light">{r.type}</Badge></Table.Td>
              <Table.Td c="dimmed">{r.value}</Table.Td>
              <Table.Td>{r.ttl}</Table.Td>
              <Table.Td>
                <Button size="compact-xs" variant="light" color="red" onClick={() => void removeRecord(r)}>Suppr.</Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <AddRecordModal zoneId={zoneId} opened={addOpen} onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); void zone.reload(); }} />
    </Stack>
  );
}

function AddRecordModal({ zoneId, opened, onClose, onAdded }: { zoneId: string; opened: boolean; onClose: () => void; onAdded: () => void }) {
  const action = useModuleAction('bind9');
  const [name, setName] = useState('');
  const [type, setType] = useState<string | null>('A');
  const [value, setValue] = useState('');

  const submit = async () => {
    const res = await action.run('records.add', { zone: zoneId, name, type, value });
    if (res !== null) {
      notifications.show({ message: 'Enregistrement ajouté', color: 'green' });
      onAdded();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Ajouter un enregistrement">
      <Stack>
        <TextInput label="Nom" placeholder="@ ou www" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
        <Select label="Type" data={['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV']} value={type} onChange={setType} />
        <TextInput label="Valeur" placeholder="1.2.3.4" value={value} onChange={(e) => setValue(e.currentTarget.value)} required />
        <Button loading={action.loading} onClick={() => void submit()}>Ajouter</Button>
      </Stack>
    </Modal>
  );
}

function CreateZoneModal({ opened, onClose, onCreated }: { opened: boolean; onClose: () => void; onCreated: () => void }) {
  const action = useModuleAction('bind9');
  const [domain, setDomain] = useState('');

  const submit = async () => {
    const res = await action.run('zones.create', { domain });
    if (res !== null) {
      notifications.show({ message: `Zone ${domain} créée`, color: 'green' });
      onCreated();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Nouvelle zone DNS">
      <Stack>
        <TextInput label="Domaine" placeholder="exemple.com" value={domain} onChange={(e) => setDomain(e.currentTarget.value)} required />
        <Button loading={action.loading} onClick={() => void submit()}>Créer</Button>
      </Stack>
    </Modal>
  );
}
