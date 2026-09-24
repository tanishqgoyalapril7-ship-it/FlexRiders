import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import PublicCampaignPage from './views/PublicCampaignPage.jsx';
import './index.css';

// /campaign/<slug> is the public brand page: no login, no admin shell.
const publicSlug = (window.location.pathname.match(/^\/campaign\/([^/]+)\/?$/) || [])[1];

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>{publicSlug ? <PublicCampaignPage slug={decodeURIComponent(publicSlug)} /> : <App />}</React.StrictMode>
);
