import '@sass/Parts/Footer.scss';

import FavoriteIcon from '@mui/icons-material/Favorite';
import { Box, Link } from '@mui/material';

const Footer = () => {
  return (
    <footer>
      <Box sx={{ display: 'flex' }}>
        Homeserver 2022 Created with&nbsp;
        <FavoriteIcon name="heart" sx={{ color: 'red' }} />
        &nbsp;by&nbsp;
        <Link href="https://hark.ovh" target="_blank" rel="noreferrer">
          Harkhenon
        </Link>
      </Box>
    </footer>
  );
};
export default Footer;
