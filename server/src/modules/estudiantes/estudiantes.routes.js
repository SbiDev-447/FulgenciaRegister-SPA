'use strict'

const express = require('express')
const controller = require('./estudiantes.controller')
const { requireAuth } = require('../../middlewares/auth')

const router = express.Router()

// Every estudiante endpoint requires a valid auth cookie.
router.use(requireAuth)

router.get('/', controller.list)
router.post('/', controller.create)
router.get('/:id', controller.getById)
router.put('/:id', controller.update)
router.delete('/:id', controller.remove)

module.exports = router