import React from 'react'
import { motion } from 'framer-motion'

export default function ItemCard({ id, name, description, categoryName, imageUrl, tags = [] }) {
  return (
    <motion.article
      className="item-card hover-elevate reveal"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <div className="card-image" style={{ backgroundImage: imageUrl ? `url(${imageUrl})` : 'none' }}>
        {!imageUrl && <div className="image-fallback" />}
      </div>

      <div className="card-body">
        <span className="badge">{categoryName}</span>
        <h3 className="card-title">{name}</h3>
        <p className="card-desc">{description}</p>
      </div>

      <div className="card-arrow" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <style>{`
        .item-card { background: var(--white); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 2px 6px rgba(17,17,17,0.04); position: relative; }
        .card-image { width: 100%; aspect-ratio: 4 / 3; background-size: cover; background-position: center; background-color: #ede9e2; display: block; }
        .image-fallback { width: 100%; height: 100%; background: #ede9e2; }
        .card-body { padding: 14px 16px; flex: 1; }
        .badge { display: inline-block; background: var(--accent); color: var(--white); padding: 6px 10px; border-radius: 20px; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 8px; }
        .card-title { margin: 6px 0; font-size: 1rem; }
        .card-desc { color: var(--ink-soft); font-size: 0.9rem; }
        .card-arrow { position: absolute; top: 12px; right: 12px; color: var(--ink-soft); transition: transform 200ms ease; }
        .item-card:hover .card-arrow { transform: rotate(45deg); color: var(--accent); }
      `}</style>
    </motion.article>
  )
}
