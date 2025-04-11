import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import HomeIcon from '@mui/icons-material/Home';
import PublicIcon from '@mui/icons-material/Public';
import SettingsIcon from '@mui/icons-material/Settings';
import StorageIcon from '@mui/icons-material/Storage';
import {
  Divider,
  Drawer,
  IconButton,
  Link,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';

const MainMenu = ({ drawer, DrawerHeader }) => {
  const theme = useTheme();
  return (
    <Drawer
      open={drawer.drawerOpen}
      onClose={() => drawer.closeDrawer()}
      variant="persistent"
      anchor="left"
    >
      <DrawerHeader>
        <IconButton onClick={drawer.closeDrawer()}>
          {theme.direction === 'rtl' ? (
            <ChevronLeftIcon />
          ) : (
            <ChevronRightIcon />
          )}
        </IconButton>
      </DrawerHeader>
      <List>
        <ListItem>
          <ListItemText secondary="Menu principal" />
        </ListItem>
        <ListItem>
          <ListItemButton component={Link} href={route('welcome')}>
            <ListItemIcon>
              <HomeIcon />
            </ListItemIcon>
            <ListItemText primary="Accueil" />
          </ListItemButton>
        </ListItem>
      </List>
      <Divider />
      <List>
        <ListItem>
          <ListItemText secondary="Gestion web" />
        </ListItem>
        <ListItem>
          <ListItemButton component={Link} href={route('domains')}>
            <ListItemIcon>
              <PublicIcon />
            </ListItemIcon>
            <ListItemText primary="Domaines" />
          </ListItemButton>
        </ListItem>
        <ListItem>
          <ListItemButton component={Link} href={route('hosting')}>
            <ListItemIcon>
              <StorageIcon />
            </ListItemIcon>
            <ListItemText primary="Hébergement" />
          </ListItemButton>
        </ListItem>
        <ListItem>
          <ListItemButton component={Link} href={route('settings')}>
            <ListItemIcon>
              <SettingsIcon />
            </ListItemIcon>
            <ListItemText primary="Paramètres" />
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
  );
};

export default MainMenu;
