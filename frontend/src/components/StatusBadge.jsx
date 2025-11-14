import React from 'react'

function StatusBadge({ status }) {
  const s = String(status || '').toLowerCase()
  if (s === 'sent' || s === 'complete' || s === 'completo') {
    return <span className="badge badge-green"><span className="badge-dot green" /> Completo</span>
  }
  if (s === 'failed' || s === 'rechazado' || s === 'error') {
    return <span className="badge badge-red"><span className="badge-dot red" /> Rechazado</span>
  }
  return <span className="badge badge-yellow"><span className="badge-dot yellow" /> Pendiente</span>
}

export default React.memo(StatusBadge)