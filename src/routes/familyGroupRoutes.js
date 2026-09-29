const express = require('express');
const router = express.Router();

const familyGroupController =require('../controllers/familyGroupController');
const verifyToken =require('../middleware/authMiddleware');
const requireRoles =require('../middleware/roleMiddleware');


// ======================================================
// LECTURA
// ADMIN + ANALYST
// ======================================================

router.get(
    '/',
    verifyToken,
    requireRoles('admin', 'analyst'),
    familyGroupController.getFamilyGroups
);


// ======================================================
// CREACIÓN
// SOLO ADMIN
// ======================================================

router.post(
    '/',
    verifyToken,
    requireRoles('admin'),
    familyGroupController.createFamilyGroup
);

module.exports = router;