import React from 'react'

export default function SearchBar({ placeholder, value, onChange }) {
  return (
    <div className="searchbar">
      <span className="search-icon" aria-hidden="true">🔍</span>
      <input placeholder={placeholder} value={value} onChange={onChange} />
    </div>
  )
}