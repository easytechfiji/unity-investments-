import express from 'express'
const router = express.Router()

router.post('/login', (req, res) => {
  res.json({ token: 'stub-token' })
})

router.post('/logout', (req, res) => {
  res.status(204).end()
})

export default router
