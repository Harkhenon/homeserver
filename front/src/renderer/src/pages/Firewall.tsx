import { useState } from 'react';
import { Group, Badge, Button, Modal, NumberInput, Select, Stack, Switch, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';
import type { FirewallStatus } from '../types';

export function FirewallPage() {
  const status = useModuleQuery<FirewallStatus>('firewall', 'status');
  const action = useModuleAction('firewall');
  const [addOpen, setAddOpen] = useState(false);

  const toggle = async (enabled: boolean) => {
    const res = await action.run('enable', { enabled });
    if (res !== null) {
      notifications.show({ message: enabled ? 'Pare-feu activé' : 'Pare-feu désactivé', color: 'green' });
      void status.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const removeRule = async (port: number, proto: string) => {
    const res = await action.run('rules.remove', { port, proto });
    if (res !== null) {
      notifications.show({ message: `Règle ${port}/${proto} supprimée`, color: 'green' });
      void status.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  if (status.loading) return <LoadingBlock />;
  if (status.error) return <ErrorBlock error={status.error} />;

  const data = status.data;

  return (
    <div>
      <PageHeader
        title="Pare-feu"
        description={data ? `Backend : ${data.backend}` : undefined}
        actions={
          <Group>
            <Switch
              label="Actif"
              checked={data?.active ?? false}
              onChange={(e) => void toggle(e.currentTarget.checked)}
            />
            <Button size="xs" onClick={() => setAddOpen(true)}>Ajouter un port</Button>
          </Group>
        }
      />
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Règle</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(data?.rules ?? []).map((rule, i) => {
            const m = rule.match(/(\d+)\/(tcp|udp)/);
            return (
              <Table.Tr key={`${rule}-${i}`}>
                <Table.Td fw={600}>{rule}</Table.Td>
                <Table.Td>
                  {m && (
                    <Button
                      size="compact-xs"
                      variant="light"
                      color="red"
                      onClick={() => void removeRule(Number(m[1]), m[2] ?? 'tcp')}
                    >
                      Retirer
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      {data?.rules.length === 0 && <Text c="dimmed" ta="center" mt="md">Aucune règle</Text>}
      <AddRuleModal opened={addOpen} onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); void status.reload(); }} />
    </div>
  );
}

function AddRuleModal({ opened, onClose, onAdded }: { opened: boolean; onClose: () => void; onAdded: () => void }) {
  const action = useModuleAction('firewall');
  const [port, setPort] = useState<number | null>(null);
  const [proto, setProto] = useState<string | null>('tcp');

  const submit = async () => {
    const res = await action.run('rules.add', { port, proto });
    if (res !== null) {
      notifications.show({ message: `Port ${port}/${proto} ouvert`, color: 'green' });
      onAdded();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Ouvrir un port">
      <Stack>
        <NumberInput label="Port" placeholder="443" min={1} max={65535} value={port ?? ''} onChange={(v) => setPort(Number(v) || null)} />
        <Select label="Protocole" data={['tcp', 'udp']} value={proto} onChange={setProto} />
        <Button loading={action.loading} onClick={() => void submit()} disabled={port === null}>Ajouter</Button>
      </Stack>
    </Modal>
  );
}
