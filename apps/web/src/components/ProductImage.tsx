import type { ImageSet } from '@od/shared';

interface Props {
  image: ImageSet | null;
  alt: string;
  /** How wide the image shows on screen, so the browser picks the right file. */
  sizes: string;
  /** The main image of a page: load it first instead of lazily. */
  priority?: boolean;
  /** Extra class on the wrapping box, for layouts that need a different shape than the default square. */
  className?: string;
}

/**
 * Product and category photos: pre-sized WebP files chosen with srcset, inside
 * a square box with fixed width and height so nothing shifts while loading.
 */
export function ProductImage({ image, alt, sizes, priority = false, className }: Props) {
  const boxClassName = className ? `media ${className}` : 'media';
  if (!image) {
    return (
      <div className={boxClassName}>
        <div className="media-empty">Photo coming soon</div>
      </div>
    );
  }
  return (
    <div className={boxClassName}>
      {/* eslint-disable-next-line @next/next/no-img-element -- images are already resized to WebP by the API; next/image would resize them again */}
      <img
        src={image.src}
        srcSet={image.srcSet}
        sizes={sizes}
        alt={alt}
        width={800}
        height={800}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
      />
    </div>
  );
}
