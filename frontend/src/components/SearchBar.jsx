import React from 'react'

export default function SearchBar({ placeholder, value, onChange }) {
  return (
    <div className="searchbar">
      <svg className="search-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input placeholder={placeholder} value={value} onChange={onChange} />
    </div>
  )
}