import { describe, expect, it } from 'vitest';
import { qrImage } from '../src/lib/authClient.js';

describe('qrImage', () => {
  it('turns the raw SVG Supabase sends into an image address', () => {
    const svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const image = qrImage(svg);
    expect(image.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(Buffer.from(image.split(',')[1] ?? '', 'base64').toString()).toBe(svg);
  });

  it('leaves an existing data address alone', () => {
    expect(qrImage('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });
});
