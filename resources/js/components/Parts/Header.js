import React from 'react';

import { SideNav, SideNavItem, Button, Icon, NavLink } from 'react-materialize';
import { Link } from 'react-router-dom';
import './scss/Header.scss';

class Header extends React.Component {

    constructor(props) {
        super(props);
    }

    render() {
        const { username, email } = this.props;
        return (
            <header>
                <SideNav
                    trigger={<Button node="button">Let's start!</Button>}
                    options={{
                        draggable: true
                    }}
                >
                    <li>
                        <div className="user-view">
                            <div className="background">
                                <img src="https://placeimg.com/640/480/tech" alt="tech" />
                            </div>
                            <Link className="waves-effect waves-light btn-small" to="/user">
                                <i className="material-icons left">person</i>
                                {username}
                            </Link>
                            <span className="white-text email btn-small orange">
                                <i className="material-icons left">email</i>
                                {email}
                            </span>
                            <Link
                                to="/user/logout"
                                className="waves-effect waves-light btn-small red"
                            >
                                <i className="material-icons left">logout</i>
                                Log Out
                            </Link>
                        </div>
                    </li>
                    <li>
                        <Link to="/">
                            <i className="material-icons prefix">home</i>Home
                        </Link>
                    </li>
                    <li>
                        <Link to="/system">
                            <i className="material-icons prefix">settings</i>System
                        </Link>
                    </li>
                    <SideNavItem divider />
                    <SideNavItem subheader>
                        Packages
                    </SideNavItem>
                    <SideNavItem divider />
                    <li>
                        <Link to="/packages">
                            <i className="material-icons prefix">list</i>List
                        </Link>
                    </li>
                    <li>
                        <Link to="packages/configuration">
                            <i className="material-icons prefix">settings_applications</i>Configuration
                        </Link>
                    </li>
                    <li>
                        <Link to="/packages/logs">
                            <i className="material-icons prefix">feedback</i>Logs
                        </Link>
                    </li>
                    <SideNavItem divider />
                    <SideNavItem subheader>
                        Plugins
                    </SideNavItem>
                    <SideNavItem divider />
                    <li>
                        <Link to="#homepanel">
                            <i className="material-icons prefix">gite</i>Homepanel
                        </Link>
                    </li>
                    <li>
                        <Link to="#homeshop">
                            <i className="material-icons prefix">shop</i>Homeshop
                        </Link>
                    </li>
                    <li>
                        <Link to="#homebank">
                            <i className="material-icons prefix">euro</i>Homebank
                        </Link>
                    </li>
                    <SideNavItem divider />
                    <SideNavItem subheader>
                        Miscellaneous
                    </SideNavItem>
                    <SideNavItem divider />
                    <li>
                        <Link to="/terminal">
                            <i className="material-icons prefix">terminal</i>Terminal
                        </Link>
                    </li>
                </SideNav>
                <h1>Homeserver</h1>
            </header>
        )
    }
}

export default Header;
