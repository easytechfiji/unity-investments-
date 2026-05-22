import React from 'react'

export default function SearchBar({ onSearch = () => {}, onSort = () => {} }) {
  return (
    <div className="search-wrap fade-in">
      <div className="search-inner container">
        <input className="search-input" placeholder="Search products..." onChange={(e) => onSearch(e.target.value)} />
        <select className="sort-select" onChange={(e) => onSort(e.target.value)}>
          <option value="newest">Newest</option>
          <option value="name-asc">Name A-Z</option>
          <option value="name-desc">Name Z-A</option>
        </select>
      </div>

      <style>{`
        .search-wrap { padding: 34px 0 24px; background: #f9f7f4; }
        .search-inner { display: flex; gap: 16px; align-items: center; }
        .search-input { flex: 1; width: 100%; min-height: 48px; padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--white); color: var(--ink); }
        .sort-select { min-height: 48px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--white); color: var(--ink); }
        .search-input:focus,
        .sort-select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 4px rgba(200,169,110,0.14); }

        @media (max-width: 768px) {
          .search-wrap { padding: 24px 0; }
          .search-inner { flex-direction: column; align-items: stretch; gap: 12px; }
          .sort-select { width: 100%; }
        }
      `}</style>
    </div>
  )
}
