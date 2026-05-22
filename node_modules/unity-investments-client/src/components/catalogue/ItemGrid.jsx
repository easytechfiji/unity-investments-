import React from 'react'
import ItemCard from './ItemCard'

export default function ItemGrid({ items = [], loading = false }) {
  const styles = (
    <style>{`
      .item-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
      .no-items { padding: 54px 20px; color: var(--ink-soft); }
      .skeleton-card { background: var(--white); border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px rgba(17,17,17,0.04); }
      .skeleton-img { height: 140px; background: #efeae6; }
      .skeleton-body { padding: 12px; }
      .skeleton-line { height: 12px; background: #f1eeec; margin-bottom: 8px; border-radius: 3px; }
      .skeleton-line.short { width: 60%; }

      @media (max-width: 992px) {
        .item-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }

      @media (max-width: 768px) {
        .item-grid { grid-template-columns: 1fr; gap: 16px; }
      }
    `}</style>
  )

  if (loading) {
    return (
      <>
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
        {styles}
      </>
    )
  }

  if (!items || items.length === 0) {
    return (
      <>
        <div className="no-items text-center">No items found</div>
        {styles}
      </>
    )
  }

  return (
    <>
      <div className="item-grid">
        {items.map((it, idx) => (
          <div key={it.id} style={{ transitionDelay: `${idx * 60}ms` }}>
            <ItemCard {...it} />
          </div>
        ))}
      </div>
      {styles}
    </>
  )
}
