'use strict'

const express = require('express')
const controller = require('./estadisticas.controller')
const { requireAuth } = require('../../middlewares/auth')

const router = express.Router()

// Every estadisticas endpoint requires a valid auth cookie.
router.use(requireAuth)

router.get('/', controller.get)

module.exports = router