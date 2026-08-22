/// <reference types="vite/client" />

import type { EstoqueApi } from '../shared/api-contract'

declare global {
  interface Window {
    estoque: EstoqueApi
  }
}

export {}
