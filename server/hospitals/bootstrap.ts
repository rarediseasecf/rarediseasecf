/**
 * Day 1 — seed fictional hospital whitelist (institutional domains only).
 */
import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { hospitalWhitelist } from '../db/schema.js'
import { isPersonalEmailDomain } from './emailPolicy.js'
import { TEST_HOSPITAL } from './testHospital.js'

export interface HospitalBootstrapRecord {
  displayName: string
  emailDomain: string
  contactEmail: string
}

/** Always seeded so Demo Mode has institutions without env config. */
export const DEFAULT_DEMO_HOSPITALS: HospitalBootstrapRecord[] = [
  {
    displayName: 'DemoCare Specialty Hospital',
    emailDomain: 'democare.hospital',
    contactEmail: 'verify@democare.hospital',
  },
  {
    displayName: 'Northlake Rare Disease Clinic',
    emailDomain: 'northlake-rdc.org',
    contactEmail: 'pharmacy@northlake-rdc.org',
  },
  {
    displayName: 'Summit Pediatric Specialty Center',
    emailDomain: 'summitpsc.edu',
    contactEmail: 'settlements@summitpsc.edu',
  },
]

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
  options: { includeTestHospital: boolean } = { includeTestHospital: false }
): Promise<number> {
  const now = new Date()
  const records = [
    ...DEFAULT_DEMO_HOSPITALS,
    ...extra,
    ...(options.includeTestHospital ? [TEST_HOSPITAL] : []),
  ]
  let count = 0

  if (!options.includeTestHospital) {
    await db
      .update(hospitalWhitelist)
      .set({ isActive: false, updatedAt: now, deactivatedAt: now })
      .where(
        and(
          eq(hospitalWhitelist.emailDomain, TEST_HOSPITAL.emailDomain),
          eq(hospitalWhitelist.isActive, true)
        )
      )
  }

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
