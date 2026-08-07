import React from 'react'
import { motion } from 'framer-motion'

const formatPrice = (price) => {
  if (price === null || price === undefined || price === '') return ''

  const numericPrice = Number(price)
  if (!Number.isFinite(numericPrice)) return String(price)

  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(numericPrice)
}

export default function ItemCard({ id, name, description, categoryName, imageUrl, price, tags = [], isUpcoming = false }) {
  const displayPrice = formatPrice(price)

  return (
    <motion.article
      className="item-card hover-elevate reveal"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <div className="card-image" style={{ backgroundImage: imageUrl ? `url(${imageUrl})` : 'none' }}>
        {!imageUrl && <div className="image-fallback" />}
        {isUpcoming && (
          <span className="upcoming-tag">
            <span className="upcoming-dot" aria-hidden />
            Upcoming
          </span>
        )}
      </div>

      <div className="card-body">
        <div className="card-meta">
          {categoryName && <span className="badge">{categoryName}</span>}
          {displayPrice && <span className="card-price">{displayPrice}</span>}
        </div>
        <h3 className="card-title">{name}</h3>
        <p className="card-desc">{description}</p>
      </div>

      {!isUpcoming && (
        <div className="card-arrow" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      <style>{`
        .item-card { background: var(--white); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 2px 6px rgba(17,17,17,0.04); position: relative; }
        .card-image { width: 100%; aspect-ratio: 4 / 3; background-size: cover; background-position: center; background-color: #ede9e2; display: block; position: relative; }
        .upcoming-tag {
          position: absolute; top: 12px; right: 12px;
          display: inline-flex; align-items: center; gap: 7px;
          padding: 7px 14px 7px 11px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(27, 31, 36, 0.72);
          -webkit-backdrop-filter: blur(10px) saturate(160%);
          backdrop-filter: blur(10px) saturate(160%);
          border: 1px solid rgba(255, 166, 38, 0.55);
          box-shadow: 0 6px 20px rgba(17,17,17,0.28), inset 0 1px 0 rgba(255,255,255,0.14);
          font-family: var(--font-display);
          font-size: 0.7rem; font-weight: 800; line-height: 1;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--accent-light);
          text-shadow: 0 1px 2px rgba(0,0,0,0.35);
          animation: upcoming-in 460ms var(--anim-ease, ease) both;
        }
        /* Slow light sweep across the pill — the bit that stops it reading flat. */
        .upcoming-tag::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.30) 50%, transparent 62%);
          transform: translateX(-120%);
          animation: upcoming-sheen 4.5s ease-in-out 1.2s infinite;
        }
        /* Pulse via opacity/scale, not a spreading ring — the pill clips overflow. */
        .upcoming-dot {
          width: 7px; height: 7px; border-radius: 50%; flex: none;
          background: var(--accent);
          animation: upcoming-pulse 2.2s ease-in-out infinite;
        }
        .item-card:hover .upcoming-tag {
          border-color: rgba(255,166,38,0.85);
          box-shadow: 0 8px 24px rgba(17,17,17,0.34), 0 0 18px rgba(255,166,38,0.25), inset 0 1px 0 rgba(255,255,255,0.18);
        }

        @keyframes upcoming-in { from { opacity: 0; transform: translateY(-6px) scale(0.94); } to { opacity: 1; transform: none; } }
        @keyframes upcoming-sheen { 0% { transform: translateX(-120%); } 55%, 100% { transform: translateX(120%); } }
        @keyframes upcoming-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.72); }
        }

        @media (prefers-reduced-motion: reduce) {
          .upcoming-tag, .upcoming-tag::after, .upcoming-dot { animation: none; }
          .upcoming-tag::after { display: none; }
        }
        .image-fallback { width: 100%; height: 100%; background: #ede9e2; }
        .card-body { padding: 14px 16px; flex: 1; }
        .card-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
        .badge { display: inline-block; background: var(--accent); color: var(--white); padding: 6px 10px; border-radius: 20px; font-size: 0.75rem; text-transform: uppercase; }
        .card-price { color: var(--ink); font-size: 0.92rem; font-weight: 800; white-space: nowrap; }
        .card-title { margin: 6px 0; font-size: 1rem; }
        .card-desc { color: var(--ink-soft); font-size: 0.9rem; }
        .card-arrow { position: absolute; top: 12px; right: 12px; color: var(--ink-soft); transition: transform 200ms ease; }
        .item-card:hover .card-arrow { transform: rotate(45deg); color: var(--accent); }

        @media (max-width: 420px) {
          .card-meta { align-items: flex-start; flex-direction: column; gap: 4px; }
        }
      `}</style>
    </motion.article>
  )
}
