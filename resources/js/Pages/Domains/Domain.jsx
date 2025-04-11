import MainLayout from '@/Layouts/MainLayout';
import { Link } from '@inertiajs/react';
import { Box, Button, Paper, Tab, Tabs, Typography } from '@mui/material';
import { useState } from 'react';
import DomainForm from './Parts/DomainForm';
import SSL from './Parts/SSL';

function CustomTabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`,
  };
}

function Domain({ item }) {
  const [value, setValue] = useState(0);

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  return (
    <MainLayout>
      {(item.default === 1 && (
        <Box sx={{ flexGrow: 1, overflow: 'scroll' }}>
          <Paper sx={{ textAlign: 'center' }}>
            <Typography variant="h3">
              Ce domaine est le domain par défaut de votre installation, il ne
              peut être modifié
            </Typography>
            <Button variant={Link} href={route('domains')}>
              Retour à la liste
            </Button>
          </Paper>
        </Box>
      )) || (
        <Box sx={{ flexGrow: 1 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs
              value={value}
              onChange={handleChange}
              aria-label="basic tabs example"
            >
              <Tab label="Domaine" {...a11yProps(0)} />
              <Tab label="SSL" {...a11yProps(1)} />
            </Tabs>
          </Box>
          <CustomTabPanel value={value} index={0}>
            <DomainForm item={item} />
          </CustomTabPanel>
          <CustomTabPanel value={value} index={1}>
            <SSL item={item} />
          </CustomTabPanel>
        </Box>
      )}
    </MainLayout>
  );
}

export default Domain;
