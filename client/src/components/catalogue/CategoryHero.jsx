import React from 'react'

const formatCategoryName = (value = '') =>
  value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

export default function CategoryHero({ title, description, categoryName, categoryDescription }) {
  const heroTitle = title || formatCategoryName(categoryName)
  const heroDescription = description || categoryDescription

  return (
    <section className="category-hero fade-in">
      <div className="container">
        <h1>{heroTitle}</h1>
        {heroDescription && <p>{heroDescription}</p>}
      </div>

      <style>{`
        .category-hero { min-height: clamp(280px, 45vh, 460px); display: flex; align-items: end; padding: 126px 0 56px; background: linear-gradient(135deg, #0b1120 0%, #111827 54%, #1e3a8a 100%); color: var(--white); border-bottom: 1px solid rgba(255,255,255,0.08); }
        .category-hero h1 { margin: 0 0 12px; color: var(--white); text-transform: capitalize; }
        .category-hero p { max-width: 620px; margin: 0; color: rgba(255,255,255,0.72); line-height: 1.7; }

        @media (max-width: 768px) {
          .category-hero { min-height: auto; padding: 112px 0 44px; }
          .category-hero h1 { font-size: clamp(2.1rem, 12vw, 3rem); line-height: 1; }
        }
      `}</style>
    </section>
  )
}
