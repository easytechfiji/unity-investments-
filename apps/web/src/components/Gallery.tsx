'use client';

import type { ImageSet } from '@od/shared';
import { useState } from 'react';
import { ProductImage } from './ProductImage';

/** Large image with a row of thumbnails. Without JavaScript the first image still shows. */
export function Gallery({ images, name }: { images: ImageSet[]; name: string }) {
  const [current, setCurrent] = useState(0);
  const main = images[current] ?? null;
  return (
    <div>
      <div className="gallery-main">
        <ProductImage image={main} alt={name} sizes="(min-width: 768px) 50vw, 100vw" priority />
      </div>
      {images.length > 1 ? (
        <ul className="thumbs" aria-label="More photos">
          {images.map((image, index) => (
            <li key={image.src}>
              <button
                type="button"
                aria-pressed={index === current}
                aria-label={`Show photo ${index + 1} of ${images.length}`}
                onClick={() => setCurrent(index)}
              >
                <ProductImage image={image} alt="" sizes="100px" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
