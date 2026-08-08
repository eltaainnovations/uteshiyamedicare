export interface DistributorOption {
  id: string
  name: string
}

// TODO(follow-up): replace with GET /distributors once the Distributors
// screen has a real backend behind it.
const MOCK_DISTRIBUTORS: DistributorOption[] = [
  { id: 'apex-medicals', name: 'Apex Medicals, Mumbai' },
  { id: 'medline-pharma', name: 'Medline Pharma, Delhi' },
  { id: 'healthplus', name: 'HealthPlus, Bangalore' },
  { id: 'ortho-care', name: 'Ortho Care, Chennai' },
  { id: 'medworld', name: 'MedWorld, Hyderabad' },
]

export function useDistributorOptions(): DistributorOption[] {
  return MOCK_DISTRIBUTORS
}
