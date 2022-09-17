// == Import : npm
import { createStore, compose, applyMiddleware } from 'redux';
import getDomainsMiddleware from './middlewares/getDomainsMiddleware';


// == Import : local
import reducer from './reducer';

// Ajout de l'extension devtools
const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

const enhancers = composeEnhancers(
  applyMiddleware(
    getDomainsMiddleware,
  ),
);

const store = createStore(
  reducer,
  enhancers,
);

// == Export
export default store;