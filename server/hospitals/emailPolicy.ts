/**
 * Personal / consumer email domains — never accepted as institutional hospital mail.
 * Day 3 verification will enforce whitelist ∩ ¬blacklist.
 */
export const PERSONAL_EMAIL_DOMAIN_BLACKLIST = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'protonmail.com',
  'proton.me',
  'aol.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
  'zoho.com',
] as const

export function emailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at < 1 || at === trimmed.length - 1) return null
  return trimmed.slice(at + 1)
}

export function isPersonalEmailDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase()
  return (PERSONAL_EMAIL_DOMAIN_BLACKLIST as readonly string[]).includes(d)
}

const BASIC_EMAIL =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

/**
 * Normalize + validate institutional contact email.
 * Rejects personal/consumer domains via configurable blacklist.
 */
export function normalizeInstitutionalEmail(raw: string): {
  email: string
  domain: string
} | { error: string } {
  const email = raw.trim().toLowerCase()
  if (!email || email.length > 320) {
    return { error: 'Institution contact email is required.' }
  }
  if (!BASIC_EMAIL.test(email)) {
    return { error: 'Enter a valid institution contact email.' }
  }
  const domain = emailDomain(email)
  if (!domain) {
    return { error: 'Enter a valid institution contact email.' }
  }
  if (isPersonalEmailDomain(domain)) {
    return {
      error:
        'Personal email domains (Gmail, Yahoo, Outlook, etc.) are not accepted. Use your hospital or clinic email.',
    }
  }
  return { email, domain }
}
