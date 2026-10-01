import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import PublicCampaignPage from './views/PublicCampaignPage.jsx';
import BrandPortal from './views/BrandPortal.jsx';
import './index.css';

// /campaign/<slug> is the public brand page: no login, no admin shell.
const publicSlug = (window.location.pathname.match(/^\/campaign\/([^/]+)\/?$/) || [])[1];
// /brand is the brand web portal (its own login): campaigns, riders, photos and routes in any browser.
const brandPortal = /^\/brand(\/|$)/.test(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {brandPortal ? <BrandPortal /> : publicSlug ? <PublicCampaignPage slug={decodeURIComponent(publicSlug)} /> : <App />}
  </React.StrictMode>
);
