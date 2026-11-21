import sanitizeHtml from 'sanitize-html';

// Admin written rich text (product descriptions, buyer's guides, pages) is the
// only HTML the site prints. It is cleaned with an allow list when saved and
// again before display: anything not listed here is removed, including
// scripts, styles, event handlers, iframes and images from other sites.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    'ul',
    'ol',
    'li',
    'h2',
    'h3',
    'h4',
    'blockquote',
    'a',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  allowedAttributes: { a: ['href', 'rel'], th: ['scope'] },
  allowedSchemes: ['https', 'http', 'mailto', 'tel'],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
  },
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}
