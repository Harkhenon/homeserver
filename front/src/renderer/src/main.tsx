import React from 'react';
import ReactDOM from 'react-dom/client';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './assets/base.scss';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('#root introuvable');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
