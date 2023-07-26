import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';

import App from "./components/App";

import 'semantic-ui-css/semantic.min.css';
import '../sass/app.scss';

const Entry = () => (
    <Router>
      <App />
      <ToastContainer 
          pauseOnFocusLoss={false}
          limit={2}
          autoClose={3000}
      />
    </Router>
);

export default Entry;
