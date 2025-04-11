import React from 'react';
import { Button, Icon } from 'semantic-ui-react';
import { Link } from 'react-router-dom';

const MainMenu = () => {
  return (
    <nav id='main-nav'>
        <Button className='main-button' color='orange' icon as={Link} to="hosting">
            <Icon name="warehouse" /> Hosting
        </Button>
        <Button className='main-button' color='orange' icon>
            <Icon name="cog" /> Settings
        </Button>
    </nav>
  )
}

export default MainMenu;