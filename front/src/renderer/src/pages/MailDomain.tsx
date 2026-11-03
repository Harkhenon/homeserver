import { useState } from 'react';
import {
  Alert, Button, Card, Checkbox, Code, Group, Modal, Stack, Switch, Text, TextInput,
} from '@mantine/core';
import { IconMail, IconTrash } from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useModuleQuery } from '../api/hooks';
import { ErrorBlock, LoadingBlock, PageHeader } from '../components';
import { CopyValue, MailboxesPanel, mailCall } from '../components/mail/MailboxesPanel';
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
        <MailboxesPanel domain={domain} />
        {info.dkim && (
          <Card withBorder>
            <Text fw={600} mb={4}>Signature DKIM</Text>
            <Text size="sm" c="dimmed" mb="xs">À publier dans le DNS pour que les messages envoyés soient reconnus (TXT).</Text>
            <Group wrap="nowrap" justify="space-between" align="flex-start">
              <div style={{ minWidth: 0 }}>
                <Code block mb={4}>{`${info.dkim.selector}._domainkey.${domain}`}</Code>
                <Code block style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{info.dkim.record}</Code>
              </div>
              <CopyValue value={info.dkim.record} />
            </Group>
          </Card>
        )}
      </Stack>
      <DeleteDomainModal domain={domain} opened={deleteOpen} onClose={() => setDeleteOpen(false)} onDone={() => navigate('/mail')} />
    </div>
  );
}
