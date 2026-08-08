/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_MODE?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_CLOSET_WORKSPACE_ID?: string
  readonly VITE_DATA_VERSION?: string
  readonly VITE_P5A_CONTEXT_RANKING?: string
  readonly VITE_P5A_TRANSPORT_POLICY_B?: string
  readonly VITE_P5A_DIRECT_EVIDENCE_E2?: string
  readonly VITE_P5A_RECENT_PURCHASE_W2?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
