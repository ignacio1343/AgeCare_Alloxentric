const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');


// ======================================================
// LOGIN
// ADMIN / ANALYST / CAREGIVER
// ======================================================

exports.login = async (req, res) => {

    const {
        email,
        password
    } = req.body;

    try {

        // ==================================================
        // VALIDAR CAMPOS
        // ==================================================

        if (!email || !password) {
            return res.status(400).json({
                message:
                    'Email y contraseña son obligatorios'
            });
        }


        const normalizedEmail =
            String(email)
                .trim()
                .toLowerCase();


        // ==================================================
        // 1. BUSCAR USUARIO ADMINISTRATIVO
        // admin / analyst
        // ==================================================

        const adminResult = await db.query(
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
            [
                normalizedEmail
            ]
        );


        // ==================================================
        // SI EXISTE EN admin_users
        // ==================================================

        if (adminResult.rows.length > 0) {

            const usuario =
                adminResult.rows[0];


            // ----------------------------------------------
            // CUENTA DESACTIVADA
            // ----------------------------------------------

            if (!usuario.is_active) {
                return res.status(403).json({
                    message:
                        'Esta cuenta se encuentra desactivada'
                });
            }


            // ----------------------------------------------
            // CUENTA BLOQUEADA
            // ----------------------------------------------

            if (
                usuario.locked_until &&
                new Date(usuario.locked_until) > new Date()
            ) {
                return res.status(403).json({
                    message:
                        'La cuenta está temporalmente bloqueada'
                });
            }


            // ----------------------------------------------
            // VALIDAR CONTRASEÑA
            // ----------------------------------------------

            const passwordValida =
                await bcrypt.compare(
                    password,
                    usuario.password_hash
                );


            if (!passwordValida) {

                const nuevosIntentos =
                    (usuario.failed_attempts || 0) + 1;


                if (nuevosIntentos >= 5) {

                    await db.query(
                        `
                        UPDATE admin.admin_users

                        SET
                            failed_attempts = $1,
                            locked_until =
                                NOW() + INTERVAL '15 minutes'

                        WHERE id = $2
                        `,
                        [
                            nuevosIntentos,
                            usuario.id
                        ]
                    );


                    return res.status(403).json({
                        message:
                            'Cuenta bloqueada temporalmente por demasiados intentos fallidos'
                    });
                }


                await db.query(
                    `
                    UPDATE admin.admin_users

                    SET failed_attempts = $1

                    WHERE id = $2
                    `,
                    [
                        nuevosIntentos,
                        usuario.id
                    ]
                );


                return res.status(401).json({
                    message:
                        'Correo o contraseña incorrectos'
                });
            }


            // ----------------------------------------------
            // LOGIN CORRECTO
            // ----------------------------------------------

            await db.query(
                `
                UPDATE admin.admin_users

                SET
                    failed_attempts = 0,
                    locked_until = NULL,
                    last_login_at = NOW()

                WHERE id = $1
                `,
                [
                    usuario.id
                ]
            );


            // ----------------------------------------------
            // JWT ADMINISTRATIVO
            // ----------------------------------------------

            const token = jwt.sign(
                {
                    id:
                        usuario.id,

                    email:
                        usuario.email,

                    role_code:
                        usuario.role_code,

                    tenant_id:
                        usuario.tenant_id,

                    user_type:
                        'admin'
                },

                process.env.JWT_SECRET,

                {
                    expiresIn: '8h'
                }
            );


            return res.status(200).json({
                message:
                    'Inicio de sesión exitoso',

                token,

                user: {
                    id:
                        usuario.id,

                    full_name:
                        usuario.full_name,

                    email:
                        usuario.email,

                    role_code:
                        usuario.role_code,

                    tenant_id:
                        usuario.tenant_id,

                    user_type:
                        'admin'
                }
            });
        }


        // ==================================================
        // 2. BUSCAR USUARIO DE APLICACIÓN
        // caregiver / futuros family, elder, doctor
        // ==================================================

        const appResult = await db.query(
            `
            SELECT
                au.id,
                au.tenant_id,
                au.email,
                au.role_code,
                au.password_hash,
                au.is_active,
                au.failed_attempts,
                au.locked_until,

                c.id AS caregiver_id,
                c.first_name,
                c.first_last_name,
                c.second_last_name,
                c.status AS caregiver_status

            FROM admin.app_users au

            LEFT JOIN admin.caregivers c
                ON c.app_user_id = au.id
                AND c.tenant_id = au.tenant_id

            WHERE LOWER(au.email) = LOWER($1)

            LIMIT 1
            `,
            [
                normalizedEmail
            ]
        );


        // ==================================================
        // USUARIO NO EXISTE EN NINGUNO
        // ==================================================

        if (appResult.rows.length === 0) {
            return res.status(401).json({
                message:
                    'Correo o contraseña incorrectos'
            });
        }


        const usuario =
            appResult.rows[0];


        // ==================================================
        // CUENTA APP DESACTIVADA
        // ==================================================

        if (!usuario.is_active) {
            return res.status(403).json({
                message:
                    'Esta cuenta se encuentra desactivada'
            });
        }


        // ==================================================
        // SI ES CUIDADOR, VALIDAR FICHA
        // ==================================================

        if (
            usuario.role_code === 'caregiver' &&
            (
                !usuario.caregiver_id ||
                usuario.caregiver_status !== 'active'
            )
        ) {
            return res.status(403).json({
                message:
                    'El perfil de cuidador no se encuentra activo'
            });
        }


        // ==================================================
        // BLOQUEO TEMPORAL
        // ==================================================

        if (
            usuario.locked_until &&
            new Date(usuario.locked_until) > new Date()
        ) {
            return res.status(403).json({
                message:
                    'La cuenta está temporalmente bloqueada'
            });
        }


        // ==================================================
        // CONTRASEÑA APP
        // ==================================================

        const passwordValida =
            await bcrypt.compare(
                password,
                usuario.password_hash
            );


        if (!passwordValida) {

            const nuevosIntentos =
                (usuario.failed_attempts || 0) + 1;


            if (nuevosIntentos >= 5) {

                await db.query(
                    `
                    UPDATE admin.app_users

                    SET
                        failed_attempts = $1,
                        locked_until =
                            NOW() + INTERVAL '15 minutes'

                    WHERE id = $2
                    `,
                    [
                        nuevosIntentos,
                        usuario.id
                    ]
                );


                return res.status(403).json({
                    message:
                        'Cuenta bloqueada temporalmente por demasiados intentos fallidos'
                });
            }


            await db.query(
                `
                UPDATE admin.app_users

                SET failed_attempts = $1

                WHERE id = $2
                `,
                [
                    nuevosIntentos,
                    usuario.id
                ]
            );


            return res.status(401).json({
                message:
                    'Correo o contraseña incorrectos'
            });
        }


        // ==================================================
        // LOGIN APP CORRECTO
        // ==================================================

        await db.query(
            `
            UPDATE admin.app_users

            SET
                failed_attempts = 0,
                locked_until = NULL,
                last_login_at = NOW()

            WHERE id = $1
            `,
            [
                usuario.id
            ]
        );


        // ==================================================
        // NOMBRE DEL USUARIO
        // ==================================================

        let fullName =
            usuario.email;


        if (usuario.role_code === 'caregiver') {

            fullName = [
                usuario.first_name,
                usuario.first_last_name,
                usuario.second_last_name
            ]
                .filter(Boolean)
                .join(' ');
        }


        // ==================================================
        // JWT APP
        // ==================================================

        const token = jwt.sign(
            {
                id:
                    usuario.id,

                email:
                    usuario.email,

                role_code:
                    usuario.role_code,

                tenant_id:
                    usuario.tenant_id,

                user_type:
                    'app',

                caregiver_id:
                    usuario.caregiver_id || null
            },

            process.env.JWT_SECRET,

            {
                expiresIn: '8h'
            }
        );


        return res.status(200).json({
            message:
                'Inicio de sesión exitoso',

            token,

            user: {
                id:
                    usuario.id,

                full_name:
                    fullName,

                email:
                    usuario.email,

                role_code:
                    usuario.role_code,

                tenant_id:
                    usuario.tenant_id,

                user_type:
                    'app',

                caregiver_id:
                    usuario.caregiver_id || null
            }
        });


    } catch (error) {

        console.error(
            'Error durante el login:',
            error
        );


        return res.status(500).json({
            message:
                'Error interno del servidor'
        });
    }
};


