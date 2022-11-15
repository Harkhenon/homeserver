import React from 'react'
import { Button, Popup } from 'semantic-ui-react';

const UserBar = () => {
  return (
    <aside id='user-bar'>
        <span>Thomas BALANS</span>
        <span>homeserver@isodev.ovh</span>
            <Popup content="Log out" trigger={
                <Button icon="log out" />
            }
            />
    </aside>
  )
}

export default UserBar;
