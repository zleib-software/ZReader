import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { initMobileBridge } from './services/mobile/bridge';

// Inicializar ponte de serviços móveis / offline
initMobileBridge();

// Restaurar escala de interface no boot (apenas desktop/Electron)
try {
  const isMobile =
    typeof navigator !== 'undefined' &&
    /android|iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isMobile) {
    document.documentElement.style.removeProperty('zoom');
  } else {
    const savedScale = localStorage.getItem('zreader_gui_scale');
    if (savedScale) {
      const factor = parseFloat(savedScale);
      if (!isNaN(factor) && factor >= 0.75 && factor <= 2.0) {
        window.electronAPI?.setZoomFactor?.(factor);
        window.dispatchEvent(new CustomEvent('zreader-zoom-change', { detail: factor }));
      }
    }
  }
} catch (e) {
  console.warn('Erro ao restaurar escala:', e);
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
