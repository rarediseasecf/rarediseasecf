/**
 * Seed the hospital whitelist: env-configured institutions everywhere, plus
 * the fictional demo institution on Devnet only.
 */
import { and, eq, inArray } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { hospitalWhitelist } from '../db/schema.js'
import { isPersonalEmailDomain } from './emailPolicy.js'
import { DEMO_HOSPITAL, RETIRED_DEMO_DOMAINS } from './demoHospital.js'

export interface HospitalBootstrapRecord {
  displayName: string
  emailDomain: string
  contactEmail: string
}

/**
 * Fictional institutions, seeded on Devnet only. Their domains are not ours, so
 * on a real-money network whoever registers one could verify their own case.
 */
export const DEFAULT_DEMO_HOSPITALS: HospitalBootstrapRecord[] = [DEMO_HOSPITAL]

export function parseHospitalBootstrapRecords(
  raw: string | undefined
): HospitalBootstrapRecord[] {
  if (!raw || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: HospitalBootstrapRecord[] = []
    for (const item of parsed) {
      if (
        typeof item !== 'object' ||
        item === null ||
        typeof (item as { displayName?: unknown }).displayName !== 'string' ||
        typeof (item as { emailDomain?: unknown }).emailDomain !== 'string' ||
        typeof (item as { contactEmail?: unknown }).contactEmail !== 'string'
      ) {
        continue
      }
      const displayName = (item as HospitalBootstrapRecord).displayName.trim()
      const emailDomain = (item as HospitalBootstrapRecord).emailDomain
        .trim()
        .toLowerCase()
      const contactEmail = (item as HospitalBootstrapRecord).contactEmail
        .trim()
        .toLowerCase()
      if (
        !displayName ||
        !emailDomain ||
        !contactEmail.includes('@') ||
        isPersonalEmailDomain(emailDomain)
      ) {
        console.warn(
          JSON.stringify({
            event: 'hospital_bootstrap_skipped',
            emailDomain,
            reason: 'invalid_or_personal_domain',
          })
        )
        continue
      }
      out.push({ displayName, emailDomain, contactEmail })
    }
    return out
  } catch {
    return []
  }
}

export async function bootstrapHospitals(
  db: Database['db'],
  extra: HospitalBootstrapRecord[] = [],
  options: { includeDemoHospitals: boolean } = { includeDemoHospitals: false }
): Promise<number> {
  const now = new Date()
  const demo = DEFAULT_DEMO_HOSPITALS
  const records = options.includeDemoHospitals ? [...demo, ...extra] : extra
  let count = 0

  const deactivate = options.includeDemoHospitals
    ? RETIRED_DEMO_DOMAINS
    : [...RETIRED_DEMO_DOMAINS, ...demo.map(h => h.emailDomain)]
  await db
    .update(hospitalWhitelist)
    .set({ isActive: false, updatedAt: now, deactivatedAt: now })
    .where(
      and(
        inArray(hospitalWhitelist.emailDomain, deactivate),
        eq(hospitalWhitelist.isActive, true)
      )
    )

  for (const hospital of records) {
    if (isPersonalEmailDomain(hospital.emailDomain)) continue

    const existing = await db
      .select()
      .from(hospitalWhitelist)
      .where(eq(hospitalWhitelist.emailDomain, hospital.emailDomain))
      .limit(1)

    if (existing[0]) {
      await db
        .update(hospitalWhitelist)
        .set({
          displayName: hospital.displayName,
          contactEmail: hospital.contactEmail,
          isActive: true,
          updatedAt: now,
          deactivatedAt: null,
        })
        .where(eq(hospitalWhitelist.id, existing[0].id))
    } else {
      await db.insert(hospitalWhitelist).values({
        displayName: hospital.displayName,
        emailDomain: hospital.emailDomain,
        contactEmail: hospital.contactEmail,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        deactivatedAt: null,
      })
    }
    count += 1
    console.info(
      JSON.stringify({
        event: 'hospital_bootstrap_upsert',
        displayName: hospital.displayName,
        emailDomain: hospital.emailDomain,
      })
    )
  }

  return count
}
