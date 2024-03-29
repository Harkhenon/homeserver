import React from 'react';
import './scss/Header.scss';
import UserBar from './UserBar';

class Header extends React.Component {

    constructor(props) {
        super(props);
    }

    render() {
        const { username, email, settings, setSidebarVisibility } = this.props;
        return (
            <React.Fragment>
                {/*<Sidebar
                as={Menu}
                    animation='scale down'
                    icon='labeled'
                    inverted
                    vertical
                    visible={settings.sidebarVisibility}
                    width='wide'
                    >
                        <Text to="/user" as={Link} inverted icon>
                            <Icon name='user' size='tiny' />
                            {username}
                        </Text>
                        <br />
                        <Text inverted size='tiny'>
                            <Text.Content>{email}</Text.Content>
                        </Text>
                        <br />
                        <Button
                            to="/user/logout"
                            as={Link} color='red'
                            icon='log out'
                            content='Log Out'
                        />
                        <Menu.Item as={Text} color='grey' onClick={setSidebarVisibility}>
                            Apache & Bind
                        </Menu.Item>
                        <Menu.Item as={Link} to='/domains' onClick={setSidebarVisibility}>
                            Domain names
                        </Menu.Item>
                        <Menu.Item as={Link} to='/hosting' onClick={setSidebarVisibility}>
                            Hosted domains
                        </Menu.Item>
                        <Menu.Item as={Link} to='/security' onClick={setSidebarVisibility}>
                            Security
                        </Menu.Item>
                </Sidebar>*/}
                <header>
                    {/* <Button
                         basic
                         inverted
                         floated='right'
                         icon='bars'
                         onClick={setSidebarVisibility}
                         content='Menu'
                         id='main-menu'
                    />*/}
                    <h1>Homeserver</h1>
                </header>
                <UserBar />
            </React.Fragment>
        )
    }
}

export default Header;
