'use client';

import type { ProductVideo } from '@od/shared';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';

const DIMENSIONS: Record<ProductVideo['aspect'], { width: number; height: number }> = {
  '16x9': { width: 1280, height: 720 },
  '9x16': { width: 540, height: 960 },
  '4x5': { width: 800, height: 1000 },
  '1x1': { width: 800, height: 800 },
};

interface Props {
  video: ProductVideo;
  /** Extra class on the wrapping figure, for the layout it sits in. */
  className?: string;
}

/**
 * A promotional video that starts playing, muted and on a loop, as soon as
 * it scrolls into view, the way the shop's own video ads already behave
 * elsewhere. It always starts muted, so nothing plays sound without the
 * visitor choosing to, and a plain text button turns the sound on.
 *
 * Anyone who has asked their browser for reduced motion gets the still
 * poster image and ordinary click to play controls instead, and nothing
 * plays on its own for them.
 */
export function AutoplayVideo({ video, className }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const reducedMotion = useReducedMotion();
  const { width, height } = DIMENSIONS[video.aspect];
  const frameClassName = `spotlight-video-frame spotlight-video-${video.aspect}`;
  const figureClassName = className ? `autoplay-video ${className}` : 'autoplay-video';

  useEffect(() => {
    if (reducedMotion) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion]);

  if (reducedMotion) {
    return (
      <figure className={figureClassName}>
        <div className={frameClassName}>
          <video
            controls
            preload="none"
            playsInline
            poster={video.poster?.src}
            width={width}
            height={height}
            aria-label={video.title}
          >
            <source src={video.url} type="video/mp4" />
          </video>
        </div>
      </figure>
    );
  }

  return (
    <figure className={figureClassName}>
      <div className={frameClassName}>
        <video
          ref={ref}
          muted={muted}
          loop
          playsInline
          preload="none"
          poster={video.poster?.src}
          width={width}
          height={height}
          aria-label={video.title}
        >
          <source src={video.url} type="video/mp4" />
        </video>
        <button
          type="button"
          className="spotlight-video-sound"
          onClick={() => {
            const el = ref.current;
            if (!el) return;
            el.muted = !el.muted;
            setMuted(el.muted);
          }}
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>
      </div>
    </figure>
  );
}
