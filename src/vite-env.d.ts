/// <reference types="vite/client" />

// Allow importing CSS files as side-effects
declare module '*.css' {
  const content: Record<string, string>
  export default content
}

// Typed Vite environment variables
interface ImportMetaEnv {
  readonly VITE_SOLANA_RPC_URL: string
  readonly VITE_SOLANA_NETWORK: string
  readonly VITE_PRIVACY_CONTACT_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
