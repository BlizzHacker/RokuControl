import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const isWidget = window.location.hash === '#/widget';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App widget={isWidget} />
  </React.StrictMode>
);
