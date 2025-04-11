import { Head, useForm } from '@inertiajs/react';
import { Delete } from '@mui/icons-material';
import {
  Box,
  Button,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { toast } from 'react-toastify';
import DNSForm from './Forms/DNSForm';
import DomainFormPart from './Forms/DomainFormPart';

function DomainForm({ item }) {
  const form = useForm({
    fqdn: item.fqdn ? item.fqdn : '',
    ns1: item.ns1 ? item.ns1 : '',
    ns2: item.ns2 ? item.ns2 : '',
    zones: item.zones ? JSON.parse(item.zones) : [],
  });

  const deleteZoneEntry = (e) => {
    let zones = form.data.zones;
    zones.splice(e.currentTarget.dataset.id, 1);
    form.setData({ ...form.data, zones: [...zones] });
  };

  const handleSubmit = () => {
    form.patch(route('domains.update', { fqdn: form.data.fqdn }), {
      onSuccess: () => {
        toast.success('Le domaine à été mis à jour');
        prompt("C'est cool hein ?");
      },
    });
  };

  const handleDelete = () => {
    if (
      confirm(
        'Êtes-vous sûr de vouloir supprimer le domaine ' + item.fqdn + ' ?',
      )
    ) {
      form.delete(
        route('domains.delete', {
          id: item.id,
        }),
        {
          onSuccess: () => {
            toast.success(item.fqdn + ' a bien été supprimé');
          },
        },
      );
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexWrap: 'wrap' }}>
      <Head title="Modifier un domaine" />
      <Box sx={{ display: 'inline-flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          sx={{}}
          onClick={handleSubmit}
          disabled={!form.isDirty}
        >
          Enregistrer les modifications
        </Button>
        <Button
          variant="contained"
          sx={{ backgroundColor: '#990000' }}
          startIcon={<Delete />}
          onClick={handleDelete}
        >
          Supprimer le domaine
        </Button>
      </Box>
      <Typography variant="h3">Domain form</Typography>
      <DomainFormPart mainForm={form} />
      <Typography variant="h3">DNS Zone</Typography>
      <DNSForm mainForm={form} />
      <Box>
        <TableContainer component={Paper}>
          <Table aria-label="simple table">
            <TableHead>
              <TableRow>
                <TableCell>Clé</TableCell>
                <TableCell>Type d'entrée</TableCell>
                <TableCell>Valeur</TableCell>
                <TableCell>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(form.data.zones.length === 0 && (
                <TableRow>
                  <TableCell rowSpan={3}>Aucune donnée enregistrée</TableCell>
                </TableRow>
              )) ||
                form.data.zones.map((i, index) => {
                  const entry = i.split(' ');
                  return (
                    <TableRow key={i}>
                      <TableCell>{entry[0]}</TableCell>
                      <TableCell>{entry[1]}</TableCell>
                      <TableCell>{entry[2]}</TableCell>
                      <TableCell>
                        <IconButton data-id={index} onClick={deleteZoneEntry}>
                          <Delete sx={{ color: 'red' }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}

export default DomainForm;
