import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, Sidebar, Card, Image, Button, Header as Text, Icon, Segment } from 'semantic-ui-react';
import './scss/Header.scss';

class Header extends React.Component {

    constructor(props) {
        super(props);
    }

    render() {
        const { username, email, sidebarVisibility, setSidebarVisibility } = this.props;
        return (
            <React.Fragment>
                <Sidebar
                as={Menu}
                    animation='scale down'
                    icon='labeled'
                    inverted
                    vertical
                    visible={sidebarVisibility}
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
                </Sidebar>
                <header>
                    <Button
                        basic
                        inverted
                        floated='right'
                        icon='bars'
                        onClick={setSidebarVisibility}
                        content='Menu'
                    />
                    <h1>Homeserver</h1>
                </header>
            </React.Fragment>
        )
    }
}

export default Header;
