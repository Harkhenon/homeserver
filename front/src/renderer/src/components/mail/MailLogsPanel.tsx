import { useCallback, useEffect, useState } from 'react';
import { Button, Code, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { mailCall } from './MailboxesPanel';
import type { MailLogsResult } from '../../types';

/** Journaux du courrier sur 7 jours. Une adresse retrouve aussi les lignes de ses messages. */
export function MailLogsPanel({ initialQuery = '' }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [limit, setLimit] = useState<string | null>('300');
  const [lines, setLines] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (q: string, max: string | null) => {
    setBusy(true);
    const res = await mailCall<MailLogsResult>('logs', { query: q.trim(), limit: Number(max) });
    setBusy(false);
    if (res) setLines(res.lines);
  }, []);

  useEffect(() => { void load(initialQuery, '300'); }, [initialQuery, load]);

  return (
    <Stack>
      <Group align="flex-end" gap="xs">
        <TextInput
          label="Filtrer"
          placeholder="adresse, domaine ou texte"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void load(query, limit); }}
          style={{ flex: 1, minWidth: 220 }}
        />
        <Select label="Lignes" data={['100', '300', '1000', '2000']} value={limit} onChange={setLimit} allowDeselect={false} w={100} />
        <Button variant="light" loading={busy} leftSection={<IconRefresh size={16} stroke={1.5} />} onClick={() => void load(query, limit)}>Afficher</Button>
      </Group>
      {lines !== null && lines.length === 0 && <Text c="dimmed" ta="center" py="md">Aucune ligne sur les 7 derniers jours.</Text>}
      {lines !== null && lines.length > 0 && (
        <Code block style={{ maxHeight: 520, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{lines.join('\n')}</Code>
      )}
    </Stack>
  );
}
