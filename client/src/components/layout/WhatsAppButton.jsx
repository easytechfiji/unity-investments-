import { useState } from 'react';

// Digits only, international format, no + or spaces. Fiji numbers: 679 + your number.
// Clicks rotate through this list one after another, so chats are shared
// between the phones. Add or remove numbers freely.
const WHATSAPP_NUMBERS = ['6797887660'];
const WHATSAPP_MESSAGE = "Hi Unity Investment, I'm interested in a product from your catalogue.";

const TURN_KEY = 'ui-wa-turn';

function getTurn() {
  try {
    return Number(localStorage.getItem(TURN_KEY)) || 0;
  } catch {
    return 0;
  }
}

export default function WhatsAppButton() {
  const [turn, setTurn] = useState(getTurn);

  const number = WHATSAPP_NUMBERS[turn % WHATSAPP_NUMBERS.length];
  const href = `https://wa.me/${number}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

  const handleClick = () => {
    const nextTurn = turn + 1;
    setTurn(nextTurn);
    try {
      localStorage.setItem(TURN_KEY, String(nextTurn));
    } catch {
      // localStorage unavailable (private mode) — rotation just restarts next visit.
    }
  };

  return (
    <a
      className="whatsapp-fab"
      href={href}
      onClick={handleClick}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
    >
      <svg viewBox="0 0 32 32" width="30" height="30" fill="currentColor" aria-hidden="true">
        <path d="M16.004 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.26.59 4.46 1.71 6.4L3.2 28.8l6.58-1.67a12.74 12.74 0 0 0 6.22 1.62h.01c7.06 0 12.79-5.74 12.79-12.8 0-3.42-1.33-6.63-3.75-9.05a12.72 12.72 0 0 0-9.04-3.7zm0 23.4h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-4.02 1.02 1.07-3.86-.25-.4a10.55 10.55 0 0 1-1.63-5.65c0-5.87 4.78-10.64 10.65-10.64 2.84 0 5.51 1.11 7.52 3.12a10.57 10.57 0 0 1 3.11 7.53c0 5.87-4.78 10.6-10.65 10.6zm5.84-7.96c-.32-.16-1.9-.94-2.19-1.04-.29-.11-.51-.16-.72.16-.21.32-.83 1.04-1.02 1.26-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.12 1.09-1.12 2.66s1.15 3.09 1.31 3.3c.16.21 2.26 3.45 5.47 4.84.76.33 1.36.53 1.83.68.77.24 1.47.21 2.02.13.62-.09 1.9-.78 2.17-1.53.27-.75.27-1.39.19-1.53-.08-.13-.29-.21-.61-.37z" />
      </svg>

      <style>{`
        .whatsapp-fab { position: fixed; right: clamp(16px, 3vw, 28px); bottom: clamp(16px, 3vw, 28px); z-index: 50; display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; background: #25d366; color: #ffffff; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.28); transition: transform 220ms var(--ease-out), box-shadow 220ms var(--ease-out); }
        .whatsapp-fab:hover { transform: translateY(-3px) scale(1.04); box-shadow: 0 18px 44px rgba(15, 23, 42, 0.32); }
        .whatsapp-fab:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

        @media (max-width: 520px) {
          .whatsapp-fab { width: 50px; height: 50px; }
          .whatsapp-fab svg { width: 26px; height: 26px; }
        }
      `}</style>
    </a>
  );
}
