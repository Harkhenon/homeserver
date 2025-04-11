import { Head, router, useForm } from '@inertiajs/react';
import { Box, Button, Checkbox, TextField } from '@mui/material';

function NewDomain() {
  const form = useForm({
    fqdn: '',
    ns1: '',
    ns2: '',
    ssl: false,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.data.ssl) {
      router.visit(
        'https://nslookup.techweirdo.net/api/lookup?domain=' + form.data.fqdn,
        {
          onSuccess: (res) => {
            console.log(res);
          },
          onError: (e) => {
            console.table(e.stack);
          },
        },
      );
    }
  };

  return (
    <Box
      component="form"
      sx={{ display: 'inline-flex', gap: 2 }}
      onSubmit={handleSubmit}
    >
      <Head>
        <meta name="referrer" content="no-referrer" />
      </Head>
      <TextField
        id="fqdn"
        name="fqdn"
        placeholder="Nom de domaine"
        value={form.data.fqdn}
        onChange={(e) => {
          console.log(form.data);
          form.setData({ ...form.data, [e.target.name]: e.target.value });
        }}
      />
      <TextField
        id="ns1"
        name="ns1"
        placeholder="DNS 1"
        value={form.data.ns1}
        onChange={(e) =>
          form.setData({ ...form.data, [e.target.name]: e.target.value })
        }
      />
      <TextField
        id="ns2"
        name="ns2"
        placeholder="DNS 2"
        value={form.data.ns2}
        onChange={(e) =>
          form.setData({ ...form.data, [e.target.name]: e.target.value })
        }
      />
      <Checkbox
        name="ssl"
        value={form.data.ssl}
        onChange={(e) =>
          form.setData({ ...form.data, [e.target.name]: e.target.checked })
        }
      />
      <Button type="submit">Enregistrer le domaine</Button>
    </Box>
  );
}

export default NewDomain;
