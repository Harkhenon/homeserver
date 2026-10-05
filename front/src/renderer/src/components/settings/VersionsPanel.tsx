import { useState } from 'react';
import { Stack, Select, Divider, Text, Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';

const NODE_VERSIONS = [
  { value: '22', label: 'Node.js 22 (LTS)' },
  { value: '20', label: 'Node.js 20 (LTS)' },
  { value: '18', label: 'Node.js 18' },
];

const PHP_VERSIONS = [
  { value: '8.4', label: 'PHP 8.4' },
  { value: '8.3', label: 'PHP 8.3' },
  { value: '8.2', label: 'PHP 8.2' },
  { value: '8.1', label: 'PHP 8.1' },
];

const APACHE_VERSIONS = [
  { value: '2.4', label: 'Apache 2.4' },
];

const NGINX_VERSIONS = [
  { value: 'stable', label: 'Nginx (stable)' },
  { value: 'mainline', label: 'Nginx (mainline)' },
];

const MARIADB_VERSIONS = [
  { value: '11.8', label: 'MariaDB 11.8 (LTS)' },
  { value: '11.4', label: 'MariaDB 11.4 (LTS)' },
  { value: '10.11', label: 'MariaDB 10.11 (LTS)' },
];

export function VersionsPanel() {
  const [nodeVersion, setNodeVersion] = useState('22');
  const [phpVersion, setPhpVersion] = useState('8.3');
  const [apacheVersion, setApacheVersion] = useState('2.4');
  const [nginxVersion, setNginxVersion] = useState('stable');
  const [mariadbVersion, setMariadbVersion] = useState('11.4');

  const save = () => {
    notifications.show({
      message: 'Versions par défaut enregistrées (fonction de test)',
      color: 'green',
    });
  };

  return (
    <Stack>
      <Text size="sm" fw={600}>Runtime &amp; services</Text>
      <Select
        label="Node.js"
        data={NODE_VERSIONS}
        value={nodeVersion}
        onChange={(v) => v && setNodeVersion(v)}
      />
      <Select
        label="PHP"
        data={PHP_VERSIONS}
        value={phpVersion}
        onChange={(v) => v && setPhpVersion(v)}
      />
      <Select
        label="Apache"
        data={APACHE_VERSIONS}
        value={apacheVersion}
        onChange={(v) => v && setApacheVersion(v)}
      />
      <Select
        label="Nginx"
        data={NGINX_VERSIONS}
        value={nginxVersion}
        onChange={(v) => v && setNginxVersion(v)}
      />
      <Select
        label="MariaDB"
        data={MARIADB_VERSIONS}
        value={mariadbVersion}
        onChange={(v) => v && setMariadbVersion(v)}
      />
      <Divider my={4} />
      <Button size="sm" variant="light" onClick={save} style={{ alignSelf: 'flex-start' }}>
        Enregistrer
      </Button>
    </Stack>
  );
}
