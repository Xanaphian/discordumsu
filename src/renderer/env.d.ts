/// <reference types="vite/client" />
import type { KovanApi } from '../preload/preload';
declare global {
  interface Window {
    kovan: KovanApi;
  }
}
export {};
