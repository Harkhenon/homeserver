import { useState } from 'react';
import { Modal, Tabs, Stack, TextInput, PasswordInput, Button, Group, Avatar, Text, Divider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { AppearancePanel } from '../components/settings/AppearancePanel';

interface SettingsModalProps {
  opened: boolean;
  onClose: () => void;
  username: string;
  avatarSeed: string;
  onAvatarChange: (seed: string) => void;
}

export function SettingsModal({ opened, onClose, username, avatarSeed, onAvatarChange }: SettingsModalProps) {
  const [avatarInput, setAvatarInput] = useState(avatarSeed);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const initials = avatarSeed.trim().slice(0, 2).toUpperCase() || username.slice(0, 2).toUpperCase();

  const saveAvatar = () => {
    onAvatarChange(avatarInput);
    notifications.show({ message: 'Avatar mis à jour', color: 'green' });
  };

  const savePassword = () => {
    if (newPassword.length < 8) {
      notifications.show({ message: 'Le mot de passe doit faire au moins 8 caractères', color: 'red' });
      return;
    }
    if (newPassword !== confirmPassword) {
      notifications.show({ message: 'Les mots de passe ne correspondent pas', color: 'red' });
      return;
    }
    notifications.show({ message: 'Fonctionnalité à venir (API changement de mot de passe)', color: 'orange' });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <Modal opened={opened} onClose={onClose} title={`${username} — Options`} size="lg" centered>
      <Tabs defaultValue="profile">
        <Tabs.List>
          <Tabs.Tab value="profile">Profil</Tabs.Tab>
          <Tabs.Tab value="appearance">Apparence</Tabs.Tab>
          <Tabs.Tab value="security">Sécurité</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="profile" pt="md">
          <Stack>
            <Group>
              <Avatar color="initials" radius="xl" size={64}>{initials}</Avatar>
              <Stack gap={4}>
                <Text size="sm" fw={600}>{username}</Text>
                <Text size="xs" c="dimmed">Administrateur du panel</Text>
              </Stack>
            </Group>
            <Divider my={4} />
            <TextInput
              label="Avatar (initiales affichées)"
              placeholder="ex: HK"
              value={avatarInput}
              onChange={(e) => setAvatarInput(e.currentTarget.value)}
              maxLength={2}
            />
            <Button size="sm" variant="light" onClick={saveAvatar} style={{ alignSelf: 'flex-start' }}>
              Mettre à jour l'avatar
            </Button>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="appearance" pt="md">
          <AppearancePanel compact />
        </Tabs.Panel>

        <Tabs.Panel value="security" pt="md">
          <Stack>
            <PasswordInput label="Mot de passe actuel" value={currentPassword} onChange={(e) => setCurrentPassword(e.currentTarget.value)} />
            <PasswordInput label="Nouveau mot de passe" value={newPassword} onChange={(e) => setNewPassword(e.currentTarget.value)} />
            <PasswordInput label="Confirmer le nouveau mot de passe" value={confirmPassword} onChange={(e) => setConfirmPassword(e.currentTarget.value)} />
            <Button size="sm" variant="light" onClick={savePassword} style={{ alignSelf: 'flex-start' }}>
              Changer le mot de passe
            </Button>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
