import React from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import BLEvidenceMaster from './BLEvidenceMaster.jsx'
import BLEvidenceChild from './BLEvidenceChild.jsx'

function BLEvidence() {
  const params = useParams()
  const hblId = params?.hblId
  const remainder = params?.['*']
  const hasRemainder = typeof remainder === 'string' && remainder.trim() !== ''
  const [searchParams] = useSearchParams()
  const type = searchParams.get('type')

  if (type === 'master') return <BLEvidenceMaster />
  if (type === 'child' || type === 'hijo') return <BLEvidenceChild />

  return (hblId || hasRemainder) ? <BLEvidenceChild /> : <BLEvidenceMaster />
}

export default BLEvidence
