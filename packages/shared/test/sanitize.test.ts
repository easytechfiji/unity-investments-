import { describe, expect, it } from 'vitest';
import { sanitizeRichText } from '../src/sanitize.js';

describe('sanitizeRichText', () => {
  it('keeps simple formatting', () => {
    expect(sanitizeRichText('<p>Hello <strong>there</strong></p>')).toBe(
      '<p>Hello <strong>there</strong></p>',
    );
  });

  it('removes scripts, event handlers and styles', () => {
    const dirty =
      '<p onclick="steal()">Hi</p><script>alert(1)</script><style>p{}</style><img src=x onerror=alert(1)>';
    expect(sanitizeRichText(dirty)).toBe('<p>Hi</p>');
  });

  it('removes javascript links and adds rel to safe ones', () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).toBe(
      '<a rel="noopener noreferrer">x</a>',
    );
    expect(sanitizeRichText('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com" rel="noopener noreferrer">x</a>',
    );
  });

  it('removes iframes', () => {
    expect(sanitizeRichText('<iframe src="https://evil.example"></iframe><p>ok</p>')).toBe(
      '<p>ok</p>',
    );
  });
});
