/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_BASE_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GRAPHQL_URL?: string;
  readonly VITE_ENABLE_SUPERADMIN_PREVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
