/**
 * Mobile wallet helpers.
 *
 * Mobile browsers (Safari, Chrome) cannot host wallet extensions, so the
 * reliable way to donate from a phone is to open the current page inside the
 * wallet app's built-in browser, where the wallet is injected like an
 * extension. Phantom and Solflare both expose a universal "browse" link for
 * exactly this; the same link is encoded in the desktop QR code.
 */

export type DeepLinkWallet = 'Phantom' | 'Solflare'

export const DEEP_LINK_WALLETS: DeepLinkWallet[] = ['Phantom', 'Solflare']

export function isDeepLinkWallet(name: string): name is DeepLinkWallet {
  return (DEEP_LINK_WALLETS as string[]).includes(name)
}

export function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/android|iphone|ipad|ipod/i.test(ua)) return true
  // iPadOS 13+ reports itself as desktop Safari.
  return /macintosh/i.test(ua) && navigator.maxTouchPoints > 1
}

interface InjectedWindow {
  phantom?: { solana?: { isPhantom?: boolean } }
  solflare?: { isSolflare?: boolean }
  solana?: unknown
}

/** True inside a wallet app's in-app browser (or any page with an injected wallet). */
export function hasInjectedWallet(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as InjectedWindow
  return Boolean(w.phantom?.solana?.isPhantom || w.solflare?.isSolflare || w.solana)
}

export function walletBrowseLink(wallet: DeepLinkWallet, url = window.location.href): string {
  const target = encodeURIComponent(url)
  const ref = encodeURIComponent(new URL(url).origin)
  return wallet === 'Phantom'
    ? `https://phantom.app/ul/browse/${target}?ref=${ref}`
    : `https://solflare.com/ul/v1/browse/${target}?ref=${ref}`
}
