const express = require('express');
const router = express.Router();

const auditController =
    require('../controllers/auditController');

const verifyToken =
    require('../middleware/authMiddleware');

const requireRoles =
    require('../middleware/roleMiddleware');

router.get(
    '/audit',
    verifyToken,
    requireRoles('admin', 'analyst'),
    auditController.getAuditLog
);

module.exports = router;