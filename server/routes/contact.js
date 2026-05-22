import express from 'express'

const router = express.Router()

const emailPattern = /^\S+@\S+\.\S+$/

router.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const email = String(req.body?.email || '').trim()
  const message = String(req.body?.message || '').trim()

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email and message are required.' })
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
})

export default router
