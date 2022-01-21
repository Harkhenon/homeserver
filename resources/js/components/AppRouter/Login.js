import axios from 'axios';
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import { client } from '../../store'
import Footer from '../Parts/Footer';
import './scss/AppRouter.scss'

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
                <div className="row">
                    <div className='col s12 m12 l8 xl8 push-l2 push-xl2 login-form'>
                        <h1>Sign-in</h1>
                        <h2>Please enter your email and password</h2>
                        <h5>
                            Forgotten your password ?
                        </h5>
                        <Link to='/user/lost-password'>
                            Retrieve lost password
                        </Link>
                        <form onSubmit={handleSubmit}>
                            <div className='input-field'>
                                <input
                                    type='email'
                                    name='email'
                                    id='login-email'
                                    className='validate'
                                />
                                <label htmlFor='login-email'>E-Mail</label>
                                <span
                                    className="helper-text white-text"
                                    data-error="Enter a valid email address"
                                    data-success="E-Mail is valid"
                                >
                                </span>
                            </div>
                            <div className='input-field'>
                                <input
                                    type='password'
                                    name='password'
                                    id='login-password'
                                    className='validate'
                                />
                                <label htmlFor='login-password'>Password</label>
                            </div>
                            <div className='input-field'>
                                <button className='btn'>Sign In</button>
                            </div>
                        </form>
                    </div>
                </div>
            </main>
            <Footer />
        </React.Fragment>
    )
}

export default Login;
