import { useState } from 'react';
import { Alert, Badge, Button, Card, Group, NumberInput, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { mailCall } from './MailboxesPanel';
import type { MailAntispamConfig, MailStatus } from '../../types';

/** Rspamd : 2 Go conseillés, ClamAV : 3 Go (mêmes seuils que le helper, qui reste seul juge). */
const MIN_RSPAMD_MB = 1500;
const MIN_CLAMAV_MB = 2800;

export function MailAntispamPanel({ status, onChanged }: { status: MailStatus; onChanged: () => void }) {
  const [cfg, setCfg] = useState<MailAntispamConfig>(status.antispam);
  const [junk, setJunk] = useState<number | string>(status.antispam.junkScore);
  const [reject, setReject] = useState<number | string>(status.antispam.rejectScore);
  const [busy, setBusy] = useState(false);

  const rspamd = cfg.engine === 'rspamd';
  const rspamdRoom = status.memoryMb >= MIN_RSPAMD_MB;
  const clamavRoom = status.memoryMb >= MIN_CLAMAV_MB;
  const scoresValid = Number(junk) >= 1 && Number(reject) <= 100 && Number(junk) < Number(reject);
  const dirty = JSON.stringify({ ...cfg, junkScore: Number(junk), rejectScore: Number(reject) }) !== JSON.stringify(status.antispam);

  const save = async () => {
    setBusy(true);
    const res = await mailCall('antispam.set', { ...cfg, junkScore: Number(junk), rejectScore: Number(reject) }, 'Antispam mis à jour');
    setBusy(false);
    if (res) onChanged();
  };

  return (
    <Stack maw={860}>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder>
          <Text fw={600} mb="xs">Contrôles de base</Text>
          <Text size="sm" c="dimmed" mb="md">Appliqués par Postfix à la réception (port 25), sur toutes les distributions. Les ports d'envoi authentifié n'y sont pas soumis.</Text>
          <Stack gap="sm">
            <Switch
              label="Listes noires (Spamhaus, SpamCop)"
              description="Peu efficace derrière un résolveur public (Google, Cloudflare) : ces listes lui refusent de répondre, et rien n'est alors bloqué."
              checked={cfg.rbl}
              onChange={(e) => { const v = e.currentTarget.checked; setCfg((c) => ({ ...c, rbl: v })); }}
            />
            <Switch
              label="Expéditeur et HELO stricts"
              description="Refuse les noms mal formés et les domaines d'expéditeur inexistants."
              checked={cfg.strictSender}
              onChange={(e) => { const v = e.currentTarget.checked; setCfg((c) => ({ ...c, strictSender: v })); }}
            />
          </Stack>
        </Card>
        <Card withBorder>
          <Group justify="space-between" mb="xs">
            <Text fw={600}>Rspamd</Text>
            {status.rspamdAvailable
              ? <Badge variant="light" color={status.antispam.engine === 'rspamd' ? 'teal' : 'gray'}>{status.antispam.engine === 'rspamd' ? 'Actif' : 'Disponible'}</Badge>
              : <Badge variant="light" color="orange">Non disponible</Badge>}
          </Group>
          {!status.rspamdAvailable && (
            <Alert variant="light" color="orange" mb="sm">Absent des dépôts de cette distribution : le panel n'ajoute pas de dépôt tiers. Les contrôles de base restent actifs.</Alert>
          )}
          {status.rspamdAvailable && !rspamdRoom && (
            <Alert variant="light" color="orange" mb="sm">Rspamd demande au moins 2 Go de RAM ({status.memoryMb} Mo sur ce serveur).</Alert>
          )}
          <Stack gap="sm">
            <Switch
              label="Analyse des messages reçus"
              description="Installe Rspamd et Redis, environ 300 Mo de RAM. Si Rspamd tombe, le courrier continue d'arriver sans analyse."
              disabled={!status.rspamdAvailable || (!rspamdRoom && !rspamd)}
              checked={rspamd}
              onChange={(e) => { const v = e.currentTarget.checked; setCfg((c) => ({ ...c, engine: v ? 'rspamd' : 'basic', clamav: v ? c.clamav : false })); }}
            />
            <Group grow align="flex-start">
              <NumberInput label="Indésirable à partir de" description="Classé dans Junk." min={1} max={99} decimalScale={1} disabled={!rspamd} value={junk} onChange={setJunk} />
              <NumberInput label="Refus à partir de" description="Rejeté à la réception." min={2} max={100} decimalScale={1} disabled={!rspamd} value={reject} onChange={setReject} />
            </Group>
            <Switch
              label="Antivirus ClamAV"
              description={clamavRoom
                ? 'Environ 1,2 Go de RAM de plus. Sa base est téléchargée en arrière-plan : l\'analyse commence une fois celle-ci en place.'
                : `Demande au moins 3 Go de RAM (${status.memoryMb} Mo sur ce serveur).`}
              disabled={!rspamd || (!clamavRoom && !cfg.clamav)}
              checked={cfg.clamav}
              onChange={(e) => { const v = e.currentTarget.checked; setCfg((c) => ({ ...c, clamav: v })); }}
            />
          </Stack>
        </Card>
      </SimpleGrid>
      {!scoresValid && <Alert variant="light" color="red">Le seuil de refus doit dépasser celui des indésirables (scores de 1 à 100).</Alert>}
      <Group justify="flex-end">
        <Button loading={busy} disabled={!dirty || !scoresValid} onClick={() => void save()}>Enregistrer</Button>
      </Group>
    </Stack>
  );
}
