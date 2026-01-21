import React from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import BLEvidenceMaster from './BLEvidenceMaster.jsx'
import BLEvidenceChild from './BLEvidenceChild.jsx'

function BLEvidence() {
  const { hblId } = useParams()
  const [searchParams] = useSearchParams()
  const type = searchParams.get('type')

  if (type === 'master') return <BLEvidenceMaster />
  if (type === 'child' || type === 'hijo') return <BLEvidenceChild />

  return hblId ? <BLEvidenceChild /> : <BLEvidenceMaster />
}

export default BLEvidence