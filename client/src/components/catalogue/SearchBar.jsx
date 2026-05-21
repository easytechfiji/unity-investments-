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
        .search-wrap { padding: 40px 80px; }
        .search-inner { display: flex; gap: 16px; align-items: center; }
        .search-input { flex: 1; padding: 12px 16px; border: 1px solid var(--border); background: var(--white); }
        .sort-select { padding: 12px 14px; border: 1px solid var(--border); background: var(--white); }
        @media (max-width: 768px) { .search-inner { flex-direction: column; align-items: stretch; } .search-wrap { padding: 20px; } }
      `}</style>
    </div>
  )
}
