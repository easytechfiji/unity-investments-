import express from 'express'
const router = express.Router()

router.post('/items', (req, res) => {
  res.status(201).json(req.body)
})

router.put('/items/:id', (req, res) => {
  res.json({ id: req.params.id, ...req.body })
})

router.delete('/items/:id', (req, res) => {
  res.status(204).end()
})

export default router
