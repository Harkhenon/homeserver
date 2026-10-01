import { Center, Loader, Alert, Stack } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

export function LoadingBlock() {
  return (
    <Center h={200}>
      <Loader />
    </Center>
  );
}

export function ErrorBlock({ error }: { error: string }) {
  return (
    <Alert color="red" icon={<IconAlertCircle size={16} />} title="Erreur">
      {error}
    </Alert>
  );
}

export function PageStack({ children }: { children: React.ReactNode }) {
  return <Stack gap="md">{children}</Stack>;
}
