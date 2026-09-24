import type { api } from '../../electron/preload';

declare global {
  interface Window {
    electronAPI: typeof api;
  }
}

export {};
