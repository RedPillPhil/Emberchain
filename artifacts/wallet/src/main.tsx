import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';
import { registerServiceWorker } from './lib/bridge-notifications';

registerServiceWorker();

createRoot(document.getElementById('root')!).render(<App />);
