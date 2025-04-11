import { Box, TextField } from '@mui/material';

function DomainFormPart({ mainForm }) {
  const handleChange = (e) => {
    mainForm.setData({ ...mainForm.data, [e.target.name]: e.target.value });
  };

  return (
    <>
      <Box sx={{ padding: 5, gap: 3, display: 'flex' }}>
        <TextField
          id="fqdn"
          name="fqdn"
          label="FQDN"
          value={mainForm.data.fqdn}
          onChange={handleChange}
        />
        <TextField
          id="ns1"
          name="ns1"
          label="Name Server 1"
          value={mainForm.data.ns1}
          onChange={handleChange}
        />
        <TextField
          id="ns2"
          name="ns2"
          label="Name Server 2"
          value={mainForm.data.ns2}
          onChange={handleChange}
        />
      </Box>
    </>
  );
}

export default DomainFormPart;
