const express = require('express');
const router = express.Router();

const billingController =
    require('../controllers/billingController');

const verifyToken =
    require('../middleware/authMiddleware');

const requireRoles =
    require('../middleware/roleMiddleware');


// ======================================================
// LECTURA
// ADMIN + ANALYST
// ======================================================

router.get(
    '/plans',
    verifyToken,
    requireRoles('admin', 'analyst'),
    billingController.getPlans
);

router.get(
    '/subscriptions',
    verifyToken,
    requireRoles('admin', 'analyst'),
    billingController.getSubscriptions
);

router.get(
    '/transactions',
    verifyToken,
    requireRoles('admin', 'analyst'),
    billingController.getTransactions
);

router.get(
    '/metrics',
    verifyToken,
    requireRoles('admin', 'analyst'),
    billingController.getMetrics
);

router.get(
    '/commercial-metrics',
    verifyToken,
    requireRoles('admin', 'analyst'),
    billingController.getCommercialMetrics
);


// ======================================================
// MODIFICACIONES
// SOLO ADMIN
// ======================================================

router.put(
    '/subscriptions/:id/plan',
    verifyToken,
    requireRoles('admin'),
    billingController.updateSubscriptionPlan
);

router.post(
    '/transactions/:id/refund',
    verifyToken,
    requireRoles('admin'),
    billingController.refundTransaction
);

router.post(
    '/subscriptions/:id/cancel',
    verifyToken,
    requireRoles('admin'),
    billingController.cancelSubscription
);


// ======================================================
// EXPORTAR ROUTER
// ======================================================

module.exports = router;