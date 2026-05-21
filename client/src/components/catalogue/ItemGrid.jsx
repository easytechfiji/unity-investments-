import React from 'react'
import ItemCard from './ItemCard'

export default function ItemGrid({ items = [], loading = false }) {
  if (loading) {
    return (
      <div className="item-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton-img" />
            <div className="skeleton-body">
              <div className="skeleton-line short" />
              <div className="skeleton-line" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!items || items.length === 0) {
    return <div className="no-items text-center">No items found</div>
  }

  return (
    <div className="item-grid stagger reveal">
      {items.map((it, idx) => (
        <div key={it.id} style={{ transitionDelay: `${idx * 60}ms` }}>
          <ItemCard {...it} />
        </div>
      ))}

      <style>{`
        .item-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        @media (max-width: 992px) { .item-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 768px) { .item-grid { grid-template-columns: 1fr; } }
        .skeleton-card { background: var(--white); border-radius: 8px; overflow: hidden; }
        .skeleton-img { height: 140px; background: #efeae6; }
        .skeleton-body { padding: 12px; }
        .skeleton-line { height: 12px; background: #f1eeec; margin-bottom: 8px; border-radius: 3px; }
        .skeleton-line.short { width: 60%; }
      `}</style>
    </div>
  )
}
