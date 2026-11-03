import { useState } from 'react';
import {
  Alert, Badge, Button, Checkbox, Code, CopyButton, Group, Menu, Modal, NumberInput, PasswordInput,
  Progress, Stack, Table, Text, TextInput, Tooltip, ActionIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCheck, IconCopy, IconDots, IconKey, IconPlayerPause, IconPlayerPlay, IconPlus, IconTrash, IconGauge,
} from '@tabler/icons-react';
import { call } from '../../api/client';
import { useModuleQuery } from '../../api/hooks';
import { ErrorBlock, LoadingBlock } from '../StateBlocks';
import type { MailBox, MailStatus } from '../../types';

/** Appel du module mail : le message d'erreur vient de la réponse (action.error serait périmé ici). */
export async function mailCall<T>(action: string, payload: unknown, success?: string): Promise<T | null> {
  try {
    const res = await call<T>('mail', action, payload);
    if (success) notifications.show({ message: success, color: 'green' });
    return res;
  } catch (err) {
    notifications.show({ message: err instanceof Error ? err.message : 'Erreur', color: 'red' });
    return null;
  }
}

export function CopyValue({ value }: { value: string }) {
  return (
    <CopyButton value={value} timeout={1500}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? 'Copié' : 'Copier'}>
          <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy} aria-label="Copier">
            {copied ? <IconCheck size={16} stroke={1.5} /> : <IconCopy size={16} stroke={1.5} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}

