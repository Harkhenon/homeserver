import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Button, Container, Form, Header } from 'semantic-ui-react';

import Footer from '../Parts/Footer';
import './scss/AppRouter.scss'
import client from '../../axiosConfig';

const Login = (props) => {

    let navigate = useNavigate();
    const { loading, toggleLoading, setCredentials } = props;
    const handleSubmit = (e) => {
        console.log(props)
        e.preventDefault();
        const target = e.target;
        const email = target.email.value;
        const password= target.password.value;

        client.post('/api/login', {
            email,
            password
        })
            .then(response => {
                const { token, id } = response.data.data;
                localStorage.setItem('userToken', token);
                localStorage.setItem('userId', id);
                navigate('/');
                toast.success('Sign-in OK');
                setCredentials('harkhenon', email);
                window.location.reload();
            })
            .catch(error => {
                console.log(error);
            });
    }

    return (
        <React.Fragment>
            <main>
                <div className='login-form'>
                    <Container textAlign='center'>
                        <Header as='h1'>Sign-in</Header>
                        <h2>Please enter your email and password</h2>
                        <h5>
                            Forgotten your password ?
                        </h5>
                        <Link to='/user/lost-password'>
                            Retrieve lost password
                        </Link>
                    
                        <Form onSubmit={handleSubmit} inverted>
                            <Form.Field>
                                <label>E-Mail</label>
                                <input
                                    type='email'
                                    name='email'
                                />
                            </Form.Field>
                            <Form.Field>
                                <label>Password</label>
                                <input
                                    type='password'
                                    name='password'
                                />
                            </Form.Field>
                            <div className='input-field'>
                                <Button>Sign In</Button>
                            </div>
                        </Form>
                    </Container>
                </div>
            </main>
            <Footer />
        </React.Fragment>
    )
}

export default Login;
