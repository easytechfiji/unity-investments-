// Vercel serverless function: POST /api/contact
// Runs on the same domain as the site, so no CORS setup is needed.

const emailPattern = /^\S+@\S+\.\S+$/

// Basic per-IP rate limit. Serverless instances are short-lived, so this is
// best-effort per warm instance — enough to stop casual form spam.
const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_WINDOW = 5
const hits = new Map()

function isRateLimited(ip) {
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter((time) => now - time < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent)
    return true
  }
  recent.push(now)
  hits.set(ip, recent)
  return false
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many messages sent. Please try again later.' })
  }

  const name = String(req.body?.name || '').trim()
  const email = String(req.body?.email || '').trim()
  const message = String(req.body?.message || '').trim()

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email and message are required.' })
  }

  if (name.length > 100 || email.length > 254 || message.length > 5000) {
    return res.status(400).json({ error: 'Message is too long.' })
  }

  if (!emailPattern.test(email)) {
    return res.status(400).json({ error: 'A valid email is required.' })
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const recipients = (process.env.CONTACT_EMAIL_TO || '')
    .split(',')
    .map((recipient) => recipient.trim())
    .filter(Boolean)

  if (!apiKey || !from || recipients.length === 0) {
    return res.status(500).json({ error: 'Contact email is not configured.' })
  }

  try {
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: recipients,
        reply_to: email,
        subject: `New Unity Investment message from ${name}`,
        text: [
          `Name: ${name}`,
          `Email: ${email}`,
          '',
          message,
        ].join('\n'),
      }),
    })

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.text()
      console.error('Resend email failed:', errorBody)
      return res.status(502).json({ error: 'Email provider rejected the message.' })
    }

    return res.status(202).json({ ok: true })
  } catch (error) {
    console.error('Contact email failed:', error)
    return res.status(502).json({ error: 'Unable to send message right now.' })
  }
}
