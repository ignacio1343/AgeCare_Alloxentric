const express = require('express');
const router = express.Router();

const residentController = require('../controllers/residentController');
const representativeController = require('../controllers/representativeController');

const verifyToken = require('../middleware/authMiddleware');
const requireRoles = require('../middleware/roleMiddleware');

// ======================================================
// ADMIN + ANALYST
// ======================================================

router.get(
    '/',
    verifyToken,
    requireRoles('admin', 'analyst'),
    residentController.getResidents
);

router.post(
    '/:residentId/representatives',
    verifyToken,
    requireRoles('admin'),
    representativeController.assignRepresentativeToResident
);

router.get(
    '/:id',
    verifyToken,
    requireRoles('admin', 'analyst'),
    residentController.getResidentById
);


// ======================================================
// SOLO ADMIN
// ======================================================

router.post(
    '/',
    verifyToken,
    requireRoles('admin'),
    residentController.createResident
);


module.exports = router;