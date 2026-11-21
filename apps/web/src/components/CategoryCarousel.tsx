'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronIcon } from './icons';
import { useReducedMotion } from '../lib/useReducedMotion';

export interface CarouselCategory {
  id: number;
  name: string;
  slug: string;
  /** Background photo, or null for a plain coloured box. */
  image: string | null;
}

// Words that say little on their own, so they are skipped when picking the one
// word shown on a box ("Office furniture" shows "Furniture").
const FILLER = new Set(['office', 'supplies', 'products', 'items', 'and', 'the', 'for', '&']);

/** The single word shown on a category box. The full name stays the link's accessible name. */
export function shortLabel(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const useful = words.filter((word) => !FILLER.has(word.toLowerCase()));
  const word = useful.at(-1) ?? words[0] ?? name;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const INTERVAL_MS = 3000;

// Most boxes shown across at once (7 on wide screens, see .carousel-track in
// globals.css), plus one so the row never runs out while sliding.
const MAX_VISIBLE = 8;

/**
 * Category boxes in a row that moves along by one box every few seconds.
 * It stops while the pointer or keyboard focus is inside it, has a pause
 * button (WCAG 2.2.2), and does not move at all for people who ask for
 * reduced motion.
 */
export function CategoryCarousel({ categories }: { categories: CarouselCategory[] }) {
  const track = useRef<HTMLUListElement>(null);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useReducedMotion();

  // The boxes are rendered more than once. When the row has moved past the
  // first copy it jumps back by exactly one copy, which looks the same, so it
  // can keep going round even when every category already fits on screen.
  // After the first copy there must be enough boxes to fill the widest row.
  const looping = categories.length > 1;
  const copies = looping ? 1 + Math.ceil(MAX_VISIBLE / categories.length) : 1;
  const boxes = Array.from({ length: copies }, () => categories).flat();

  const step = useCallback(
    (direction: 1 | -1) => {
      const el = track.current;
      if (!el) return;
      const items = el.querySelectorAll<HTMLElement>(':scope > li');
      const first = items[0];
      if (!first) return;
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const distance = first.offsetWidth + gap;
      const copy = items[categories.length];
      const copyWidth = copy ? copy.offsetLeft - first.offsetLeft : 0;
      if (copyWidth > 0) {
        if (direction === 1 && el.scrollLeft >= copyWidth) el.scrollLeft -= copyWidth;
        if (direction === -1 && el.scrollLeft < distance) el.scrollLeft += copyWidth;
      }
      el.scrollBy({ left: distance * direction, behavior: reducedMotion ? 'auto' : 'smooth' });
    },
    [categories.length, reducedMotion],
  );

  const running = !paused && !hovered && !reducedMotion && looping;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => step(1), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [running, step]);

  if (categories.length === 0) return null;

  return (
    <div
      className="carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false);
      }}
    >
      <ul className="carousel-track" ref={track}>
        {boxes.map((category, index) => {
          const repeat = index >= categories.length;
          return (
            <li key={`${category.id}-${index}`} aria-hidden={repeat || undefined}>
              <Link
                className={`word-box word-box-${(index % categories.length) % 3}${category.image ? ' word-box-photo' : ''}`}
                href={`/collection/${category.slug}`}
                aria-label={category.name}
                title={category.name}
                tabIndex={repeat ? -1 : undefined}
              >
                {category.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small static file, already sized
                  <img
                    className="word-box-image"
                    src={category.image}
                    alt=""
                    width={480}
                    height={320}
                    loading="lazy"
                  />
                ) : null}
                <span className="word-box-label">{shortLabel(category.name)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="carousel-controls">
        <button type="button" className="carousel-btn" onClick={() => step(-1)}>
          <ChevronIcon className="icon carousel-prev" />
          <span className="visually-hidden">Previous categories</span>
        </button>
        {reducedMotion ? null : (
          <button
            type="button"
            className="carousel-btn carousel-pause"
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? 'Play' : 'Pause'}
          </button>
        )}
        <button type="button" className="carousel-btn" onClick={() => step(1)}>
          <ChevronIcon className="icon carousel-next" />
          <span className="visually-hidden">Next categories</span>
        </button>
      </div>
    </div>
  );
}
