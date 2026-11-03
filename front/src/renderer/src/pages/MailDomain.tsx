import { useState } from 'react';
import {
  Alert, Button, Checkbox, Group, Modal, Stack, Switch, Tabs, Text, TextInput,
} from '@mantine/core';
import { IconBinaryTree, IconMail, IconTrash, IconUsers } from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useModuleQuery } from '../api/hooks';
import { ErrorBlock, LoadingBlock, PageHeader } from '../components';
import { MailboxesPanel, mailCall } from '../components/mail/MailboxesPanel';
import { MailDnsPanel } from '../components/mail/MailDnsPanel';
import type { MailDomain } from '../types';

function DeleteDomainModal({ domain, opened, onClose, onDone }: { domain: string; opened: boolean; onClose: () => void; onDone: () => void }) {
  const [deleteData, setDeleteData] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const res = await mailCall('domains.delete', { domain, deleteData }, `Messagerie retirée pour ${domain}`);
    setBusy(false);
    if (res) onDone();
  };
  return (
    <Modal opened={opened} onClose={onClose} title={`Retirer la messagerie de ${domain} ?`}>
      <Stack>
        <Text size="sm">Toutes les adresses du domaine cesseront de fonctionner. Le site web et le DNS ne sont pas modifiés.</Text>
        <Checkbox
          label="Effacer aussi tous les messages et la clé DKIM (définitif)"
          description="Sinon, ils sont conservés sur le serveur."
          checked={deleteData}
          onChange={(e) => setDeleteData(e.currentTarget.checked)}
        />
        <TextInput label={`Saisis ${domain} pour confirmer`} value={confirm} onChange={(e) => setConfirm(e.currentTarget.value)} data-autofocus />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Annuler</Button>
          <Button color="red" loading={busy} disabled={confirm !== domain} onClick={() => void submit()}>Retirer</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function MailDomainPage() {
  const { domain = '' } = useParams<{ domain: string }>();
  const navigate = useNavigate();
  const domains = useModuleQuery<{ domains: MailDomain[] }>('mail', 'domains.list');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const info = (domains.data?.domains ?? []).find((d) => d.domain === domain) ?? null;

  if (domains.loading && !domains.data) return <LoadingBlock />;
  if (domains.error) return <ErrorBlock error={domains.error} />;
  if (!info) {
    return (
      <Alert color="red" title="Domaine introuvable">
        <Group justify="space-between">
          <Text>La messagerie n'est pas activée pour {domain}.</Text>
          <Button size="xs" variant="light" onClick={() => navigate('/mail')}>Retour aux e-mails</Button>
        </Group>
      </Alert>
    );
  }

  const setSuspended = async (suspended: boolean) => {
    const res = await mailCall('domains.update', { domain, suspended }, suspended ? `${domain} suspendu : les adresses sont désactivées` : `${domain} réactivé`);
    if (res) void domains.reload(true);
  };

  return (
    <div>
      <PageHeader
        icon={IconMail}
        title={domain}
        description="Boîtes e-mail du domaine"
        breadcrumbs={[{ label: 'E-mails', to: '/mail' }, { label: domain }]}
        actions={(
          <Group>
            <Switch label="Domaine actif" checked={!info.suspended} onChange={(e) => void setSuspended(!e.currentTarget.checked)} />
            <Button variant="light" color="red" leftSection={<IconTrash size={16} stroke={1.5} />} onClick={() => setDeleteOpen(true)}>Retirer</Button>
          </Group>
        )}
      />
      <Stack>
        {info.suspended && <Alert color="orange">Domaine suspendu : aucune boîte ne reçoit ni n'envoie de message. Les données sont conservées.</Alert>}
        <Tabs defaultValue="boxes">
          <Tabs.List mb="md">
            <Tabs.Tab value="boxes" leftSection={<IconUsers size={16} stroke={1.5} />}>Boîtes</Tabs.Tab>
            <Tabs.Tab value="dns" leftSection={<IconBinaryTree size={16} stroke={1.5} />}>DNS</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="boxes"><MailboxesPanel domain={domain} /></Tabs.Panel>
          <Tabs.Panel value="dns"><MailDnsPanel domain={domain} info={info} onChanged={() => void domains.reload(true)} /></Tabs.Panel>
        </Tabs>
      </Stack>
      <DeleteDomainModal domain={domain} opened={deleteOpen} onClose={() => setDeleteOpen(false)} onDone={() => navigate('/mail')} />
    </div>
  );
}
