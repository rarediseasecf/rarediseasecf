import { AppError } from '../errors.js'
import { HospitalRepository } from './hospitalRepository.js'
import { validateHospitalWhitelistInput } from './hospitalWhitelistValidation.js'

export interface HospitalAdminView {
  id: string
  displayName: string
  emailDomain: string
  contactEmail: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

function toView(
  row: Awaited<ReturnType<HospitalRepository['listHospitals']>>[number]
): HospitalAdminView {
  return {
    id: row.id,
    displayName: row.displayName,
    emailDomain: row.emailDomain,
    contactEmail: row.contactEmail,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export class HospitalAdminService {
  constructor(private readonly hospitals: HospitalRepository) {}

  async list(includeInactive = false): Promise<HospitalAdminView[]> {
    const rows = await this.hospitals.listHospitals(includeInactive)
    return rows.map(toView)
  }

  async add(input: {
    displayName?: string
    emailDomain?: string
    contactEmail?: string
  }): Promise<HospitalAdminView> {
    const { displayName, domain, contactEmail } =
      validateHospitalWhitelistInput(input)

    const now = new Date()
    const existing = await this.hospitals.findByDomainAny(domain)
    if (existing) {
      if (existing.isActive) {
        throw new AppError(
          'HOSPITAL_EXISTS',
          'That domain is already on the whitelist.',
          409
        )
      }
      const reactivated = await this.hospitals.reactivateHospital(existing.id, {
        displayName,
        contactEmail,
        now,
      })
      if (!reactivated) {
        throw new AppError('INTERNAL_ERROR', 'Could not reactivate hospital.', 500)
      }
      return toView(reactivated)
    }

    const row = await this.hospitals.insertHospital({
      displayName,
      emailDomain: domain,
      contactEmail,
      now,
    })
    return toView(row)
  }

  async remove(id: string): Promise<void> {
    if (!id?.trim()) {
      throw new AppError('INVALID_HOSPITAL', 'Hospital id is required.', 400)
    }
    const now = new Date()
    const row = await this.hospitals.deactivateHospital(id.trim(), now)
    if (!row) {
      throw new AppError('HOSPITAL_NOT_FOUND', 'Hospital not found.', 404)
    }
  }
}
