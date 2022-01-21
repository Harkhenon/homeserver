import React, { useEffect } from 'react';

import { Route, Routes } from 'react-router';

import Header from '../../containers/Parts/Header';
import Footer from '../Parts/Footer';
import Home from '../../containers/Home';
import Settings from '../Settings';
import Error404 from '../Errors/Error404';
import Logout from "../AppRouter/Logout";
import { client } from '../../store';

const AppRouter = (props) => {
    
    const { username, email, setCredentials } = props;

    useEffect(() => {
        if(username === null && email === null) {
            client.get('/api/user/' + localStorage.getItem('userId'))
                .then(response => {
                    const { name: userUsername, email: userEmail } = response.data.data;
                    setCredentials(userUsername, userEmail);
                })
        }
    })

    return (
        <React.Fragment>
            <Header />
            <Routes>
                <Route exact path="/" element={<Home />} />
                <Route path="/system" element={<Settings />} />
                <Route path="/user/logout" element={<Logout />} />
                <Route path="/user" />
                <Route path="*" exact element={<Error404 />} />
            </Routes>
            <Footer />
        </React.Fragment>
    );
}

export default AppRouter;
