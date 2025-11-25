import React from 'react'
import { useParams } from 'react-router-dom'
import BLEvidenceMaster from './BLEvidenceMaster.jsx'
import BLEvidenceChild from './BLEvidenceChild.jsx'

function BLEvidence() {
  const { hblId } = useParams()
  return hblId ? <BLEvidenceChild /> : <BLEvidenceMaster />
}

export default BLEvidence