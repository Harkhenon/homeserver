import { useState } from 'react';
import { Menu, Avatar, Text, Badge, Divider } from '@mantine/core';
import { IconUser, IconSettings, IconLogout } from '@tabler/icons-react';
import { setToken } from '../api/client';
import { useNavigate } from 'react-router-dom';

interface UserMenuProps {
  username: string;
  onOpenSettings: () => void;
}

export function UserMenu({ username, onOpenSettings }: UserMenuProps) {
  const [opened, setOpened] = useState(false);
  const navigate = useNavigate();

  return (
    <Menu
      width={220}
      position="bottom-end"
      opened={opened}
      onChange={setOpened}
      withinPortal
      shadow="md"
    >
      <Menu.Target>
        <Avatar
          color="initials"
          radius="xl"
          size={34}
          style={{ cursor: 'pointer', flexShrink: 0 }}
        >
          {username.slice(0, 2).toUpperCase()}
        </Avatar>
      </Menu.Target>
      <Menu.Dropdown>
        <div style={{ padding: '8px 12px' }}>
          <Text size="sm" fw={600}>{username}</Text>
          <Badge size="xs" variant="light" color="green" mt={4}>Administrateur</Badge>
        </div>
        <Divider my={4} />
        <Menu.Item leftSection={<IconUser size={16} stroke={1.5} />} onClick={onOpenSettings}>
          Profil
        </Menu.Item>
        <Menu.Item leftSection={<IconSettings size={16} stroke={1.5} />} onClick={onOpenSettings}>
          Options
        </Menu.Item>
        <Divider my={4} />
        <Menu.Item
          color="red"
          leftSection={<IconLogout size={16} stroke={1.5} />}
          onClick={() => {
            setToken(null);
            navigate('/login');
          }}
        >
          Déconnexion
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