// ======================================================
// SESIÓN ACTUAL
// ======================================================

exports.me = async (req, res) => {

    try {

        // ==================================================
        // USUARIO ADMINISTRATIVO
        // ==================================================

        if (req.user.user_type === 'admin') {

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
                [
                    req.user.id
                ]
            );


            if (result.rows.length === 0) {
                return res.status(404).json({
                    message:
                        'Usuario no encontrado'
                });
            }


            const usuario =
                result.rows[0];


            if (!usuario.is_active) {
                return res.status(403).json({
                    message:
                        'Usuario desactivado'
                });
            }


            return res.status(200).json({
                user: {
                    ...usuario,
                    user_type: 'admin'
                }
            });
        }


        // ==================================================
        // USUARIO DE APLICACIÓN
        // ==================================================

        if (req.user.user_type === 'app') {

            const result = await db.query(
                `
                SELECT
                    au.id,
                    au.tenant_id,
                    au.email,
                    au.role_code,
                    au.is_active,
                    au.last_login_at,

                    c.id AS caregiver_id,
                    c.first_name,
                    c.first_last_name,
                    c.second_last_name,
                    c.status AS caregiver_status

                FROM admin.app_users au

                LEFT JOIN admin.caregivers c
                    ON c.app_user_id = au.id
                    AND c.tenant_id = au.tenant_id

                WHERE au.id = $1

                LIMIT 1
                `,
                [
                    req.user.id
                ]
            );


            if (result.rows.length === 0) {
                return res.status(404).json({
                    message:
                        'Usuario no encontrado'
                });
            }


            const usuario =
                result.rows[0];


            if (!usuario.is_active) {
                return res.status(403).json({
                    message:
                        'Usuario desactivado'
                });
            }


            if (
                usuario.role_code === 'caregiver' &&
                (
                    !usuario.caregiver_id ||
                    usuario.caregiver_status !== 'active'
                )
            ) {
                return res.status(403).json({
                    message:
                        'Perfil de cuidador desactivado'
                });
            }


            const fullName =
                [
                    usuario.first_name,
                    usuario.first_last_name,
                    usuario.second_last_name
                ]
                    .filter(Boolean)
                    .join(' ') ||
                usuario.email;


            return res.status(200).json({
                user: {
                    id:
                        usuario.id,

                    tenant_id:
                        usuario.tenant_id,

                    full_name:
                        fullName,

                    email:
                        usuario.email,

                    role_code:
                        usuario.role_code,

                    user_type:
                        'app',

                    caregiver_id:
                        usuario.caregiver_id,

                    last_login_at:
                        usuario.last_login_at
                }
            });
        }


        // ==================================================
        // TOKEN SIN TIPO RECONOCIDO
        // ==================================================

        return res.status(403).json({
            message:
                'Tipo de usuario no autorizado'
        });


    } catch (error) {

        console.error(
            'Error obteniendo sesión:',
            error
        );


        return res.status(500).json({
            message:
                'Error interno del servidor'
        });
    }
};