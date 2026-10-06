import { Link } from 'react-router-dom'
import { IS_MAINNET, NETWORK_NAME } from '../lib/network'
import { DEMO_DISCLAIMER } from './DemoDisclaimer'

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <img
            src="/logo.png"
            alt=""
            className="logo-mark logo-mark--img"
            width={36}
            height={36}
            decoding="async"
          />
          <span className="logo-text">RareDiseaseCF</span>
        </div>

        <p className="site-footer__tagline">
          Verified healthcare funding with on-chain USDC escrow · {NETWORK_NAME}
        </p>
        {!IS_MAINNET && (
          <p className="site-footer__disclaimer">{DEMO_DISCLAIMER}</p>
        )}

        <nav className="site-footer__links" aria-label="Footer navigation">
          <Link to="/privacy" className="footer-link">Privacy</Link>
          <Link to="/#how-it-works" className="footer-link">How it works</Link>
          <Link to="/contact" className="footer-link">Contact</Link>
          <span className="footer-link-group">
            <span className="footer-link-group__label">Source code</span>
            <a
              href="https://github.com/"
              className="footer-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub (coming soon)
            </a>
          </span>
        </nav>
      </div>
    </footer>
  )
}
