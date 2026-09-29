const express = require('express');
const router = express.Router();
const representativeController = require('../controllers/representativeController');
const verifyToken = require('../middleware/authMiddleware');
const requireRoles = require('../middleware/roleMiddleware');

// ADMIN + ANALYST
router.get(
    '/',
    verifyToken,
    requireRoles('admin', 'analyst'),
    representativeController.getRepresentatives
);

router.get(
    '/:id',
    verifyToken,
    requireRoles('admin', 'analyst'),
    representativeController.getRepresentativeById
);


// SOLO ADMIN
router.post(
    '/',
    verifyToken,
    requireRoles('admin'),
    representativeController.createRepresentative
);


module.exports = router;