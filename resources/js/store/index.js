// == Import : npm
import { createStore, compose, applyMiddleware } from 'redux';
import axios from 'axios';

// == Import : local
import reducer from './reducer';

// Ajout de l'extension devtools
const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

// all axios can be used, shown in axios documentation
export const client = axios.create({
  baseURL: process.env.MIX_APP_URL,
  responseType: 'json',
  headers: {
    'Content-Type': 'application/ld+json; charset=utf-8',
    'Authorization': 'Bearer ' + localStorage.getItem('userToken'),
  },
});

const enhancers = composeEnhancers(
  applyMiddleware(
  ),
);

const store = createStore(
  reducer,
  enhancers,
);

// == Export
export default store;