'use strict'

const express = require('express')
const controller = require('./ajustes.controller')
const { requireAuth } = require('../../middlewares/auth')
const { requireAdmin } = require('../../middlewares/roles')

const router = express.Router()

// Reading the settings needs a session; changing them or running maintenance
// needs the admin role. The screen is reachable for anybody with a session, so
// it stays honest about the difference instead of hiding behind a 404.
router.use(requireAuth)

router.get('/', controller.get)
router.get('/logo', controller.getLogo)

router.put('/director', requireAdmin, controller.putDirector)
router.put('/logo', requireAdmin, controller.putLogo)

router.get('/representantes-huerfanos', requireAdmin, controller.getHuerfanos)
router.post('/purgar-representantes', requireAdmin, controller.purgarHuerfanos)
router.post('/backup', requireAdmin, controller.postBackup)

module.exports = router
