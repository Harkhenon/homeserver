import React, { Component } from 'react'
import { Link } from 'react-router-dom';

import "./scss/404.scss";

import Header from '../Parts/Header';
import Footer from '../Parts/Footer';

export class Error404 extends Component {
    render() {
        return (
            <React.Fragment>
                <Header />
                    <main>
                        <p>Erreur 404 - La page n'existe pas</p>
                        <Link to="/">Retour à l'accueil</Link>
                    </main>
                <Footer />
            </React.Fragment>
        )
    }
}

export default Error404
