/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origem da API em produção. Em dev fica indefinido e o cliente usa `/api` (proxy do Vite). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
