import useValidator from '@/Hooks/useValidator';
import { useForm } from '@inertiajs/react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import DNSTypeList from '@resources/json/dnsTypeList';

function DNSForm({ mainForm }) {
  const { testAll } = useValidator();
  const form = useForm({
    key: '',
    type: '',
    value: '',
  });

  const handleChange = (e) => {
    let value = e.target.value;
    if (testAll(value) === 'domain') {
      value = value + '.';
    }

    form.setData({
      ...form.data,
      [e.target.name]: value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    mainForm.setData({
      ...mainForm.data,
      zones: [
        ...mainForm.data.zones,
        `${form.data.key} ${form.data.type} ${form.data.value}`,
      ],
    });

    form.reset();
  };

  return (
    <>
      <Box sx={{ padding: 5 }} component="form" onSubmit={handleSubmit}>
        <Box sx={{ display: 'flex', flexDirection: 'row', gap: 3 }}>
          <TextField
            id="identifier"
            label="Clé"
            name="key"
            required
            value={form.data.key}
            onChange={handleChange}
          />
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id="dns-type-label">Type d'entrée</InputLabel>
            <Select
              name="type"
              label="Type d'entrée"
              labelId="dns-type-label"
              id="type"
              required
              autoWidth
              value={form.data.type}
              onChange={handleChange}
            >
              {DNSTypeList.map((type) => (
                <MenuItem value={type.value} key={type.key}>
                  {type.text}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            id="value"
            name="value"
            label="Valeur"
            value={form.data.value}
            required
            onChange={handleChange}
          />
          <Button type="submit">Créer une entrée DNS</Button>
        </Box>
      </Box>
    </>
  );
}

export default DNSForm;
