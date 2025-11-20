import React, { useMemo, useState, useRef, useEffect } from 'react'

export default function SearchBar({ placeholder, value, onChange, options = [], onSelect, onClear, fullWidth = false }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const list = useMemo(() => {
    const q = String(value || '').toLowerCase()
    if (!Array.isArray(options) || !options.length) return []
    return options.filter(o => String(o.label ?? o).toLowerCase().includes(q)).slice(0, 50)
  }, [options, value])

  useEffect(() => {
    const onDocClick = (e) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  function clearInput() {
    if (onClear) { onClear(); return }
    if (onChange) {
      const evt = { target: { value: '' } }
      onChange(evt)
    }
    setOpen(false)
  }

  return (
    <div className="searchbar" ref={containerRef} style={{ position: 'relative', width: fullWidth ? '100%' : undefined }}>
      <svg className="search-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input placeholder={placeholder} value={value} onChange={onChange} onFocus={() => setOpen(true)} style={{ paddingRight: 56, width: fullWidth ? '100%' : undefined }} />
      <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
        {String(value || '').length > 0 && (
          <button type="button" onClick={clearInput} style={{ appearance:'none', border:'none', background:'transparent', color:'#6b7280', fontSize:16, lineHeight:1, cursor:'pointer', pointerEvents: 'auto' }}>×</button>
        )}
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'auto' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
      {open && list.length > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 6, maxHeight: 240, overflowY: 'auto', zIndex: 20 }}>
          {list.map((o, idx) => (
            <div key={(o.value ?? o.label ?? o) + '-' + idx} style={{ padding: '8px 12px', cursor: 'pointer' }} onMouseDown={(e) => e.preventDefault()} onClick={() => { if (onSelect) onSelect(o) ; setOpen(false) }}>
              {String(o.label ?? o)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}