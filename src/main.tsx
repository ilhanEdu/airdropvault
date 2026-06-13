import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './quest.css';
import { StoreProvider } from './state/store';
import { UiProvider } from './state/ui';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <UiProvider>
        <App />
      </UiProvider>
    </StoreProvider>
  </StrictMode>,
);
