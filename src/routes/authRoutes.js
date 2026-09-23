const express = require('express');

const router = express.Router();

const authController = require('../controllers/authController');

const verifyToken = require('../middleware/authMiddleware');


// Login público
router.post(
    '/login',
    authController.login
);


// Obtener usuario autenticado
router.get(
    '/me',
    verifyToken,
    authController.me
);


module.exports = router;