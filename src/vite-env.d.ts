/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_DURATION_SECONDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
