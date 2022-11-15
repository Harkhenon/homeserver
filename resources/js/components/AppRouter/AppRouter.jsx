import React, { useEffect } from 'react';
import { Route, Routes } from 'react-router';
import { Container, Segment, Sidebar } from 'semantic-ui-react';
import { Navigate } from 'react-router-dom';
import jwt_decode from 'jwt-decode';

// Containers
import Header from '@containers/Parts/Header';
import Home from '@containers/Home';
import Settings from '@containers/Settings';
import Hosting from '@containers/Components/Hosting';
import General from '@containers/Components/Hosting/Pages/General';
import Domains from '@containers/Components/Domains';
import AddDomainForm from '@containers/Components/Domains/Forms/AddDomainForm';
import EditDomainForm from '@containers/Components/Domains/Forms/EditDomainForm';

// "Simple" Modules
import Footer from '@src/Parts/Footer';
import Error404 from '@src/Errors/Error404';
import Logout from "@src/AppRouter/Logout";
import Console from '@src/Console';
import client from '@js/axiosConfig';

import '@sass/AppRouter.scss';

const AppRouter = (props) => {
    
    const { username, email, setCredentials, getDomains, domains } = props;
    const userToken = localStorage.getItem('userToken');
    
    if(userToken === null) {
        Navigate('/login');
        return undefined;
    }

    const JWTissuedAt = jwt_decode(userToken).iat * 1000; // <= Convert into int value
    const JWTexpiresAt = JWTissuedAt + 86400000;

    if(JWTexpiresAt < Date.now()) {
        console.info('JWT token expired! Redirecting...');
        localStorage.removeItem('userId');
        localStorage.removeItem('userToken');
        Navigate('/login');
        return undefined;
    } else {
        console.info('JWT token OK, expires on : ' +  new Date(JWTexpiresAt));
    }

    useEffect(() => {
        if(username === null && email === null) {
            client.get('/api/user/' + localStorage.getItem('userId'))
                .then(response => {
                    const { name: userUsername, email: userEmail } = response.data.data;
                    setCredentials(userUsername, userEmail);
                })
                .catch()
        }

        if(domains === null) {
            getDomains();
        }
    })

    return (
        <React.Fragment>
            <Header />
            <Container>
                <Routes>
                    <Route exact path="/" element={<Home />} />
                    <Route path='/domains/add' element={<AddDomainForm />} />
                    <Route path='/domains/edit' element={<EditDomainForm />} />
                    <Route path='/domains' element={<Domains />} />
                    <Route path='/hosting/general' element={<General />} />
                    <Route path='/hosting' element={<Hosting />} />
                    <Route path="/terminal" element={<Console />} />
                    <Route path="/system" element={<Settings />} />
                    <Route path="/user/logout" element={<Logout />} />
                    <Route path="*" exact element={<Error404 />} />
                </Routes>
            </Container>
            <Footer />
        </React.Fragment>
    );
}

export default AppRouter;
