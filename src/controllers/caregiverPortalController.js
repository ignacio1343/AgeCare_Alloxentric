const db = require('../config/db');
const {createCriticalResidentNotification} = require('../services/notificationService');

// ======================================================
// OBTENER MIS RESIDENTES
// USUARIO: CAREGIVER
// ======================================================

exports.getMyResidents = async (req, res) => {

    try {

        // ==================================================
        // PROTECCIÓN EXTRA
        // ==================================================

        if (
            req.user.user_type !== 'app' ||
            req.user.role_code !== 'caregiver'
        ) {

            return res.status(403).json({
                message:
                    'Acceso exclusivo para cuidadores'
            });

        }


        const appUserId =
            req.user.id;

        const tenantId =
            req.user.tenant_id;


        // ==================================================
        // OBTENER PERFIL DEL CUIDADOR
        // ==================================================

        const caregiverResult =
            await db.query(
                `
                SELECT
                    c.id,
                    c.first_name,
                    c.first_last_name,
                    c.second_last_name,
                    c.phone,
                    c.status,
                    au.email

                FROM admin.caregivers c

                INNER JOIN admin.app_users au
                    ON au.id = c.app_user_id
                    AND au.tenant_id = c.tenant_id

                WHERE au.id = $1
                  AND au.tenant_id = $2
                  AND au.role_code = 'caregiver'
                  AND au.is_active = true
                  AND c.status = 'active'

                LIMIT 1
                `,
                [
                    appUserId,
                    tenantId
                ]
            );


        if (
            caregiverResult.rows.length === 0
        ) {

            return res.status(404).json({
                message:
                    'Perfil de cuidador no encontrado o inactivo'
            });

        }


        const caregiver =
            caregiverResult.rows[0];


        // ==================================================
        // OBTENER SOLO LOS RESIDENTES ASIGNADOS
        // ==================================================

        const residentsResult =
            await db.query(
                `
                SELECT
                    r.id,

                    r.run_number,
                    r.check_digit,

                    r.first_name,
                    r.first_last_name,
                    r.second_last_name,

                    r.birth_date,
                    r.plan_started_at,
                    r.health_notes,
                    r.status,

                    fg.id AS family_group_id,
                    fg.name AS family_group_name

                FROM admin.caregiver_family_groups cfg

                INNER JOIN admin.family_groups fg
                    ON fg.id = cfg.family_group_id
                    AND fg.tenant_id = cfg.tenant_id

                INNER JOIN admin.residents r
                    ON r.family_group_id = fg.id
                    AND r.tenant_id = fg.tenant_id

                WHERE cfg.caregiver_id = $1
                  AND cfg.tenant_id = $2

                  AND cfg.status = 'active'
                  AND fg.status = 'active'
                  AND r.status = 'active'

                ORDER BY
                    fg.name ASC,
                    r.first_last_name ASC,
                    r.first_name ASC
                `,
                [
                    caregiver.id,
                    tenantId
                ]
            );


        // ==================================================
        // NOMBRE COMPLETO DEL CUIDADOR
        // ==================================================

        const caregiverFullName =
            [
                caregiver.first_name,
                caregiver.first_last_name,
                caregiver.second_last_name
            ]
                .filter(Boolean)
                .join(' ');


        // ==================================================
        // RESPUESTA
        // ==================================================

        return res.status(200).json({

            caregiver: {
                id:
                    caregiver.id,

                full_name:
                    caregiverFullName,

                email:
                    caregiver.email,

                phone:
                    caregiver.phone
            },

            total:
                residentsResult.rows.length,

            residents:
                residentsResult.rows

        });


    } catch (error) {

        console.error(
            'Error obteniendo residentes del cuidador:',
            error
        );


        return res.status(500).json({message:'Error interno obteniendo los residentes asignados'});}

};



// ======================================================
// OBTENER FICHA DE UN RESIDENTE ASIGNADO
// SOLO CAREGIVER
// ======================================================

