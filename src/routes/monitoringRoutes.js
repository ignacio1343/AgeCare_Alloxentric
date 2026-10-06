const express = require('express');

const router = express.Router();

const monitoringController =
  require('../controllers/monitoringController');

const verifyToken =
  require('../middleware/authMiddleware');

const requireRoles =
  require('../middleware/roleMiddleware');


// ============================================
// MONITOREO GENERAL
// ADMIN + ANALYST
// ============================================

router.get(
  '/monitoring/residents',
  verifyToken,
  requireRoles('admin', 'analyst'),
  monitoringController.getResidentMonitoring
);


// ============================================
// HISTORIAL DE UN RESIDENTE
// ADMIN + ANALYST
// ============================================

router.get(
  '/monitoring/residents/:id/history',
  verifyToken,
  requireRoles('admin', 'analyst'),
  monitoringController.getResidentHistory
);


module.exports = router;