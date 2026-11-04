import { useEffect, useState } from 'react';
import {
  Alert, Badge, Button, Card, Group, Modal, PasswordInput, Select, SimpleGrid, Stack, Text, TextInput, ThemeIcon,
} from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconHelp, IconSend, IconX } from '@tabler/icons-react';
import { mailCall } from './MailboxesPanel';
import type { MailDeliverabilityReport, MailDomain, MailStatus, MailTestResult } from '../../types';

type Level = 'ok' | 'warn' | 'bad' | 'unknown';
const LEVEL: Record<Level, { color: string; Icon: typeof IconCheck }> = {
  ok: { color: 'teal', Icon: IconCheck },
  warn: { color: 'orange', Icon: IconAlertTriangle },
  bad: { color: 'red', Icon: IconX },
  unknown: { color: 'gray', Icon: IconHelp },
};

function Check({ level, title, detail }: { level: Level; title: string; detail: string }) {
  const { color, Icon } = LEVEL[level];
  return (
    <Group wrap="nowrap" align="flex-start" gap="sm">
      <ThemeIcon size={22} radius="xl" variant="light" color={color}><Icon size={14} stroke={2} /></ThemeIcon>
      <div style={{ minWidth: 0 }}>
        <Text size="sm" fw={600}>{title}</Text>
        <Text size="xs" c="dimmed" style={{ wordBreak: 'break-word' }}>{detail}</Text>
      </div>
    </Group>
  );
}

function Report({ report, clockSynced }: { report: MailDeliverabilityReport; clockSynced: boolean | null }) {
  const listed = report.blacklists.filter((b) => b.listed === true);
  const unknown = report.blacklists.filter((b) => b.listed === null);
  return (
    <Stack gap="sm">
      <Check
        level={report.ipPrivate ? 'bad' : 'ok'}
        title={`IP du serveur : ${report.ip ?? 'inconnue'}`}
        detail={report.ipPrivate ? 'Adresse privée : Internet ne peut pas joindre ce serveur. Indique l\'IP publique ci-dessous si le serveur est derrière un NAT.' : 'Adresse publique.'}
      />
      <Check
        level={report.hostnameResolves ? 'ok' : 'bad'}
        title={`Nom d'hôte ${report.hostname}`}
        detail={report.hostnameResolves ? 'Pointe vers ce serveur.' : 'Ne pointe pas vers ce serveur : la réception et le certificat échoueront.'}
      />
      {report.rdns ? (
        <Check
          level={report.rdns.matches ? 'ok' : 'bad'}
          title="DNS inversé (PTR)"
          detail={report.rdns.matches ? `${report.ip} correspond bien à ${report.hostname}.` : `${report.ip} → ${report.rdns.ptr.join(', ') || 'aucun nom'}. Gmail et Outlook refusent souvent ces messages : à régler chez l'hébergeur de l'IP, avec ${report.hostname}.`}
        />
      ) : (
        <Check level="unknown" title="DNS inversé (PTR)" detail="Non vérifiable depuis une adresse privée." />
      )}
      <Check
        level={report.port25.ok ? 'ok' : report.relay?.ok ? 'warn' : 'bad'}
        title="Port 25 sortant"
        detail={report.port25.ok ? 'Ouvert : le serveur peut livrer directement.' : `${report.port25.detail}. ${report.relay ? 'Le relais SMTP prend le relais.' : 'Configure un relais SMTP pour envoyer vers Internet.'}`}
      />
      {report.relay && (
        <Check level={report.relay.ok ? 'ok' : 'bad'} title="Relais SMTP" detail={report.relay.detail} />
      )}
      <Check
        level={clockSynced === null ? 'unknown' : clockSynced ? 'ok' : 'bad'}
        title="Horloge du serveur"
        detail={clockSynced === null
          ? 'État de la synchronisation inconnu.'
          : clockSynced
            ? 'Synchronisée par NTP.'
            : 'Non synchronisée : des dates fausses font classer les messages en indésirables et peuvent invalider leur signature DKIM. Active un service NTP (chrony, systemd-timesyncd).'}
      />
      {report.blacklists.length > 0 ? (
        <Check
          level={listed.length > 0 ? 'bad' : unknown.length > 0 ? 'warn' : 'ok'}
          title="Listes noires"
          detail={listed.length > 0
            ? `IP listée sur : ${listed.map((b) => b.list).join(', ')}. Demande son retrait auprès de ces listes.`
            : unknown.length > 0
              ? `Non listée, mais pas de réponse de : ${unknown.map((b) => b.list).join(', ')} (ces listes refusent parfois les résolveurs publics).`
              : 'IP absente des listes vérifiées.'}
        />
      ) : (
        <Check level="unknown" title="Listes noires" detail="Non vérifiable depuis une adresse privée." />
      )}
    </Stack>
  );
}

