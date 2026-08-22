/// <reference types="vite/client" />

declare module '*.wasm?url' {
  const src: string;
  export default src;
}

import type { InventoryApi } from '../shared/types';

declare global {
  interface Window {
    inventoryApi: InventoryApi;
  }
}

export {};
