import React from 'react'

export default function CategoryHero({ title, description }) {
  return (
    <section className="category-hero fade-in">
      <div className="container">
        <h1>{title}</h1>
        {description && <p className="text-muted">{description}</p>}
      </div>

      <style>{`
        .category-hero { min-height: 60vh; display: flex; align-items: center; }
        .category-hero h1 { margin: 0 0 8px 0; }
      `}</style>
    </section>
  )
}
