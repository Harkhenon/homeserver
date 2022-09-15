import React, { useEffect } from 'react';

import { Route, Routes } from 'react-router';

import Header from '@containers/Parts/Header';
import Footer from '@src/Parts/Footer';
import Home from '@containers/Home';
import Settings from '@containers/Settings';
import Error404 from '@src/Errors/Error404';
import Logout from "@src/AppRouter/Logout";
import Console from '@src/Console';
import Hosting from '@components/Hosting';
import Domains from '@containers/Components/Domains';
import AddDomainForm from '@containers/Components/Domains/Forms/AddDomainForm';
import EditDomainForm from '@containers/Components/Domains/Forms/EditDomainForm';
import client from '@js/axiosConfig';
import { Container, Segment, Sidebar } from 'semantic-ui-react';

const AppRouter = (props) => {
    
    const { username, email, setCredentials } = props;

    useEffect(() => {
        if(username === null && email === null) {
            client.get('/api/user/' + localStorage.getItem('userId'))
                .then(response => {
                    const { name: userUsername, email: userEmail } = response.data.data;
                    setCredentials(userUsername, userEmail);
                })
                .catch(error => {
                    console.info('User Token is expired, deleting it...');
                    localStorage.removeItem('userToken');
                    localStorage.removeItem('userId');
                    window.location.reload();
                })
        }
    })

    return (
        <React.Fragment>
        <Sidebar.Pushable>
            <Header />
                <Sidebar.Pusher>
                    <Container>
                        <Routes>
                            <Route exact path="/" element={<Home />} />
                            <Route path='/domains/add' element={<AddDomainForm />} />
                            <Route path='/domains/edit' element={<EditDomainForm />} />
                            <Route path='/domains' element={<Domains />} />
                            <Route path='/hosting' element={<Hosting />} />
                            <Route path="/terminal" element={<Console />} />
                            <Route path="/system" element={<Settings />} />
                            <Route path="/user/logout" element={<Logout />} />
                            <Route path="*" exact element={<Error404 />} />
                        </Routes>
                    </Container>
                    <Footer />
                </Sidebar.Pusher>
            </Sidebar.Pushable>
        </React.Fragment>
    );
}

export default AppRouter;