exports.getResidentDetail = async (req, res) => {

    try {

        if (
            req.user.user_type !== 'app' ||
            req.user.role_code !== 'caregiver'
        ) {

            return res.status(403).json({
                message:
                    'Acceso exclusivo para cuidadores'
            });

        }


        const tenantId =
            req.user.tenant_id;

        const appUserId =
            req.user.id;

        const residentId =
            req.params.id;


        // ==============================================
        // IDENTIFICAR CUIDADOR
        // ==============================================

        const caregiverResult =
            await db.query(
                `
                SELECT
                    c.id,
                    c.first_name,
                    c.first_last_name,
                    c.second_last_name

                FROM admin.caregivers c

                INNER JOIN admin.app_users au
                    ON au.id = c.app_user_id
                    AND au.tenant_id = c.tenant_id

                WHERE au.id = $1
                  AND au.tenant_id = $2
                  AND au.role_code = 'caregiver'
                  AND au.is_active = true
                  AND c.status = 'active'

                LIMIT 1
                `,
                [
                    appUserId,
                    tenantId
                ]
            );


        if (caregiverResult.rows.length === 0) {

            return res.status(404).json({
                message:
                    'Perfil de cuidador no encontrado'
            });

        }


        const caregiver =
            caregiverResult.rows[0];


        // ==============================================
        // BUSCAR RESIDENTE SOLO SI ESTÁ ASIGNADO
        // ==============================================

        const residentResult =
            await db.query(
                `
                SELECT
                    r.id,
                    r.run_number,
                    r.check_digit,

                    r.first_name,
                    r.first_last_name,
                    r.second_last_name,

                    r.birth_date,
                    r.plan_started_at,
                    r.health_notes,
                    r.status,

                    fg.id AS family_group_id,
                    fg.name AS family_group_name

                FROM admin.residents r

                INNER JOIN admin.family_groups fg
                    ON fg.id = r.family_group_id
                    AND fg.tenant_id = r.tenant_id

                INNER JOIN admin.caregiver_family_groups cfg
                    ON cfg.family_group_id = fg.id
                    AND cfg.tenant_id = fg.tenant_id

                WHERE r.id = $1
                  AND r.tenant_id = $2
                  AND cfg.caregiver_id = $3

                  AND cfg.status = 'active'
                  AND fg.status = 'active'
                  AND r.status = 'active'

                LIMIT 1
                `,
                [
                    residentId,
                    tenantId,
                    caregiver.id
                ]
            );


        if (residentResult.rows.length === 0) {

            return res.status(403).json({
                message:
                    'No tienes autorización para acceder a este residente'
            });

        }


        const resident =
            residentResult.rows[0];


        // ==============================================
        // ESTADO ACTUAL
        // ==============================================

        const currentStatusResult =
            await db.query(
                `
                SELECT
                    rcs.status_code,
                    rcs.observation,
                    rcs.updated_at,

                    c.first_name AS caregiver_first_name,
                    c.first_last_name AS caregiver_last_name

                FROM admin.resident_current_status rcs

                INNER JOIN admin.caregivers c
                    ON c.id = rcs.caregiver_id

                WHERE rcs.resident_id = $1
                  AND rcs.tenant_id = $2

                LIMIT 1
                `,
                [
                    residentId,
                    tenantId
                ]
            );


        // ==============================================
        // ÚLTIMOS 10 CAMBIOS
        // ==============================================

        const historyResult =
            await db.query(
                `
                SELECT
                    rsh.id,
                    rsh.status_code,
                    rsh.observation,
                    rsh.created_at,

                    c.first_name AS caregiver_first_name,
                    c.first_last_name AS caregiver_last_name

                FROM admin.resident_status_history rsh

                INNER JOIN admin.caregivers c
                    ON c.id = rsh.caregiver_id

                WHERE rsh.resident_id = $1
                  AND rsh.tenant_id = $2

                ORDER BY
                    rsh.created_at DESC

                LIMIT 10
                `,
                [
                    residentId,
                    tenantId
                ]
            );


        return res.status(200).json({

            resident,

            current_status:
                currentStatusResult.rows[0] ||
                null,

            status_history:
                historyResult.rows

        });


    } catch (error) {

        console.error(
            'Error obteniendo ficha del residente:',
            error
        );


        return res.status(500).json({
            message:
                'Error interno obteniendo la ficha del residente'
        });

    }

};


// ======================================================
// REGISTRAR ESTADO DE RESIDENTE
// SOLO CAREGIVER
// ======================================================

