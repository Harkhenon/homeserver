import React, { useEffect } from 'react'
import { Navigate } from 'react-router-dom';

const Logout = () => {

    useEffect(() => {
        if(
            localStorage.getItem('userToken') !== null
            && localStorage.getItem('userId') !== null
        ) {
            localStorage.removeItem('userToken');
            localStorage.removeItem('userId');
            Navigate('/');
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
