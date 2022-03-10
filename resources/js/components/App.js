import React from 'react';

import AppRouter from '../containers/AppRouter/AppRouter';
import Login from '../containers/AppRouter/Login';

const App = (props) => {

    const { loading, toggleLoading } = props;
    return localStorage.getItem('userToken') !== null
            ? <AppRouter />
            : <Login
                loading={loading}
                toggleLoading={toggleLoading}
            />;
}

export default App;
