// Verify if there are some errors
import React, { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router';
import { Container, Sidebar, Segment } from 'semantic-ui-react';
import PropTypes from 'prop-types';
import useJWTTool from '@js/hooks/useJWTTool';
import { toast } from 'react-toastify';

// Containers
import Header from '@components/Parts/Header';
import Home from '@components/Home';
import Settings from '@components/Settings';
import Hosting from '@components/Components/Hosting';
import NewHost from '@components/Components/Hosting/Pages/NewHost';
import Login from '@components/AppRouter/Login';

// "Simple" Modules
import Footer from '@src/Parts/Footer';
import Error404 from '@src/Errors/Error404';
import Logout from "@src/AppRouter/Logout";
import Console from '@src/Console';
import client from '@js/axiosConfig';

import '@sass/AppRouter.scss';

const AppRouter = () => {

  const [ credentials, setCredentials ] = useState(0)
  const [ isLogged, setIsLogged ] = useState(false)

  const userToken = localStorage.getItem('userToken');
  const JWTTool = useJWTTool(userToken);
  let tokenIsOk = true;

  if (userToken === null) {
    tokenIsOk = false;
  }

  if (tokenIsOk === true && JWTTool.isValid() === false) {
    toast.warning('Token malformed, try to re-connect');
    tokenIsOk = false;
  }

  if (tokenIsOk === true && JWTTool.isExpired()) {
    toast.warning('Your session is expired, please reconnect');
    tokenIsOk = false;
  }

  useEffect(() => {
    if (
      tokenIsOk === true 
      && !credentials.username
      && !credentials.email
    ) {
      client.get(`/api/user/${JWTTool.getSubject()}`)
        .then(response => {
          const { name, email } = response.data.data;
          setCredentials({
            username: name,
            email
          });
          setIsLogged(true)
        })
        .catch(error => {
          setIsLogged(false)
        });
    }
  });

  if (isLogged && !localStorage.getItem('domains')) {
    client.get('/api/domains')
          .then(response => {
            localStorage.setItem('domains', JSON.stringify(response.data.data))
          })
          .catch(error => {
            toast.error('Domains Problem')
          })
  }

  if (isLogged && credentials) {
    return (
      <Sidebar.Pushable as={Segment} basic>
        <Header credentials={credentials} />
          <Sidebar.Pusher as={Container}>
            <Routes>
                <Route exact path="/" element={<Home />} />
                <Route path='/hosting/new' element={<NewHost />} />
                <Route path='/hosting' element={<Hosting />} />
                <Route path="/terminal" element={<Console />} />
                <Route path="/system" element={<Settings />} />
                <Route path="/user/logout" element={<Logout />} />
                <Route path="*" exact element={<Error404 />} />
              </Routes>
          </Sidebar.Pusher>
          <Footer />
        </Sidebar.Pushable>
    );
  }

  return <Login credentials={credentials} setCredentials={setCredentials} />;
}

AppRouter.defaultProps = {
  setCredentials: null,
  credentials: null,
};

AppRouter.propTypes = {
  credentials: PropTypes.array,
  setCredentials: PropTypes.func,
};

export default AppRouter;
