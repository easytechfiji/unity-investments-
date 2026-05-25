import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useCategories from '../../hooks/useCategories'

export const catalogueCategorySeed = [
  {
    slug: 'vehicles',
    name: 'Vehicles',
    description: 'Cars, vans and transport options sourced from different retailers.',
    sort_order: 1,
  },
  {
    slug: 'phones-tablets',
    name: 'Phones & Tablets',
    description: 'Mobile phones, tablets and everyday smart devices.',
    sort_order: 2,
  },
  {
    slug: 'electronics',
    name: 'Electronics',
    description: 'Useful tech, entertainment devices and electronic accessories.',
    sort_order: 3,
  },
  {
    slug: 'home-goods',
    name: 'Home Goods',
    description: 'Practical household products for daily living and comfort.',
    sort_order: 4,
  },
  {
    slug: 'blankets-bedding',
    name: 'Blankets & Bedding',
    description: 'Blankets, bedding and soft home essentials.',
    sort_order: 5,
  },
  {
    slug: 'daily-essentials',
    name: 'Daily Essentials',
    description: 'Everyday products that customers need often and can browse quickly.',
    sort_order: 6,
  },
]

const fallbackCategories = catalogueCategorySeed.map((category) => ({
  id: category.slug,
  ...category,
}))

export default function CataloguePreview() {
  const navigate = useNavigate()
  const { data: categories = [], loading } = useCategories()
  const visibleCategories = categories.length > 0 ? categories : fallbackCategories
  const carouselRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [cardsPerView, setCardsPerView] = useState(3)
  const [isPaused, setIsPaused] = useState(false)

  const maxIndex = Math.max(visibleCategories.length - cardsPerView, 0)
  const progressSteps = useMemo(
    () => Array.from({ length: maxIndex + 1 }, (_, index) => index),
    [maxIndex],
  )

  const handleCategoryClick = (slug) => {
    navigate(`/category/${slug}`)
  }

  const scrollToIndex = (nextIndex) => {
    const carousel = carouselRef.current
    if (!carousel) return

    const targetIndex = Math.min(Math.max(nextIndex, 0), maxIndex)
    const target = carousel.children[targetIndex]

    if (target) {
      carousel.scrollTo({
        left: target.offsetLeft,
        behavior: 'smooth',
      })
    }

    setActiveIndex(targetIndex)
  }

  const goToPrevious = () => {
    scrollToIndex(activeIndex <= 0 ? maxIndex : activeIndex - 1)
  }

  const goToNext = () => {
    scrollToIndex(activeIndex >= maxIndex ? 0 : activeIndex + 1)
  }

  useEffect(() => {
    const carousel = carouselRef.current
    if (!carousel) return undefined

    const updateCardsPerView = () => {
      const width = carousel.clientWidth
      if (width < 680) {
        setCardsPerView(1)
      } else if (width < 1040) {
        setCardsPerView(2)
      } else {
        setCardsPerView(3)
      }
    }

    updateCardsPerView()

    const resizeObserver = new ResizeObserver(updateCardsPerView)
    resizeObserver.observe(carousel)

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    setActiveIndex((currentIndex) => Math.min(currentIndex, maxIndex))
  }, [maxIndex])

  useEffect(() => {
    if (loading || isPaused || maxIndex === 0) return undefined

    const intervalId = window.setInterval(() => {
      setActiveIndex((currentIndex) => {
        const nextIndex = currentIndex >= maxIndex ? 0 : currentIndex + 1
        const carousel = carouselRef.current
        const target = carousel?.children[nextIndex]

        if (carousel && target) {
          carousel.scrollTo({
            left: target.offsetLeft,
            behavior: 'smooth',
          })
        }

        return nextIndex
      })
    }, 4200)

    return () => window.clearInterval(intervalId)
  }, [isPaused, loading, maxIndex])

  useEffect(() => {
    const carousel = carouselRef.current
    if (!carousel) return undefined

    let frameId = 0

    const handleScroll = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        const children = Array.from(carousel.children)
        const closestIndex = children.reduce((closest, child, index) => {
          const currentDistance = Math.abs(child.offsetLeft - carousel.scrollLeft)
          const closestDistance = Math.abs(children[closest].offsetLeft - carousel.scrollLeft)
          return currentDistance < closestDistance ? index : closest
        }, 0)

        setActiveIndex(Math.min(closestIndex, maxIndex))
      })
    }

    carousel.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.cancelAnimationFrame(frameId)
      carousel.removeEventListener('scroll', handleScroll)
    }
  }, [maxIndex])

  return (
    <section className="catalogue-section" id="catalogue">
      <div className="catalogue-inner container">
        <div className="catalogue-header">
          <h2>Catalogue</h2>
        </div>

        {loading && (
          <div className="category-carousel-shell loading-skeletons" aria-label="Loading categories">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="category-skeleton" />
            ))}
          </div>
        )}

        {!loading && (
          <div
            className="category-carousel-wrap"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onFocus={() => setIsPaused(true)}
            onBlur={() => setIsPaused(false)}
          >
            <div className="category-carousel-top">
              <div className="carousel-progress" aria-hidden="true">
                <span style={{ width: `${((activeIndex + 1) / (maxIndex + 1)) * 100}%` }} />
              </div>
            </div>

            <div className="category-carousel-shell">
              <div className="catalogue-controls" aria-label="Catalogue carousel controls">
                <button
                  className="catalogue-nav prev"
                  type="button"
                  onClick={goToPrevious}
                  aria-label="Previous categories"
                />
                <button
                  className="catalogue-nav next"
                  type="button"
                  onClick={goToNext}
                  aria-label="Next categories"
                />
              </div>
              <div
                ref={carouselRef}
                className="category-carousel"
                aria-label="Product categories"
              >
                {visibleCategories.map((category, index) => (
                  <button
                    key={category.id}
                    className="category-card"
                    type="button"
                    onClick={() => handleCategoryClick(category.slug)}
                    aria-label={`View ${category.name}`}
                    style={{ '--card-index': String(index) }}
                  >
                    <span className="category-card-index">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="category-card-mark" aria-hidden="true">
                      {category.name.slice(0, 1)}
                    </span>
                    <span className="category-card-copy">
                      <strong>{category.name}</strong>
                      <small>{category.description || 'View available products in this category.'}</small>
                    </span>
                    <span className="category-card-action">View category</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="category-dots" aria-label="Choose category slide">
              {progressSteps.map((index) => (
                <button
                  key={index}
                  type="button"
                  className={index === activeIndex ? 'active' : ''}
                  onClick={() => scrollToIndex(index)}
                  aria-label={`Go to category slide ${index + 1}`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .catalogue-section { padding: clamp(72px, 8vw, 112px) 0; background: linear-gradient(180deg, var(--cream) 0%, #ffffff 100%); color: var(--ink); scroll-margin-top: 90px; overflow: hidden; }
        .catalogue-inner { display: grid; gap: 30px; min-width: 0; }
        .catalogue-header { display: flex; align-items: end; justify-content: space-between; gap: 24px; min-width: 0; }
        .catalogue-header h2 { margin: 0; color: var(--ink); font-size: clamp(2.7rem, 6vw, 5rem); line-height: 0.96; }

        .category-carousel-wrap { display: grid; gap: 18px; min-width: 0; }
        .category-carousel-top { display: block; }
        .carousel-progress { position: relative; width: 100%; height: 1px; overflow: hidden; background: rgba(17,17,17,0.1); }
        .carousel-progress span { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, var(--accent), var(--accent-light)); transition: width 520ms var(--ease-out); }
        .catalogue-controls { position: absolute; inset: 8px 8px 18px; z-index: 4; display: flex; align-items: center; justify-content: space-between; pointer-events: none; }
        .catalogue-nav { position: relative; width: 46px; height: 46px; border: 1px solid rgba(17,17,17,0.12); border-radius: 50%; background: rgba(255,255,255,0.92); box-shadow: 0 16px 42px rgba(15,23,42,0.12); color: var(--ink); cursor: pointer; pointer-events: auto; transition: transform 220ms var(--ease-out), border-color 220ms var(--ease-out), background 220ms var(--ease-out); }
        .catalogue-nav::before { content: ''; position: absolute; top: 50%; left: 50%; width: 10px; height: 10px; border-top: 2px solid currentColor; border-right: 2px solid currentColor; transition: transform 220ms var(--ease-out); }
        .catalogue-nav.prev::before { transform: translate(-35%, -50%) rotate(-135deg); }
        .catalogue-nav.next::before { transform: translate(-65%, -50%) rotate(45deg); }
        .catalogue-nav:hover { transform: translateY(-2px); border-color: rgba(200,169,110,0.8); background: var(--white); }
        .catalogue-nav:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

        .category-carousel-shell { position: relative; width: calc(100% + 136px); min-width: 0; margin: 0 -68px; padding: 8px 68px 18px; }
        .category-carousel-shell::before,
        .category-carousel-shell::after { content: ''; position: absolute; top: 0; bottom: 0; z-index: 2; width: 68px; pointer-events: none; }
        .category-carousel-shell::before { left: 0; background: linear-gradient(90deg, #ffffff, rgba(255,255,255,0)); }
        .category-carousel-shell::after { right: 0; background: linear-gradient(270deg, #ffffff, rgba(255,255,255,0)); }
        .loading-skeletons { display: flex; gap: 18px; overflow: hidden; }
        .category-carousel { display: flex; min-width: 0; gap: 18px; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; scroll-behavior: smooth; scrollbar-width: none; touch-action: pan-x; -webkit-overflow-scrolling: touch; }
        .category-carousel::-webkit-scrollbar { display: none; }
        .category-card { position: relative; isolation: isolate; flex: 0 0 calc((100% - 36px) / 3); min-width: 0; min-height: 330px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; padding: 24px; border: 1px solid var(--border); border-radius: 8px; background: linear-gradient(145deg, #ffffff, #f6fbff); color: inherit; text-align: left; cursor: pointer; scroll-snap-align: start; transform: translateZ(0); animation: cardRise 560ms var(--ease-out) both; animation-delay: calc(var(--card-index, 0) * 70ms); box-shadow: 0 18px 48px rgba(20,93,168,0.08); transition: transform 320ms var(--ease-out), border-color 320ms var(--ease-out), box-shadow 320ms var(--ease-out), background 320ms var(--ease-out); }
        .category-card::before { content: ''; position: absolute; inset: 0; z-index: -2; background: linear-gradient(135deg, rgba(200,169,110,0.16), transparent 48%, rgba(59,130,246,0.08)); opacity: 0; transition: opacity 320ms var(--ease-out); }
        .category-card::after { content: ''; position: absolute; inset: auto -20% -45% 20%; z-index: -1; height: 190px; background: radial-gradient(circle, rgba(200,169,110,0.16), transparent 68%); transform: translateY(28px); opacity: 0.6; transition: transform 420ms var(--ease-out), opacity 420ms var(--ease-out); }
        .category-card:hover { transform: translateY(-8px); border-color: rgba(200,169,110,0.56); background: var(--white); box-shadow: 0 26px 70px rgba(15,23,42,0.14); }
        .category-card:hover::before { opacity: 1; }
        .category-card:hover::after { transform: translateY(0); opacity: 1; }
        .category-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
        .category-card-index { color: rgba(17,17,17,0.34); font-size: 0.78rem; font-weight: 800; letter-spacing: 0.16em; }
        .category-card-mark { position: absolute; top: 18px; right: 20px; color: rgba(30,58,138,0.06); font-family: var(--font-display); font-size: clamp(5.2rem, 9vw, 7.8rem); font-weight: 800; line-height: 0.8; transition: transform 420ms var(--ease-out), color 420ms var(--ease-out); }
        .category-card:hover .category-card-mark { color: rgba(200,169,110,0.16); transform: translate3d(-8px, 8px, 0) scale(1.04); }
        .category-card-copy { display: block; margin-top: auto; padding-top: 92px; }
        .category-card strong { display: block; margin-bottom: 12px; color: var(--ink); font-family: var(--font-display); font-size: clamp(1.65rem, 2.7vw, 2.25rem); font-weight: 700; line-height: 1; }
        .category-card small { display: block; min-height: 76px; color: var(--ink-soft); font-size: 0.95rem; line-height: 1.55; }
        .category-card-action { width: max-content; margin-top: 24px; padding-top: 13px; border-top: 1px solid rgba(255,166,38,0.42); color: var(--accent-strong); font-size: 0.74rem; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; transition: transform 260ms var(--ease-out), color 260ms var(--ease-out); }
        .category-card:hover .category-card-action { color: var(--blue); transform: translateX(6px); }
        .category-dots { display: flex; justify-content: center; gap: 9px; }
        .category-dots button { width: 24px; height: 6px; border: 0; border-radius: 999px; background: rgba(17,17,17,0.16); cursor: pointer; transition: width 260ms var(--ease-out), background 260ms var(--ease-out), transform 260ms var(--ease-out); }
        .category-dots button.active { width: 42px; background: var(--accent); }
        .category-dots button:hover { transform: translateY(-1px); background: rgba(232,217,191,0.72); }
        .category-dots button:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }

        .category-skeleton { flex: 0 0 calc((100% - 36px) / 3); min-height: 330px; border: 1px solid rgba(200,169,110,0.16); border-radius: 8px; background: linear-gradient(90deg, #f4efe7, #ffffff, #f4efe7); background-size: 220% 100%; animation: categoryShimmer 1.4s ease-in-out infinite; }

        @keyframes cardRise {
          from { opacity: 0; transform: translate3d(0, 18px, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        @keyframes categoryShimmer {
          0% { background-position: 120% 0; }
          100% { background-position: -120% 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .category-carousel,
          .carousel-progress span,
          .catalogue-nav,
          .catalogue-nav::before,
          .category-card,
          .category-card::before,
          .category-card::after,
          .category-card-mark,
          .category-card-action,
          .category-dots button {
            scroll-behavior: auto;
            transition-duration: 1ms;
            animation-duration: 1ms;
          }
        }

        @media (max-width: 1040px) {
          .category-card,
          .category-skeleton { flex-basis: calc((100% - 18px) / 2); }
        }

        @media (max-width: 820px) {
          .catalogue-section { padding: 64px 0; }
          .catalogue-header { align-items: start; }
          .category-carousel-shell { width: calc(100% + 40px); margin: 0 -20px; padding-inline: 52px; }
          .category-carousel-shell::before,
          .category-carousel-shell::after { width: 52px; }
          .category-card,
          .category-skeleton { flex-basis: 100%; min-height: 310px; }
          .category-card-copy { padding-top: 76px; }
          .category-card small { min-height: 0; }
        }

        @media (max-width: 520px) {
          .catalogue-inner { gap: 22px; }
          .catalogue-nav { width: 40px; height: 40px; }
          .category-carousel-shell { width: calc(100% + 24px); margin: 0 -12px; padding-inline: 42px; }
          .category-carousel-shell::before,
          .category-carousel-shell::after { width: 42px; }
          .category-card { padding: 22px; }
          .category-card-mark { font-size: 4.8rem; }
          .category-card strong { font-size: 1.55rem; }
        }
      `}</style>
    </section>
  )
}
