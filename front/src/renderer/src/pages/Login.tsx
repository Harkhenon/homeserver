import { useState } from 'react';
import { Paper, TextInput, PasswordInput, Button, Title, Stack, Text, ThemeIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconServer2 } from '@tabler/icons-react';
import { login, setToken } from '../api/client';
import { useNavigate } from 'react-router-dom';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    setLoading(true);
    try {
      const { token } = await login(username, password);
      setToken(token);
      navigate('/');
    } catch (err) {
      notifications.show({
        title: 'Connexion échouée',
        message: err instanceof Error ? err.message : 'Erreur',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <Paper w={{ base: '100%', sm: 400 }} p="xl" radius="lg" withBorder>
        <Stack align="center" mb="xl" gap="xs">
          <ThemeIcon size={48} radius="xl" variant="light">
            <IconServer2 size={26} stroke={1.5} />
          </ThemeIcon>
          <Title order={2} ta="center">Homeserver</Title>
          <Text c="dimmed" size="sm" ta="center">
            Panneau d'administration
          </Text>
        </Stack>
        <Stack>
          <TextInput
            label="Utilisateur"
            placeholder="admin"
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
          />
          <PasswordInput
            label="Mot de passe"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          />
          <Button fullWidth mt="md" loading={loading} onClick={() => void submit()}>
            Se connecter
          </Button>
        </Stack>
      </Paper>
    </div>
  );
}
