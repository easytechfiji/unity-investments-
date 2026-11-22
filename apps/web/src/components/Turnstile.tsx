'use client';

import { useEffect } from 'react';

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

/**
 * Cloudflare Turnstile, the free CAPTCHA alternative. It adds a hidden
 * "cf-turnstile-response" field to the surrounding form. Without a site key
 * (local development) nothing is shown and the API skips the check.
 */
export function Turnstile({ siteKey }: { siteKey: string | null }) {
  useEffect(() => {
    if (!siteKey || document.querySelector(`script[src="${SCRIPT}"]`)) return;
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    document.head.appendChild(script);
  }, [siteKey]);
  if (!siteKey) return null;
  return <div className="cf-turnstile field" data-sitekey={siteKey} data-theme="light" />;
}
