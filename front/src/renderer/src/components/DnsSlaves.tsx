import { useState } from 'react';
import {
  Stack, Group, Text, Badge, Button, TextInput, Switch, Table, Divider, Alert,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { IconServer2, IconShieldCheck, IconAlertTriangle } from '@tabler/icons-react';

interface DnsSlave {
  name: string;
  ip: string;
  external: boolean;
}

interface ZoneHealth {
  zone: string;
  serial: number;
  ns: Array<{ ns: string; ip: string | null; external: boolean }>;
  redundant: boolean;
  delegable: boolean;
  slaves: Array<{ name: string; ip: string; synced: boolean | null; serial: number | null }>;
}

const FREE_SLAVE_PRESETS: Array<{ label: string; slave: Omit<DnsSlave, 'external'> & { external: boolean } }> = [
  { label: 'HE.net (gratuit)', slave: { name: 'ns2.he.net', ip: '216.218.133.2', external: true } },
  { label: 'deSEC (gratuit)', slave: { name: 'ns2.desec.org', ip: '173.245.58.45', external: true } },
];

export function DnsSlaves({ zoneId }: { zoneId: string }) {
  const slaves = useModuleQuery<{ slaves: DnsSlave[] }>('bind9', 'slaves.list');
  const health = useModuleQuery<ZoneHealth>('bind9', 'zones.health', { id: zoneId }, { refetchInterval: 30_000 });
  const action = useModuleAction('bind9');
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [external, setExternal] = useState(true);

  const list = slaves.data?.slaves ?? [];

  const add = async (slave: DnsSlave) => {
    const next = [...list, slave];
    const res = await action.run('slaves.set', { slaves: next });
    if (res !== null) {
      notifications.show({ message: `Esclave ${slave.name} ajouté — Bind rechargé`, color: 'green' });
      setName('');
      setIp('');
      void slaves.reload();
      void health.reload(true);
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const remove = async (slave: DnsSlave) => {
    const next = list.filter((s) => s.ip !== slave.ip || s.name !== slave.name);
    const res = await action.run(next.length > 0 ? 'slaves.set' : 'slaves.delete', next.length > 0 ? { slaves: next } : {});
    if (res !== null) {
      notifications.show({ message: `Esclave ${slave.name} retiré`, color: 'green' });
      void slaves.reload();
      void health.reload(true);
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Stack gap="md">
      <Group gap="sm">
        {health.data?.delegable ? (
          <Badge color="green" variant="light" leftSection={<IconShieldCheck size={14} stroke={1.5} />}>
            Zone délégeable
          </Badge>
        ) : (
          <Badge color="orange" variant="light" leftSection={<IconAlertTriangle size={14} stroke={1.5} />}>
            {health.data && !health.data.redundant ? 'NS sans redondance d\u2019IP' : 'Au moins 2 NS requis'}
          </Badge>
        )}
        <Text size="xs" c="dimmed">serial maître : {health.data?.serial ?? '—'}</Text>
      </Group>

      <Stack gap="xs" maw={720}>
        <Text fw={600}>Serveurs NS de la zone</Text>
        {(health.data?.ns ?? []).length === 0 && <Text c="dimmed" size="sm">Aucun enregistrement NS</Text>}
        {(health.data?.ns ?? []).map((n) => (
          <Group key={n.ns} gap="sm" justify="space-between">
            <Group gap="sm">
              <Badge variant="light">{n.ns}</Badge>
              <Text size="sm" c="dimmed">{n.ip ?? 'IP introuvable (pas d\u2019enr. A)'}</Text>
            </Group>
            {n.external
              ? <Badge color="teal" variant="light">externe</Badge>
              : <Badge color="orange" variant="light">local</Badge>}
          </Group>
        ))}
      </Stack>

      <Divider label="Esclaves DNS (AXFR + notify)" labelPosition="center" />

      <Group gap="sm">
        <Text size="sm" c="dimmed">Ajouter un esclave :</Text>
        {FREE_SLAVE_PRESETS.map((p) => (
          <Button
            key={p.slave.ip}
            size="compact-xs"
            variant="light"
            onClick={() => void add(p.slave)}
            disabled={list.some((s) => s.ip === p.slave.ip)}
          >
            {p.label}
          </Button>
        ))}
      </Group>

      <Group gap="sm" align="flex-end" maw={720}>
        <TextInput
          label="Nom"
          placeholder="ns2.mondomaine.tld"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          w={220}
        />
        <TextInput
          label="IP"
          placeholder="203.0.113.10"
          value={ip}
          onChange={(e) => setIp(e.currentTarget.value)}
          w={160}
        />
        <Switch label="Externe (autre serveur)" checked={external} onChange={(e) => setExternal(e.currentTarget.checked)} mb={6} />
        <Button
          size="sm"
          loading={action.loading}
          disabled={!name || !ip}
          onClick={() => void add({ name, ip, external })}
        >
          Ajouter
        </Button>
      </Group>

      <Table.ScrollContainer minWidth={600}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Esclave</Table.Th>
              <Table.Th>IP</Table.Th>
              <Table.Th>Synchro</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {list.map((s) => {
              const st = (health.data?.slaves ?? []).find((x) => x.ip === s.ip);
              return (
                <Table.Tr key={`${s.name}-${s.ip}`}>
                  <Table.Td fw={500}>{s.name}</Table.Td>
                  <Table.Td c="dimmed">{s.ip}</Table.Td>
                  <Table.Td>
                    {st?.synced === true && <Badge color="green" variant="light">à jour (serial {st.serial})</Badge>}
                    {st?.synced === false && <Badge color="orange" variant="light">retard (serial {st.serial} vs {health.data?.serial})</Badge>}
                    {(st?.synced === null || !st) && <Badge color="red" variant="light">injoignable</Badge>}
                  </Table.Td>
                  <Table.Td>
                    <Button size="compact-xs" variant="light" color="red" onClick={() => void remove(s)}>
                      Retirer
                    </Button>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {list.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" size="sm">Aucun esclave — ajoute le second NS (externe gratuit ou ton propre serveur)</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Alert color="blue" variant="light" icon={<IconServer2 size={16} stroke={1.5} />} maw={720}>
        Les esclaves sont autorisés en AXFR (allow-transfer) et notifiés à chaque changement (also-notify). Chez un
        fournisseur gratuit, déclare ta zone chez eux avec la même IP maître, puis utilise l'option « Externe ».
      </Alert>

      <Group gap="sm">
        <Button size="xs" variant="light" onClick={() => void health.reload(true)}>Vérifier la synchro</Button>
      </Group>
      <Text size="xs" c="dimmed" maw={720}>
        Astuce : le numéro de série doit être incrémenté pour que l'esclave re-télécharge la zone — le panel l'augmente
        automatiquement à chaque modification d'enregistrement.
      </Text>
    </Stack>
  );
}
