'use strict'

const express = require('express')
const controller = require('./reportes.controller')
const { requireAuth } = require('../../middlewares/auth')

const router = express.Router()

// Every reporte endpoint requires a valid auth cookie.
router.use(requireAuth)

router.get('/seccion', controller.getSection)

module.exports = router