function formatQuota(mb: number): string {
  if (mb === 0) return 'Illimité';
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} Go` : `${mb} Mo`;
}

function Usage({ box }: { box: MailBox }) {
  const used = box.usedMb >= 1024 ? `${(box.usedMb / 1024).toFixed(1)} Go` : `${box.usedMb} Mo`;
  if (box.quotaMb === 0) return <Text size="sm">{used} <Text span c="dimmed">/ illimité</Text></Text>;
  const pct = Math.min(100, (box.usedMb / box.quotaMb) * 100);
  return (
    <Stack gap={4}>
      <Text size="sm">{used} <Text span c="dimmed">/ {formatQuota(box.quotaMb)}</Text></Text>
      <Progress value={pct} size="xs" color={pct >= 90 ? 'red' : pct >= 75 ? 'orange' : 'teal'} aria-label="Espace utilisé" />
    </Stack>
  );
}

/** Mot de passe généré : affiché une seule fois, il n'est stocké nulle part en clair. */
function GeneratedPasswordModal({ address, password, onClose }: { address: string; password: string | null; onClose: () => void }) {
  return (
    <Modal opened={password !== null} onClose={onClose} title={`Mot de passe de ${address}`}>
      <Stack>
        <Alert color="orange">Note-le maintenant : il ne sera plus jamais affiché.</Alert>
        <Group justify="space-between" wrap="nowrap">
          <Code style={{ wordBreak: 'break-all' }}>{password}</Code>
          <CopyValue value={password ?? ''} />
        </Group>
        <Button onClick={onClose}>J'ai noté le mot de passe</Button>
      </Stack>
    </Modal>
  );
}

function CreateBoxModal({ domain, opened, onClose, onCreated }: {
  domain: string;
  opened: boolean;
  onClose: () => void;
  onCreated: (box: MailBox & { generatedPassword?: string }) => void;
}) {
  const [local, setLocal] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [quota, setQuota] = useState<number | string>('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const res = await mailCall<MailBox & { generatedPassword?: string }>('boxes.add', {
      domain,
      local,
      displayName,
      ...(password ? { password } : {}),
      ...(quota !== '' ? { quotaMb: Number(quota) } : {}),
    }, `Boîte ${local}@${domain} créée`);
    setBusy(false);
    if (res) {
      setLocal(''); setDisplayName(''); setPassword(''); setQuota('');
      onCreated(res);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={`Nouvelle boîte sur ${domain}`}>
      <Stack>
        <TextInput
          label="Adresse"
          required
          data-autofocus
          value={local}
          onChange={(e) => setLocal(e.currentTarget.value.toLowerCase())}
          rightSection={<Text size="sm" c="dimmed" pr="xs">@{domain}</Text>}
          rightSectionWidth={domain.length * 8 + 28}
          placeholder="contact"
        />
        <TextInput label="Nom affiché" value={displayName} onChange={(e) => setDisplayName(e.currentTarget.value)} placeholder="Service contact" />
        <PasswordInput
          label="Mot de passe"
          description="Vide : un mot de passe sûr est généré. Sinon 12 caractères minimum, 3 types de caractères."
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          autoComplete="new-password"
        />
        <NumberInput label="Quota (Mo)" description="Vide : quota par défaut du domaine. 0 : illimité." min={0} allowDecimal={false} value={quota} onChange={setQuota} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Annuler</Button>
          <Button loading={busy} disabled={!local} onClick={() => void submit()}>Créer</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function PasswordModal({ box, domain, onClose, onGenerated }: {
  box: MailBox | null;
  domain: string;
  onClose: () => void;
  onGenerated: (password: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!box) return;
    setBusy(true);
    const res = await mailCall<{ updated: boolean; generatedPassword?: string }>('boxes.password', {
      domain, local: box.local, ...(password ? { password } : {}),
    }, 'Mot de passe changé, sessions en cours coupées');
    setBusy(false);
    if (res) {
      setPassword('');
      if (res.generatedPassword) onGenerated(res.generatedPassword);
      onClose();
    }
  };
  return (
    <Modal opened={box !== null} onClose={onClose} title={`Mot de passe de ${box?.address ?? ''}`}>
      <Stack>
        <PasswordInput
          label="Nouveau mot de passe"
          description="Vide : un mot de passe sûr est généré."
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          autoComplete="new-password"
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Annuler</Button>
          <Button loading={busy} onClick={() => void submit()}>Changer</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function QuotaModal({ box, domain, onClose, onDone }: { box: MailBox | null; domain: string; onClose: () => void; onDone: () => void }) {
  const [quota, setQuota] = useState<number | string>('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!box || quota === '') return;
    setBusy(true);
    const res = await mailCall('boxes.update', { domain, local: box.local, quotaMb: Number(quota) }, 'Quota modifié');
    setBusy(false);
    if (res) { setQuota(''); onDone(); onClose(); }
  };
  return (
    <Modal opened={box !== null} onClose={onClose} title={`Quota de ${box?.address ?? ''}`}>
      <Stack>
        <NumberInput
          label="Quota (Mo)"
          description={`Actuel : ${box ? formatQuota(box.quotaMb) : ''}. 0 : illimité.`}
          min={0}
          allowDecimal={false}
          value={quota}
          onChange={setQuota}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Annuler</Button>
          <Button loading={busy} disabled={quota === ''} onClick={() => void submit()}>Enregistrer</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function DeleteBoxModal({ box, domain, onClose, onDone }: { box: MailBox | null; domain: string; onClose: () => void; onDone: () => void }) {
  const [deleteData, setDeleteData] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => { setDeleteData(false); setConfirm(''); onClose(); };
  const submit = async () => {
    if (!box) return;
    setBusy(true);
    const res = await mailCall('boxes.delete', { domain, local: box.local, deleteData }, `Boîte ${box.address} supprimée`);
    setBusy(false);
    if (res) { onDone(); close(); }
  };
  return (
    <Modal opened={box !== null} onClose={close} title={`Supprimer ${box?.address ?? ''} ?`}>
      <Stack>
        <Text size="sm">L'adresse cessera de fonctionner : les nouveaux messages seront refusés et les sessions en cours coupées.</Text>
        <Checkbox
          label="Effacer aussi tous les messages (définitif)"
          description="Sinon, ils sont conservés sur le serveur et retrouvés si l'adresse est recréée."
          checked={deleteData}
          onChange={(e) => setDeleteData(e.currentTarget.checked)}
        />
        {deleteData && (
          <TextInput label={`Saisis ${box?.address ?? ''} pour confirmer`} value={confirm} onChange={(e) => setConfirm(e.currentTarget.value)} />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>Annuler</Button>
          <Button color="red" loading={busy} disabled={deleteData && confirm !== box?.address} onClick={() => void submit()}>Supprimer</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Paramètres à reporter dans un logiciel de messagerie. */
export function ClientSettings({ hostname }: { hostname: string }) {
  const rows: Array<[string, string, string]> = [
    ['Réception IMAP', '993', 'SSL/TLS'],
    ['Réception POP3', '995', 'SSL/TLS'],
    ['Envoi SMTP', '587', 'STARTTLS'],
    ['Envoi SMTP (variante)', '465', 'SSL/TLS'],
  ];
  return (
    <Table.ScrollContainer minWidth={480}>
    <Table withTableBorder>
      <Table.Thead>
        <Table.Tr><Table.Th>Service</Table.Th><Table.Th>Serveur</Table.Th><Table.Th>Port</Table.Th><Table.Th>Sécurité</Table.Th></Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map(([label, port, security]) => (
          <Table.Tr key={port}>
            <Table.Td>{label}</Table.Td><Table.Td><Code>{hostname}</Code></Table.Td><Table.Td>{port}</Table.Td><Table.Td>{security}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
      <Table.Caption>Identifiant : l'adresse e-mail complète.</Table.Caption>
    </Table>
    </Table.ScrollContainer>
  );
}

/** Boîtes d'un domaine : utilisé par la page E-mails et par l'onglet E-mails d'un site. */
export function MailboxesPanel({ domain }: { domain: string }) {
  const boxes = useModuleQuery<{ boxes: MailBox[] }>('mail', 'boxes.list', { domain });
  const status = useModuleQuery<MailStatus>('mail', 'status');
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordBox, setPasswordBox] = useState<MailBox | null>(null);
  const [quotaBox, setQuotaBox] = useState<MailBox | null>(null);
  const [deleteBox, setDeleteBox] = useState<MailBox | null>(null);
  const [generated, setGenerated] = useState<{ address: string; password: string } | null>(null);

  const toggleSuspend = async (box: MailBox) => {
    const res = await mailCall('boxes.update', { domain, local: box.local, suspended: !box.suspended },
      box.suspended ? `${box.address} réactivée` : `${box.address} suspendue`);
    if (res) void boxes.reload(true);
  };

  if (boxes.loading && !boxes.data) return <LoadingBlock />;
  if (boxes.error) return <ErrorBlock error={boxes.error} />;
  const list = boxes.data?.boxes ?? [];

  return (
    <Stack>
      <Group justify="space-between">
        <Text fw={600}>{list.length} boîte{list.length > 1 ? 's' : ''}</Text>
        <Button leftSection={<IconPlus size={16} stroke={1.5} />} onClick={() => setCreateOpen(true)}>Nouvelle boîte</Button>
      </Group>
      {list.length === 0 ? (
        <Text c="dimmed" ta="center" py="lg">Aucune boîte sur ce domaine.</Text>
      ) : (
        <Table.ScrollContainer minWidth={520}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Adresse</Table.Th>
              <Table.Th w={220}>Espace utilisé</Table.Th>
              <Table.Th>État</Table.Th>
              <Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {list.map((box) => (
              <Table.Tr key={box.address}>
                <Table.Td>
                  <Text fw={600} size="sm">{box.address}</Text>
                  {box.displayName && <Text size="xs" c="dimmed">{box.displayName}</Text>}
                </Table.Td>
                <Table.Td><Usage box={box} /></Table.Td>
                <Table.Td>
                  <Badge variant="light" color={box.suspended ? 'orange' : 'teal'}>{box.suspended ? 'Suspendue' : 'Active'}</Badge>
                </Table.Td>
                <Table.Td>
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" aria-label={`Actions pour ${box.address}`}><IconDots size={16} stroke={1.5} /></ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconKey size={14} stroke={1.5} />} onClick={() => setPasswordBox(box)}>Changer le mot de passe</Menu.Item>
                      <Menu.Item leftSection={<IconGauge size={14} stroke={1.5} />} onClick={() => setQuotaBox(box)}>Modifier le quota</Menu.Item>
                      <Menu.Item
                        leftSection={box.suspended ? <IconPlayerPlay size={14} stroke={1.5} /> : <IconPlayerPause size={14} stroke={1.5} />}
                        onClick={() => void toggleSuspend(box)}
                      >
                        {box.suspended ? 'Réactiver' : 'Suspendre'}
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item color="red" leftSection={<IconTrash size={14} stroke={1.5} />} onClick={() => setDeleteBox(box)}>Supprimer</Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        </Table.ScrollContainer>
      )}
      {status.data?.hostname && list.length > 0 && (
        <>
          <Text fw={600} mt="sm">Configurer un logiciel de messagerie</Text>
          <ClientSettings hostname={status.data.hostname} />
        </>
      )}
      <CreateBoxModal
        domain={domain}
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(box) => {
          setCreateOpen(false);
          void boxes.reload(true);
          if (box.generatedPassword) setGenerated({ address: box.address, password: box.generatedPassword });
        }}
      />
      <PasswordModal
        box={passwordBox}
        domain={domain}
        onClose={() => setPasswordBox(null)}
        onGenerated={(password) => setGenerated({ address: passwordBox?.address ?? '', password })}
      />
      <QuotaModal box={quotaBox} domain={domain} onClose={() => setQuotaBox(null)} onDone={() => void boxes.reload(true)} />
      <DeleteBoxModal box={deleteBox} domain={domain} onClose={() => setDeleteBox(null)} onDone={() => void boxes.reload(true)} />
      <GeneratedPasswordModal address={generated?.address ?? ''} password={generated?.password ?? null} onClose={() => setGenerated(null)} />
    </Stack>
  );
}
