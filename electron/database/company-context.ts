import { DEFAULT_COMPANY_ID } from '../../shared/types'

let currentCompanyId: string = DEFAULT_COMPANY_ID

export function getCurrentCompanyId(): string {
  return currentCompanyId
}

export function setCurrentCompanyId(companyId: string): void {
  currentCompanyId = companyId
}
