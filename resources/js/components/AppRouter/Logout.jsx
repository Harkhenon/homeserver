import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom';

const Logout = () => {

    const navigate = useNavigate();

    useEffect(() => {
        if(
            localStorage.getItem('userToken') !== null
            && localStorage.getItem('userId') !== null
        ) {
            localStorage.removeItem('userToken');
            localStorage.removeItem('userId');
            navigate('/');
            window.location.reload();
        }
    })

    return (
        <main>
            Déconnexion en cours...
        </main>
    )
}

export default Logout;
