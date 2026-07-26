/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_MODE?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_CLOSET_WORKSPACE_ID?: string
  readonly VITE_APP_VERSION?: string
  readonly VITE_DATA_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