function RelayModal({ status, opened, onClose, onDone }: { status: MailStatus; opened: boolean; onClose: () => void; onDone: () => void }) {
  const [host, setHost] = useState(status.relay?.host ?? '');
  const [port, setPort] = useState<string | null>(String(status.relay?.port ?? 587));
  const [username, setUsername] = useState(status.relay?.username ?? '');
  const [password, setPassword] = useState('');
  const [spfInclude, setSpfInclude] = useState(status.relay?.spfInclude ?? '');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const res = await mailCall('relay.set', { host, port: Number(port), username, password, spfInclude }, 'Relais SMTP configuré');
    setBusy(false);
    if (res) { setPassword(''); onDone(); onClose(); }
  };
  return (
    <Modal opened={opened} onClose={onClose} title="Relais SMTP">
      <Stack>
        <Text size="sm" c="dimmed">Tous les messages sortants passent par ce service (Brevo, Mailjet, Amazon SES…). Indispensable quand l'hébergeur bloque le port 25.</Text>
        <Group grow align="flex-start">
          <TextInput label="Serveur" placeholder="smtp-relay.brevo.com" value={host} onChange={(e) => setHost(e.currentTarget.value)} data-autofocus />
          <Select label="Port" data={['587', '465', '2525', '25']} value={port} onChange={setPort} allowDeselect={false} />
        </Group>
        <TextInput label="Identifiant" value={username} onChange={(e) => setUsername(e.currentTarget.value)} autoComplete="off" />
        <PasswordInput label="Mot de passe" description="Conservé sur le serveur, accessible à root uniquement." value={password} onChange={(e) => setPassword(e.currentTarget.value)} autoComplete="new-password" />
        <TextInput
          label="Domaine SPF du relais (facultatif)"
          description="Ajouté à l'enregistrement SPF de tes domaines. Voir la documentation du service."
          placeholder="spf.brevo.com"
          value={spfInclude}
          onChange={(e) => setSpfInclude(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Annuler</Button>
          <Button loading={busy} disabled={!host || !username || !password} onClick={() => void submit()}>Enregistrer</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function TestMailCard({ domains }: { domains: MailDomain[] }) {
  const [domain, setDomain] = useState<string | null>(domains[0]?.domain ?? null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MailTestResult | null>(null);
  useEffect(() => {
    setDomain((d) => d ?? domains[0]?.domain ?? null);
  }, [domains]);
  const send = async () => {
    setBusy(true);
    setResult(null);
    const res = await mailCall<MailTestResult>('test.send', { domain, to: to.trim() });
    setBusy(false);
    if (res) setResult(res);
  };
  const label: Record<MailTestResult['status'], { text: string; color: string }> = {
    sent: { text: 'Remis au serveur du destinataire', color: 'teal' },
    deferred: { text: 'En attente : nouvel essai automatique', color: 'orange' },
    bounced: { text: 'Refusé', color: 'red' },
    pending: { text: 'Encore en file d\'attente', color: 'gray' },
  };
  return (
    <Card withBorder>
      <Text fw={600} mb="xs">E-mail de test</Text>
      <Group align="flex-end" gap="xs">
        <Select label="Expéditeur" data={domains.map((d) => ({ value: d.domain, label: `postmaster@${d.domain}` }))} value={domain} onChange={setDomain} allowDeselect={false} w={260} />
        <TextInput label="Destinataire" placeholder="toi@exemple.com" value={to} onChange={(e) => setTo(e.currentTarget.value)} style={{ flex: 1, minWidth: 200 }} />
        <Button leftSection={<IconSend size={16} stroke={1.5} />} loading={busy} disabled={!domain || !to.includes('@')} onClick={() => void send()}>Envoyer</Button>
      </Group>
      {result && (
        <Alert mt="sm" variant="light" color={label[result.status].color} title={label[result.status].text}>
          <Text size="xs" style={{ wordBreak: 'break-word' }}>{result.detail}</Text>
        </Alert>
      )}
    </Card>
  );
}

/** Diagnostic d'envoi du serveur, commun à tous les domaines. */
export function MailDeliverabilityPanel({ status, domains, onChanged }: { status: MailStatus; domains: MailDomain[]; onChanged: () => void }) {
  const [report, setReport] = useState<MailDeliverabilityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [relayOpen, setRelayOpen] = useState(false);
  const [publicIp, setPublicIp] = useState(status.publicIp ?? '');
  const [saving, setSaving] = useState(false);

  const run = async () => {
    setBusy(true);
    const res = await mailCall<MailDeliverabilityReport>('deliverability.check', {});
    setBusy(false);
    if (res) setReport(res);
  };
  const saveIp = async () => {
    setSaving(true);
    const res = await mailCall('settings.set', { publicIp }, 'IP publique enregistrée');
    setSaving(false);
    if (res) onChanged();
  };
  const clearRelay = async () => {
    if (await mailCall('relay.clear', {}, 'Relais retiré : envoi direct')) onChanged();
  };

  return (
    <Stack>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder>
          <Group justify="space-between" mb="sm">
            <Text fw={600}>Diagnostic d'envoi</Text>
            <Button size="compact-sm" variant="light" loading={busy} onClick={() => void run()}>{report ? 'Relancer' : 'Lancer'}</Button>
          </Group>
          {report ? <Report report={report} clockSynced={status.clockSynced} /> : (
            <Text size="sm" c="dimmed">Vérifie l'IP, le DNS inversé, le port 25 sortant et les listes noires. Contacte brièvement le serveur de réception de Gmail pour tester le port 25.</Text>
          )}
        </Card>
        <Stack>
          <Card withBorder>
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Relais SMTP</Text>
              {status.relay ? <Badge variant="light" color="teal">Actif</Badge> : <Badge variant="light" color="gray">Envoi direct</Badge>}
            </Group>
            <Text size="sm" c="dimmed" mb="sm">
              {status.relay ? `Envoi via ${status.relay.host}:${status.relay.port} (${status.relay.username}).` : 'Les messages partent directement vers le serveur du destinataire (port 25).'}
            </Text>
            <Group gap="xs">
              <Button size="compact-sm" variant="light" onClick={() => setRelayOpen(true)}>{status.relay ? 'Modifier' : 'Configurer'}</Button>
              {status.relay && <Button size="compact-sm" variant="subtle" color="red" onClick={() => void clearRelay()}>Retirer</Button>}
            </Group>
          </Card>
          <Card withBorder>
            <Text fw={600} mb={4}>IP publique</Text>
            <Text size="xs" c="dimmed" mb="xs">Seulement si le serveur est derrière un NAT. Détectée : {status.serverIp ?? 'inconnue'}.</Text>
            <Group gap="xs" align="flex-end">
              <TextInput placeholder="203.0.113.10" aria-label="IP publique" value={publicIp} onChange={(e) => setPublicIp(e.currentTarget.value)} style={{ flex: 1 }} />
              <Button size="sm" variant="light" loading={saving} disabled={publicIp === (status.publicIp ?? '')} onClick={() => void saveIp()}>Enregistrer</Button>
            </Group>
          </Card>
        </Stack>
      </SimpleGrid>
      {domains.length > 0 && <TestMailCard domains={domains} />}
      <RelayModal status={status} opened={relayOpen} onClose={() => setRelayOpen(false)} onDone={onChanged} />
    </Stack>
  );
}
