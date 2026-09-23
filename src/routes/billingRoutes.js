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