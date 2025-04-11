import '@sass/app.scss';
import '../css/app.css';
import './bootstrap';

import { createInertiaApp } from '@inertiajs/react';
import { createTheme, ThemeProvider } from '@mui/material';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { ToastContainer } from 'react-toastify';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

const customTheme = createTheme({
  palette: {
    primary: {
      light: '#757ce8',
      main: '#00aa00',
      dark: '#002884',
      contrastText: '#fff',
    },
    secondary: {
      light: '#ff7961',
      main: '#00ff00',
      dark: '#ba000d',
      contrastText: '#000',
    },
    mode: 'dark',
  },
  typography: {
    fontFamily: `"Genos", "Verdana", "Arial", sans-serif`,
    fontSize: 18,
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
  },
  components: {
    MuiLink: {
      color: '#00bb00',
      underline: 'none',
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: 20,
        },
      },
    },
  },
});

createInertiaApp({
  title: (title) => `${title} - ${appName}`,
  resolve: (name) =>
    resolvePageComponent(
      `./Pages/${name}.jsx`,
      import.meta.glob('./Pages/**/*.jsx'),
    ),
  setup({ el, App, props }) {
    const root = createRoot(el);

    root.render(
      <ThemeProvider theme={customTheme}>
        <ToastContainer />
        <App {...props} />
      </ThemeProvider>,
    );
  },
  progress: {
    color: '#4B5563',
  },
});