exports.updateResidentStatus = async (req, res) => {

    const client =
        await db.connect();


    try {

        if (
            req.user.user_type !== 'app' ||
            req.user.role_code !== 'caregiver'
        ) {

            return res.status(403).json({
                message:
                    'Acceso exclusivo para cuidadores'
            });

        }


        const tenantId =
            req.user.tenant_id;

        const appUserId =
            req.user.id;

        const residentId =
            req.params.id;


        const {
            status_code,
            observation = null
        } = req.body;


        // ==============================================
        // VALIDAR ESTADO
        // ==============================================

        const validStatuses = [
            'NORMAL',
            'ALERTA',
            'RIESGOSO'
        ];


        const normalizedStatus =
            String(
                status_code || ''
            )
                .trim()
                .toUpperCase();


        if (
            !validStatuses.includes(
                normalizedStatus
            )
        ) {

            return res.status(400).json({
                message:
                    'Estado no válido. Debe ser NORMAL, ALERTA o RIESGOSO'
            });

        }


        const normalizedObservation =
            observation
                ? String(observation).trim()
                : null;


        if (
            normalizedObservation &&
            normalizedObservation.length > 1000
        ) {

            return res.status(400).json({
                message:
                    'La observación no puede superar los 1000 caracteres'
            });

        }


        await client.query('BEGIN');


        // ==============================================
        // IDENTIFICAR CUIDADOR
        // ==============================================

        const caregiverResult =
            await client.query(
                `
                SELECT
                    c.id,
                    c.first_name,
                    c.first_last_name,
                    c.second_last_name

                FROM admin.caregivers c

                INNER JOIN admin.app_users au
                    ON au.id = c.app_user_id
                    AND au.tenant_id = c.tenant_id

                WHERE au.id = $1
                  AND au.tenant_id = $2
                  AND au.role_code = 'caregiver'
                  AND au.is_active = true
                  AND c.status = 'active'

                LIMIT 1
                `,
                [
                    appUserId,
                    tenantId
                ]
            );


        if (caregiverResult.rows.length === 0) {

            await client.query('ROLLBACK');

            return res.status(404).json({
                message:
                    'Perfil de cuidador no encontrado'
            });

        }


        const caregiver =
            caregiverResult.rows[0];


        // ==============================================
        // VALIDAR ASIGNACIÓN DEL RESIDENTE
        // ==============================================

        const residentResult =
            await client.query(
                `
                SELECT
                    r.id,
                    r.first_name,
                    r.first_last_name

                FROM admin.residents r

                INNER JOIN admin.family_groups fg
                    ON fg.id = r.family_group_id
                    AND fg.tenant_id = r.tenant_id

                INNER JOIN admin.caregiver_family_groups cfg
                    ON cfg.family_group_id = fg.id
                    AND cfg.tenant_id = fg.tenant_id

                WHERE r.id = $1
                  AND r.tenant_id = $2
                  AND cfg.caregiver_id = $3

                  AND r.status = 'active'
                  AND fg.status = 'active'
                  AND cfg.status = 'active'

                LIMIT 1
                `,
                [
                    residentId,
                    tenantId,
                    caregiver.id
                ]
            );


        if (residentResult.rows.length === 0) {

            await client.query('ROLLBACK');

            return res.status(403).json({
                message:
                    'No tienes autorización para modificar este residente'
            });

        }

        // ==============================================
        // OBTENER ESTADO ANTERIOR
        // ==============================================

        const previousStatusResult =
            await client.query(
                `
                SELECT status_code
                FROM admin.resident_current_status
                WHERE resident_id = $1
                AND tenant_id = $2
                LIMIT 1
                FOR UPDATE
                `,
                [
                    residentId,
                    tenantId
                ]
            );

        const previousStatus =
            previousStatusResult.rows[0]?.status_code || null;




        // ==============================================
        // INSERTAR HISTORIAL
        // ==============================================

        const historyResult =
            await client.query(
                `
                INSERT INTO admin.resident_status_history (
                    tenant_id,
                    resident_id,
                    caregiver_id,
                    status_code,
                    observation
                )

                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5
                )

                RETURNING *
                `,
                [
                    tenantId,
                    residentId,
                    caregiver.id,
                    normalizedStatus,
                    normalizedObservation
                ]
            );


        // ==============================================
        // ACTUALIZAR ESTADO ACTUAL
        // ==============================================

        const currentResult =
            await client.query(
                `
                INSERT INTO admin.resident_current_status (
                    resident_id,
                    tenant_id,
                    caregiver_id,
                    status_code,
                    observation,
                    updated_at
                )

                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    CURRENT_TIMESTAMP
                )

                ON CONFLICT (resident_id)

                DO UPDATE SET
                    tenant_id =
                        EXCLUDED.tenant_id,

                    caregiver_id =
                        EXCLUDED.caregiver_id,

                    status_code =
                        EXCLUDED.status_code,

                    observation =
                        EXCLUDED.observation,

                    updated_at =
                        CURRENT_TIMESTAMP

                RETURNING *
                `,
                [
                    residentId,
                    tenantId,
                    caregiver.id,
                    normalizedStatus,
                    normalizedObservation
                ]
            );


        await client.query('COMMIT');


            // ==============================================
            // CREAR ALERTA CRÍTICA SI CORRESPONDE
            // ==============================================

            let notificationResult = null;

            if (
                normalizedStatus === 'RIESGOSO' &&
                previousStatus !== 'RIESGOSO'
            ) {
                try {

                    notificationResult =
                        await createCriticalResidentNotification({
                            tenantId,
                            residentId,
                            statusHistoryId:
                                historyResult.rows[0].id,
                            observation:
                                normalizedObservation
                        });

                    console.log(
                        'Resultado notificación crítica:',
                        notificationResult
                    );

                } catch (notificationError) {

                    console.error(
                        'El estado fue guardado, pero no fue posible generar la notificación crítica:',
                        notificationError
                    );

                    notificationResult = {
                        created: false,
                        duplicate: false,
                        error: true
                    };

                }

            }


            // ==============================================
            // NOMBRE DEL CUIDADOR
            // ==============================================

            const caregiverName =
                [
                    caregiver.first_name,
                    caregiver.first_last_name,
                    caregiver.second_last_name
                ]
                    .filter(Boolean)
                    .join(' ');


            return res.status(200).json({

                message:
                    'Estado del residente actualizado correctamente',

                current_status: {
                    ...currentResult.rows[0],
                    caregiver_name:
                        caregiverName
                },

                history_entry:
                    historyResult.rows[0],

                critical_notification:
                    normalizedStatus === 'RIESGOSO'
                        ? notificationResult
                        : null

            });


    } catch (error) {

        await client.query('ROLLBACK');


        console.error(
            'Error actualizando estado del residente:',
            error
        );


        return res.status(500).json({
            message:
                'Error interno actualizando el estado del residente'
        });


    } finally {

        client.release();

    }

};