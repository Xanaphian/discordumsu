/// <reference types="vite/client" />
import type { KovanApi } from '../preload/preload';
declare global {
  const __BUILD_DATE__: string;
  interface Window {
    kovan: KovanApi;
  }
}
export {};
