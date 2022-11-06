import React, { Component } from 'react'
import { Link } from 'react-router-dom';

import "./scss/404.scss";

export class Error404 extends Component {
    render() {
        return (
            <main>
                <p>Erreur 404 - La page n'existe pas</p>
                <Link to="/">Retour à l'accueil</Link>
            </main>
        )
    }
}

export default Error404
