import { useState } from 'react';
import {
  Tabs, Badge, Group, Button, Text, Stack, Table, Modal, TextInput, Alert, Divider,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useNavigate, useParams } from 'react-router-dom';
import {
  IconWorld, IconLock, IconDatabaseImport, IconCode, IconRefresh, IconTrash,
} from '@tabler/icons-react';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';
import { SiteGeneralTab } from '../components/site/SiteGeneralTab';
import { SiteSslTab } from '../components/site/SiteSslTab';
import { SiteBackupsTab } from '../components/site/SiteBackupsTab';
import { SitePhpTab } from '../components/site/SitePhpTab';
import type { Vhost, NginxVhost, BackupInfo } from '../types';

type ServerKind = 'apache' | 'nginx';

export function SiteDetailPage() {
  const { server, id } = useParams<{ server: string; id: string }>();
  const navigate = useNavigate();
  const kind: ServerKind = server === 'nginx' ? 'nginx' : 'apache';

  const vhosts = useModuleQuery<Array<Vhost | NginxVhost>>(kind, 'vhosts.list');
  const vhost = (vhosts.data ?? []).find((v) => v.id === id) ?? null;

  const removeAction = useModuleAction(kind);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (vhosts.loading) return <LoadingBlock />;
  if (vhosts.error) return <ErrorBlock error={vhosts.error} />;
  if (!vhost) {
    return (
      <Alert color="red" title="Site introuvable">
        <Group justify="space-between">
          <Text>Le virtualhost demandé n'existe pas (ou plus).</Text>
          <Button size="xs" variant="light" onClick={() => navigate('/sites')}>Retour aux sites</Button>
        </Group>
      </Alert>
    );
  }

  const remove = async () => {
    if (!vhost) return;
    const res = await removeAction.run('vhosts.delete', { id: vhost.id });
    if (res !== null) {
      notifications.show({ message: `Site ${vhost.domain} supprimé`, color: 'green' });
      navigate('/sites');
    } else if (removeAction.error) {
      notifications.show({ message: removeAction.error, color: 'red' });
    }
  };

  return (
    <div>
      <PageHeader
        icon={IconWorld}
        breadcrumbs={[{ label: 'Sites', to: '/sites' }]}
        title={vhost.domain}
        description={vhost.docroot}
        actions={
          <Group gap="xs">
            <Badge variant="light" color={vhost.enabled ? 'green' : 'orange'}>
              {vhost.enabled ? 'Activé' : 'Désactivé'}
            </Badge>
            <Badge variant="light" color={kind === 'apache' ? 'red' : 'green'}>
              {kind === 'apache' ? 'Apache' : 'Nginx'}
            </Badge>
            {vhost.ssl && <Badge variant="light" color="teal">SSL</Badge>}
            <Button color="red" variant="light" size="xs" leftSection={<IconTrash size={14} stroke={1.5} />} onClick={() => setConfirmDelete(true)}>
              Supprimer
            </Button>
          </Group>
        }
      />
      <Tabs defaultValue="general">
        <Tabs.List mb="md">
          <Tabs.Tab value="general" leftSection={<IconCode size={16} stroke={1.5} />}>Général</Tabs.Tab>
          <Tabs.Tab value="ssl" leftSection={<IconLock size={16} stroke={1.5} />}>SSL</Tabs.Tab>
          <Tabs.Tab value="backups" leftSection={<IconDatabaseImport size={16} stroke={1.5} />}>Sauvegardes</Tabs.Tab>
          {vhost.phpVersion && (
            <Tabs.Tab value="php" leftSection={<IconRefresh size={16} stroke={1.5} />}>PHP {vhost.phpVersion}</Tabs.Tab>
          )}
        </Tabs.List>
        <Tabs.Panel value="general" pt="xs">
          <SiteGeneralTab vhost={vhost} server={kind} onChanged={() => void vhosts.reload()} />
        </Tabs.Panel>
        <Tabs.Panel value="ssl" pt="xs">
          <SiteSslTab vhost={vhost} />
        </Tabs.Panel>
        <Tabs.Panel value="backups" pt="xs">
          <SiteBackupsTab vhost={vhost} />
        </Tabs.Panel>
        {vhost.phpVersion && (
          <Tabs.Panel value="php" pt="xs">
            <SitePhpTab vhost={vhost} server={kind} onChanged={() => void vhosts.reload()} />
          </Tabs.Panel>
        )}
      </Tabs>

      <Modal opened={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Supprimer ${vhost.domain} ?`} size="md">
        <Text size="sm">
          Le virtualhost et sa configuration seront supprimés.
          Les fichiers du site dans <code>{vhost.docroot}</code> et les sauvegardes ne sont pas touchés.
        </Text>
        <Divider my="md" />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={() => setConfirmDelete(false)}>Annuler</Button>
          <Button color="red" onClick={() => void remove()}>Supprimer</Button>
        </Group>
      </Modal>
    </div>
  );
}
