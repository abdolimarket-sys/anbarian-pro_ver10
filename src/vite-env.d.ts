/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LICENSE_PUBLIC_KEY?: string;
  readonly VITE_LICENSE_HMAC_SECRET?: string;
  readonly VITE_LICENSE_API_BASE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
