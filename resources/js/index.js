import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import { Provider } from 'react-redux';
import store from './store';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';

import App from "./containers/App";

import 'semantic-ui-css/semantic.min.css'

const Entry = () => (
    <Router>
        <Provider store={store}>
            <App />
            <ToastContainer 
                pauseOnFocusLoss={false}
                limit={2}
                autoClose={3000}
            />
        </Provider>
    </Router>
);

ReactDOM.createRoot(document.getElementById('root')).render(<Entry />);