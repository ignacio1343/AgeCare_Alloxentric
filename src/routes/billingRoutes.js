const express = require('express');

const router = express.Router();

const billingController =
    require('../controllers/billingController');

const verifyToken =
    require('../middleware/authMiddleware');


// Todas las rutas necesitan JWT
router.get(
    '/plans',
    verifyToken,
    billingController.getPlans
);

router.get(
    '/subscriptions',
    verifyToken,
    billingController.getSubscriptions
);

router.get(
    '/transactions',
    verifyToken,
    billingController.getTransactions
);

router.get(
    '/metrics',
    verifyToken,
    billingController.getMetrics
);

module.exports = router;

router.put(
    '/subscriptions/:id/plan',
    verifyToken,
    billingController.updateSubscriptionPlan
);

router.get(
    '/commercial-metrics',
    verifyToken,
    billingController.getCommercialMetrics
);

router.post(
    '/transactions/:id/refund',
    verifyToken,
    billingController.refundTransaction
);

router.post(
    '/subscriptions/:id/cancel',
    verifyToken,
    billingController.cancelSubscription
);