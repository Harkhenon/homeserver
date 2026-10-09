import { useState } from 'react';
import { Select, Stack, TextInput, PasswordInput, Button, Divider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import type { SftpUser } from '../types';

const NEW_USER = '__new__';

interface UserPickerProps {
  label?: string;
  value: string | null;
  onChange: (username: string) => void;
  onCreated?: (username: string) => void;
}

export function UserPicker({ label = 'Utilisateur', value, onChange, onCreated }: UserPickerProps) {
  const users = useModuleQuery<SftpUser[]>('users', 'users.list');
  const action = useModuleAction('users');
  const [mode, setMode] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const create = async () => {
    const res = await action.run('users.create', { username, password });
    if (res !== null) {
      notifications.show({ message: `Utilisateur ${username} créé`, color: 'green' });
      onChange(username);
      onCreated?.(username);
      setMode(null);
      setPassword('');
      void users.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Stack gap="xs">
      <Select
        label={label}
        placeholder="Choisir un utilisateur"
        data={[
          ...(users.data ?? []).map((u) => ({ label: u.username, value: u.username })),
          { label: '— Créer un nouvel utilisateur —', value: NEW_USER },
        ]}
        value={mode === NEW_USER ? null : value}
        onChange={(v) => {
          setMode(null);
          if (v === NEW_USER) {
            setMode(NEW_USER);
          } else if (v) {
            onChange(v);
          } else {
            onChange('');
          }
        }}
        disabled={users.loading}
      />
      {mode === NEW_USER && (
        <>
          <Divider my={4} label="Nouvel utilisateur" labelPosition="center" />
          <TextInput
            label="Nom d'utilisateur"
            placeholder="web-alice"
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            required
          />
          <PasswordInput
            label="Mot de passe (8 min.)"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
          />
          <Button size="sm" loading={action.loading} disabled={!username || !password} onClick={() => void create()}>
            Créer l'utilisateur
          </Button>
        </>
      )}
    </Stack>
  );
}
