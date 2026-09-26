/**
 * Site header with working mobile drawer navigation.
 */
import { useState, useRef, useEffect } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import WalletSelectionDialog from './WalletSelectionDialog'
import { useWalletSession } from '../providers/WalletSessionProvider'
import { truncateAddress } from '../lib/truncateAddress'
import { NETWORK_NAME } from '../lib/network'
import {
  faChevronDown,
  faChevronUp,
  faCircle,
} from '@fortawesome/free-solid-svg-icons'
import FaIcon from './FaIcon'

export default function SiteHeader() {
  const { connected, publicKey } = useWallet()
  const { confirmed, disconnectAccount } = useWalletSession()
  const location = useLocation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverBtnRef = useRef<HTMLButtonElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setMenuOpen(false)
    setPopoverOpen(false)
  }, [location.pathname, location.hash])

  useEffect(() => {
    if (!menuOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        menuBtnRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('nav-drawer-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('nav-drawer-open')
    }
  }, [menuOpen])

  useEffect(() => {
    if (!popoverOpen) return
    function handler(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [popoverOpen])

  useEffect(() => {
    if (!popoverOpen) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPopoverOpen(false)
        popoverBtnRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [popoverOpen])

  async function handleDisconnect() {
    await disconnectAccount()
    setPopoverOpen(false)
    setMenuOpen(false)
  }

  const truncated = publicKey ? truncateAddress(publicKey.toBase58()) : ''
  const accountLabel = confirmed ? 'Account confirmed' : 'Account connected'
  const popoverTitle = confirmed
    ? 'Donation account confirmed'
    : 'Donation account connected'

  function navClass({ isActive }: { isActive: boolean }) {
    return `nav-link${isActive ? ' active' : ''}`
  }

  return (
    <header className={`site-header${menuOpen ? ' site-header--menu-open' : ''}`}>
      <div className="container site-header__inner">
        <button
          ref={menuBtnRef}
          className="site-header__menu-btn"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          type="button"
          onClick={() => setMenuOpen(o => !o)}
        >
          <span className="hamburger-line" />
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>

        <Link to="/" className="site-header__logo" aria-label="RareDiseaseCF home">
          <img
            src="/logo.png"
            alt=""
            className="logo-mark logo-mark--img"
            width={40}
            height={40}
            decoding="async"
          />
          <span className="logo-text">RareDiseaseCF</span>
        </Link>

        <nav className="site-header__nav site-header__nav--desktop" aria-label="Main navigation">
          <NavLink to="/campaigns" className={navClass}>
            Explore campaigns
          </NavLink>
          <NavLink to="/transparency" className={navClass}>
            Transparency
          </NavLink>
          <NavLink to="/submit" className={navClass}>
            Submit a case
          </NavLink>
        </nav>

        <div className="site-header__controls site-header__controls--desktop">
          {!connected ? (
            <button
              className="btn btn--ghost btn--sm header-donate-btn"
              onClick={() => setDialogOpen(true)}
              type="button"
              aria-label="Continue to donate — choose a wallet"
            >
              Donate
            </button>
          ) : (
            <div className="header-account" ref={popoverRef}>
              <button
                ref={popoverBtnRef}
                className={`header-account__trigger${
                  confirmed ? ' header-account__trigger--confirmed' : ''
                }`}
                onClick={() => setPopoverOpen(o => !o)}
                type="button"
                aria-haspopup="true"
                aria-expanded={popoverOpen}
                aria-label={`${accountLabel}: ${truncated}. Click to manage.`}
              >
                <span className="header-account__dot" aria-hidden="true">
                  <FaIcon icon={faCircle} size="xs" />
                </span>
                <span className="header-account__label">{accountLabel}</span>
                <span className="header-account__chevron" aria-hidden="true">
                  <FaIcon icon={popoverOpen ? faChevronUp : faChevronDown} size="xs" />
                </span>
              </button>

              {popoverOpen && (
                <div
                  className="header-account__popover"
                  role="dialog"
                  aria-label="Donation account menu"
                >
                  <p className="header-account__popover-title">{popoverTitle}</p>
                  <p className="header-account__popover-address">
                    <code>{truncated}</code>
                  </p>
                  <p className="header-account__popover-note">
                    Connected on {NETWORK_NAME}. Funds only move when you
                    approve a donation in your wallet.
                  </p>
                  <div className="header-account__popover-actions">
                    {!confirmed && (
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          setPopoverOpen(false)
                          setDialogOpen(true)
                        }}
                        type="button"
                      >
                        Choose another wallet
                      </button>
                    )}
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => {
                        void handleDisconnect()
                      }}
                      type="button"
                    >
                      Disconnect account
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <Link to="/submit" className="btn btn--primary btn--sm header-submit-btn">
            Submit a case
          </Link>
        </div>
      </div>

      {menuOpen && (
        <button
          type="button"
          className="site-header__backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div
        id="mobile-nav"
        className={`site-header__drawer${menuOpen ? ' is-open' : ''}`}
        hidden={!menuOpen}
      >
        <nav className="site-header__drawer-nav" aria-label="Mobile navigation">
          <NavLink to="/" className={navClass} end onClick={() => setMenuOpen(false)}>
            Home
          </NavLink>
          <a
            href="/#how-it-works"
            className="nav-link"
            onClick={() => setMenuOpen(false)}
          >
            How it works
          </a>
          <NavLink to="/campaigns" className={navClass} onClick={() => setMenuOpen(false)}>
            Explore campaigns
          </NavLink>
          <NavLink to="/transparency" className={navClass} onClick={() => setMenuOpen(false)}>
            Transparency
          </NavLink>
          <NavLink to="/submit" className={navClass} onClick={() => setMenuOpen(false)}>
            Submit a case
          </NavLink>
        </nav>

        <div className="site-header__drawer-actions">
          {!connected ? (
            <button
              className="btn btn--ghost"
              onClick={() => {
                setMenuOpen(false)
                setDialogOpen(true)
              }}
              type="button"
            >
              Donate with wallet
            </button>
          ) : (
            <div className="site-header__drawer-account">
              <p>
                {accountLabel}: <code>{truncated}</code>
              </p>
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={() => {
                  void handleDisconnect()
                }}
              >
                Disconnect
              </button>
            </div>
          )}
          <Link
            to="/submit"
            className="btn btn--primary"
            onClick={() => setMenuOpen(false)}
          >
            Submit a case
          </Link>
        </div>
      </div>

      <WalletSelectionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </header>
  )
}
