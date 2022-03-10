import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter as Router } from 'react-router-dom';
import { Provider } from 'react-redux';
import store from './store';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';

import App from "./containers/App";

const Entry = () => (
    <Provider store={store}>
        <Router>
            <App />
            <ToastContainer 
                pauseOnFocusLoss={false}
                limit={2}
                autoClose={3000}
            />
        </Router>
    </Provider>
);

ReactDOM.render(<Entry />, document.getElementById('root'));