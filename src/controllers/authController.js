// src/controllers/authController.js

const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        // Validar campos
        if (!email || !password) {
            return res.status(400).json({
                message: 'Email y contraseña son obligatorios'
            });
        }

        // Buscar usuario por email
        const result = await db.query(
            `
            SELECT
                id,
                tenant_id,
                full_name,
                email,
                role_code,
                password_hash,
                is_active,
                failed_attempts,
                locked_until
            FROM admin.admin_users
            WHERE LOWER(email) = LOWER($1)
            LIMIT 1
            `,
            [email]
        );

        // Usuario inexistente
        if (result.rows.length === 0) {
            return res.status(401).json({
                message: 'Correo o contraseña incorrectos'
            });
        }

        const usuario = result.rows[0];

        // Usuario desactivado
        if (!usuario.is_active) {
            return res.status(403).json({
                message: 'Esta cuenta se encuentra desactivada'
            });
        }

        // Usuario temporalmente bloqueado
        if (
            usuario.locked_until &&
            new Date(usuario.locked_until) > new Date()
        ) {
            return res.status(403).json({
                message: 'La cuenta está temporalmente bloqueada'
            });
        }

        // Comparar contraseña con bcrypt
        const passwordValida = await bcrypt.compare(
            password,
            usuario.password_hash
        );

        // Contraseña incorrecta
        if (!passwordValida) {

            const nuevosIntentos = (usuario.failed_attempts || 0) + 1;

            // Bloquear 15 minutos después de 5 intentos
            if (nuevosIntentos >= 5) {

                await db.query(
                    `
                    UPDATE admin.admin_users
                    SET
                        failed_attempts = $1,
                        locked_until = NOW() + INTERVAL '15 minutes'
                    WHERE id = $2
                    `,
                    [nuevosIntentos, usuario.id]
                );

                return res.status(403).json({
                    message: 'Cuenta bloqueada temporalmente por demasiados intentos fallidos'
                });
            }

            await db.query(
                `
                UPDATE admin.admin_users
                SET failed_attempts = $1
                WHERE id = $2
                `,
                [nuevosIntentos, usuario.id]
            );

            return res.status(401).json({
                message: 'Correo o contraseña incorrectos'
            });
        }

        // Login correcto: reiniciar intentos
        await db.query(
            `
            UPDATE admin.admin_users
            SET
                failed_attempts = 0,
                locked_until = NULL,
                last_login_at = NOW()
            WHERE id = $1
            `,
            [usuario.id]
        );

        // Generar JWT
        const token = jwt.sign(
            {
                id: usuario.id,
                email: usuario.email,
                role_code: usuario.role_code,
                tenant_id: usuario.tenant_id
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '8h'
            }
        );

        // Respuesta al frontend
        return res.status(200).json({
            message: 'Inicio de sesión exitoso',
            token: token,
            user: {
                id: usuario.id,
                full_name: usuario.full_name,
                email: usuario.email,
                role_code: usuario.role_code,
                tenant_id: usuario.tenant_id
            }
        });

    } catch (error) {

        console.error('Error durante el login:', error);

        return res.status(500).json({
            message: 'Error interno del servidor'
        });
    }
};


exports.me = async (req, res) => {

    try {

        const result = await db.query(
            `
            SELECT
                id,
                tenant_id,
                full_name,
                email,
                role_code,
                is_active,
                last_login_at
            FROM admin.admin_users
            WHERE id = $1
            LIMIT 1
            `,
            [req.user.id]
        );

        if (result.rows.length === 0) {

            return res.status(404).json({
                message: 'Usuario no encontrado'
            });

        }

        const usuario = result.rows[0];

        if (!usuario.is_active) {

            return res.status(403).json({
                message: 'Usuario desactivado'
            });

        }

        return res.status(200).json({
            user: usuario
        });

    } catch (error) {

        console.error(
            'Error obteniendo sesión:',
            error
        );

        return res.status(500).json({
            message: 'Error interno del servidor'
        });

    }

};