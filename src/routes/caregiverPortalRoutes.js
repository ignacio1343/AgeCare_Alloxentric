const express = require('express');

const router = express.Router();

const caregiverPortalController = require('../controllers/caregiverPortalController');
const verifyToken = require('../middleware/authMiddleware');
const requireRoles = require('../middleware/roleMiddleware');

// ======================================================
// MIS RESIDENTES
// SOLO CAREGIVER
// ======================================================

router.get(
    '/me/residents',
    verifyToken,
    requireRoles('caregiver'),
    caregiverPortalController.getMyResidents
);

// ======================================================
// FICHA RESIDENTE
// ======================================================

router.get(
    '/residents/:id',
    verifyToken,
    requireRoles('caregiver'),
    caregiverPortalController.getResidentDetail
);

// ======================================================
// ACTUALIZAR ESTADO DEL RESIDENTE
// ======================================================

router.post(
    '/residents/:id/status',
    verifyToken,
    requireRoles('caregiver'),
    caregiverPortalController.updateResidentStatus
);

module.exports = router;