import { useState } from 'react';
import { Table, Button, Modal, TextInput, Stack, Select, Badge, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';
import type { CronJob } from '../types';

export function CronPage() {
  const jobs = useModuleQuery<{ jobs: CronJob[] }>('cron', 'jobs.list');
  const action = useModuleAction('cron');
  const [createOpen, setCreateOpen] = useState(false);

  const remove = async (name: string) => {
    const res = await action.run('jobs.delete', { name });
    if (res !== null) {
      notifications.show({ message: `Tâche ${name} supprimée`, color: 'green' });
      void jobs.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  if (jobs.loading) return <LoadingBlock />;
  if (jobs.error) return <ErrorBlock error={jobs.error} />;

  return (
    <div>
      <PageHeader
        title="Tâches cron"
        description="/etc/cron.d/homeserver-*"
        actions={<Button onClick={() => setCreateOpen(true)}>Nouvelle tâche</Button>}
      />
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Nom</Table.Th>
            <Table.Th>Planification</Table.Th>
            <Table.Th>Commande</Table.Th>
            <Table.Th>Utilisateur</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(jobs.data?.jobs ?? []).map((job) => (
            <Table.Tr key={job.name}>
              <Table.Td fw={600}>{job.name}</Table.Td>
              <Table.Td><Badge variant="light">{job.schedule}</Badge></Table.Td>
              <Table.Td c="dimmed" fz="sm" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.command}</Table.Td>
              <Table.Td c="dimmed">{job.user}</Table.Td>
              <Table.Td>
                <Button size="compact-xs" variant="light" color="red" onClick={() => void remove(job.name)}>Suppr.</Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <CreateJobModal opened={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); void jobs.reload(); }} />
    </div>
  );
}

function CreateJobModal({ opened, onClose, onCreated }: { opened: boolean; onClose: () => void; onCreated: () => void }) {
  const action = useModuleAction('cron');
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState<string | null>('@daily');
  const [command, setCommand] = useState('');
  const [user, setUser] = useState('root');

  const submit = async () => {
    const jobName = name.startsWith('homeserver-') ? name : `homeserver-${name}`;
    const res = await action.run('jobs.create', { name: jobName, schedule, command, user });
    if (res !== null) {
      notifications.show({ message: `Tâche ${jobName} créée`, color: 'green' });
      onCreated();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Nouvelle tâche cron">
      <Stack>
        <TextInput label="Nom" description="Préfixe homeserver- ajouté automatiquement" placeholder="backup" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
        <Select
          label="Planification"
          data={[
            { value: '@daily', label: 'Quotidienne (minuit)' },
            { value: '@hourly', label: 'Horaire' },
            { value: '@weekly', label: 'Hebdomadaire' },
            { value: '@monthly', label: 'Mensuelle' },
            { value: 'custom', label: 'Personnalisée (cron 5 champs)' },
          ]}
          value={schedule?.startsWith('@') ? schedule : 'custom'}
          onChange={(v) => setSchedule(v === 'custom' ? '' : v)}
        />
        {schedule !== null && !schedule.startsWith('@') && (
          <TextInput label="Expression cron" placeholder="0 3 * * *" value={schedule} onChange={(e) => setSchedule(e.currentTarget.value)} />
        )}
        <TextInput label="Commande" placeholder="/usr/local/bin/backup.sh" value={command} onChange={(e) => setCommand(e.currentTarget.value)} required />
        <TextInput label="Utilisateur" value={user} onChange={(e) => setUser(e.currentTarget.value)} />
        <Button loading={action.loading} onClick={() => void submit()}>Créer</Button>
      </Stack>
    </Modal>
  );
}
