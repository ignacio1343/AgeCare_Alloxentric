const express = require('express');
const router = express.Router();
const caregiverController = require('../controllers/caregiverController');
const verifyToken = require('../middleware/authMiddleware');
const requireRoles = require('../middleware/roleMiddleware');


// ======================================================
// ADMIN + ANALYST
// ======================================================

router.get(
    '/',
    verifyToken,
    requireRoles('admin', 'analyst'),
    caregiverController.getCaregivers
);


// ======================================================
// SOLO ADMIN
// ======================================================

router.post(
    '/',
    verifyToken,
    requireRoles('admin'),
    caregiverController.createCaregiver
);

router.post(
    '/:id/family-groups',
    verifyToken,
    requireRoles('admin'),
    caregiverController.assignFamilyGroup
);


module.exports = router;