import React from 'react';
import { Icon, Menu, Sidebar } from 'semantic-ui-react';
import { Link } from 'react-router-dom';

const MainMenu = props => {

  const { sidebarVisibility, setSidebarVisibility } = props;

  return (
      <Sidebar
        as={Menu}
        animation='push'
        icon='labeled'
        inverted
        vertical
        visible={sidebarVisibility}
        width='wide'
        onClick={() => setSidebarVisibility(!sidebarVisibility)}
      >
      <Menu.Item as={Link} to='/'>
        <Icon name='home' />
        Home
      </Menu.Item>
      <Menu.Item as={Link} to='/domains'>
        <Icon name='world' />
        Domains
      </Menu.Item>
      <Menu.Item as={Link} to='/hosting'>
        <Icon name='server' />
        Hosting
      </Menu.Item>
      <Menu.Item as='a'>
        <Icon name='settings' />
        Settings
      </Menu.Item>
    </Sidebar>
  )
}

export default MainMenu;