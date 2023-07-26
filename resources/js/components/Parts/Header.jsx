import React, { useState } from 'react';
import '@sass/Parts/Header.scss';
import { Icon, Button, Grid } from 'semantic-ui-react';
import { Link } from 'react-router-dom';
import MainMenu from '@src/Parts/MainMenu';

const Header = props => {

    const [ sidebarVisibility, setSidebarVisibility ] = useState(false)
    const { credentials } = props

    return (
      <React.Fragment>
        <Grid as='header' columns={5} stackable textAlign='right' verticalAlign='middle'>
          <Grid.Column as="h1" width={10} textAlign='left'>Homeserver</Grid.Column>
          <Grid.Column
            floated='right'
            width={1} as={Button}
            icon="bars"
            onClick={() => setSidebarVisibility(!sidebarVisibility)}
          />
          <Grid.Column as='span' width={2}>{credentials.username}</Grid.Column>
          <Grid.Column as='span' width={2}>{credentials.email}</Grid.Column>
          <Grid.Column as={Link} width={1} to="/user/logout" title='Log out'>
            <Icon name='log out' />
          </Grid.Column>
        </Grid>
        <nav>
          <MainMenu
            sidebarVisibility={sidebarVisibility}
            setSidebarVisibility={setSidebarVisibility}
          />
        </nav>
      </React.Fragment>
    )
}

export default Header;
