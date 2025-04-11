import MainLayout from '@/Layouts/MainLayout';
import { Head, Link as InertiaLink } from '@inertiajs/react';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import StarIcon from '@mui/icons-material/Star';
import {
  Box,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { tableCellClasses } from '@mui/material/TableCell';
import Domain from './Domain';
import NewDomain from './Parts/Forms/NewDomain';

export default function Domains({ domains, item }) {
  const StyledTableCell = styled(TableCell)(({ theme }) => ({
    [`&.${tableCellClasses.head}`]: {
      backgroundColor: theme.palette.common.black,
      color: theme.palette.common.white,
    },
  }));

  const StyledTableRow = styled(TableRow)(({ theme }) => ({
    '&:nth-of-type(odd)': {
      backgroundColor: theme.palette.action.hover,
    },
    // hide last border
    '&:last-child td, &:last-child th': {
      border: 0,
    },
  }));

  if (item) {
    return <Domain item={item} />;
  } else {
    return (
      <MainLayout>
        <Head title="Domains" />
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h1">Domains</Typography>
          <Stack
            sx={{ flexDirection: 'row', gap: 1, marginTop: 5, marginBottom: 5 }}
          >
            <StarIcon />
            <Typography sx={{ color: '#656565' }}>
              Domaine par défaut :
            </Typography>
            <Typography>
              {
                domains.find((defaultDomain) => defaultDomain.default === 1)
                  .fqdn
              }
            </Typography>
          </Stack>
          <Box
            sx={{
              maxWidth: { sm: '100vw', lg: '80vw' },
              margin: 'auto',
              padding: 2,
            }}
          >
            <NewDomain />
          </Box>
          <TableContainer
            component={Paper}
            sx={{
              maxWidth: { sm: '100vw', lg: '80vw' },
              margin: 'auto',
            }}
          >
            <Table aria-label="simple table">
              <TableHead>
                <TableRow>
                  <StyledTableCell align="center">FQDN</StyledTableCell>
                  <StyledTableCell align="center">
                    Name Server 1
                  </StyledTableCell>
                  <StyledTableCell align="center">
                    Name Server 2
                  </StyledTableCell>
                  <StyledTableCell align="center">SSL</StyledTableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {domains
                  .filter((def) => def.default !== 1)
                  .map((row) => (
                    <StyledTableRow key={row.fqdn}>
                      <StyledTableCell
                        component="th"
                        scope="row"
                        align="center"
                      >
                        <Link
                          component={InertiaLink}
                          href={`/domains/${row.fqdn}`}
                        >
                          {row.fqdn}
                        </Link>
                      </StyledTableCell>
                      <StyledTableCell align="center">
                        {row.ns1}
                      </StyledTableCell>
                      <StyledTableCell align="center">
                        {row.ns2}
                      </StyledTableCell>
                      <StyledTableCell align="center">
                        {(row.ssl_secured && (
                          <LockIcon sx={{ color: 'green' }} />
                        )) || <LockOpenIcon sx={{ color: 'red' }} />}
                      </StyledTableCell>
                    </StyledTableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </MainLayout>
    );
  }
}
