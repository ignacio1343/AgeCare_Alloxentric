const db = require('../config/db');
const bcrypt = require('bcrypt');


// ======================================================
// VALIDAR RUN CHILENO
// ======================================================

function validateRun(runNumber, checkDigit) {
    const run = String(runNumber || '')
        .replace(/\D/g, '');

    const dv = String(checkDigit || '')
        .trim()
        .toUpperCase();

    if (!/^\d{7,8}$/.test(run)) {
        return false;
    }

    if (!/^[0-9K]$/.test(dv)) {
        return false;
    }

    let sum = 0;
    let multiplier = 2;

    for (let i = run.length - 1; i >= 0; i--) {
        sum += Number(run[i]) * multiplier;

        multiplier++;

        if (multiplier > 7) {
            multiplier = 2;
        }
    }

    const result = 11 - (sum % 11);

    let expectedDv;

    if (result === 11) {
        expectedDv = '0';
    } else if (result === 10) {
        expectedDv = 'K';
    } else {
        expectedDv = String(result);
    }

    return dv === expectedDv;
}


// ======================================================
// NORMALIZAR TELÉFONO CHILENO
// ======================================================

function normalizePhone(phone) {
    if (!phone) {
        return null;
    }

    let digits = String(phone)
        .replace(/\D/g, '');

    if (
        digits.length === 9 &&
        digits.startsWith('9')
    ) {
        digits = `56${digits}`;
    }

    if (!/^569\d{8}$/.test(digits)) {
        return null;
    }

    return `+${digits}`;
}


// ======================================================
// LISTAR CUIDADORES
// ADMIN + ANALYST
// ======================================================

exports.getCaregivers = async (req, res) => {
    try {
        const tenantId = req.user.tenant_id;
        const result = await db.query(`
            SELECT
                c.id,
                c.run_number,
                c.check_digit,
                c.first_name,
                c.first_last_name,
                c.second_last_name,
                c.phone,
                c.birth_date,
                c.status,
                c.created_at,

                au.id AS app_user_id,
                au.email,
                au.role_code,
                au.is_active AS user_is_active,
                au.last_login_at,

                COUNT(cfg.id) FILTER (
                    WHERE cfg.status = 'active'
                )::INTEGER AS assigned_family_groups

            FROM admin.caregivers c

            JOIN admin.app_users au
                ON au.id = c.app_user_id
                AND au.tenant_id = c.tenant_id

            LEFT JOIN admin.caregiver_family_groups cfg
                ON cfg.caregiver_id = c.id
                AND cfg.tenant_id = c.tenant_id

            WHERE c.tenant_id = $1

            GROUP BY
                c.id,
                au.id

            ORDER BY
                c.first_last_name,
                c.first_name
        `, [
            tenantId
        ]);

        return res.status(200).json({
            caregivers: result.rows
        });

    } catch (error) {console.error('Error obteniendo cuidadores:',error
        );

        return res.status(500).json({message:'Error obteniendo los cuidadores'
        });
    }
};


// ======================================================
// CREAR CUIDADOR
// SOLO ADMIN
// ======================================================

exports.createCaregiver = async (req, res) => {
    const tenantId = req.user.tenant_id;
    const adminId = req.user.id;
    const adminRole = req.user.role_code;

    const {
        run_number,
        check_digit,

        first_name,
        first_last_name,
        second_last_name = null,

        phone = null,
        birth_date = null,

        email,
        password
    } = req.body;


    // ==================================================
    // VALIDACIONES
    // ==================================================

    if (
        !run_number ||
        !check_digit ||
        !first_name ||
        !first_last_name ||
        !email ||
        !password
    ) {
        return res.status(400).json({message:'Faltan datos obligatorios del cuidador'});
    }

    if (
        !validateRun(
            run_number,
            check_digit
        )
    ) {
        return res.status(400).json({message:'El RUN o dígito verificador no es válido'
        });
    }

    if (String(password).length < 8) {
        return res.status(400).json({
            message:'La contraseña debe tener al menos 8 caracteres'});
    }

    const normalizedRun =
        String(run_number)
            .replace(/\D/g, '');

    const normalizedDv =
        String(check_digit)
            .trim()
            .toUpperCase();

    const normalizedEmail =
        String(email)
            .trim()
            .toLowerCase();

    const normalizedPhone =
        phone
            ? normalizePhone(phone)
            : null;

    if (
        phone &&
        !normalizedPhone
    ) {
        return res.status(400).json({message:'El teléfono ingresado no tiene un formato chileno válido'});
    }


    const client =
        await db.connect();

    try {
        await client.query('BEGIN');


        // ==================================================
        // COMPROBAR EMAIL
        // ==================================================

        const emailResult =
            await client.query(`
                SELECT id
                FROM admin.app_users
                WHERE tenant_id = $1
                AND email = $2
                LIMIT 1
            `, [
                tenantId,
                normalizedEmail
            ]);

        if (emailResult.rows.length > 0) {
            await client.query('ROLLBACK');

            return res.status(409).json({message:'Ya existe un usuario con este correo electrónico'});
        }


        // ==================================================
        // COMPROBAR RUN
        // ==================================================

        const runResult =
            await client.query(`
                SELECT id
                FROM admin.caregivers
                WHERE tenant_id = $1
                AND run_number = $2
                AND UPPER(check_digit) = $3
                LIMIT 1
            `, [
                tenantId,
                normalizedRun,
                normalizedDv
            ]);

        if (runResult.rows.length > 0) {
            await client.query('ROLLBACK');

            return res.status(409).json({message:'Ya existe un cuidador registrado con este RUN'});
        }


        // ==================================================
        // HASH DE CONTRASEÑA
        // ==================================================

        const passwordHash =
            await bcrypt.hash(
                String(password),
                10
            );


        // ==================================================
        // CREAR USUARIO DE APLICACIÓN
        // ==================================================

        const userResult =
            await client.query(`
                INSERT INTO admin.app_users (
                    tenant_id,
                    role_code,
                    email,
                    password_hash,
                    is_active,
                    created_by
                )
                VALUES (
                    $1,
                    'caregiver',
                    $2,
                    $3,
                    true,
                    $4
                )
                RETURNING
                    id,
                    role_code,
                    email,
                    is_active,
                    created_at
            `, [
                tenantId,
                normalizedEmail,
                passwordHash,
                adminId
            ]);

        const appUser =
            userResult.rows[0];


        // ==================================================
        // CREAR FICHA CUIDADOR
        // ==================================================

        const caregiverResult =
            await client.query(`
                INSERT INTO admin.caregivers (
                    tenant_id,
                    app_user_id,
                    run_number,
                    check_digit,
                    first_name,
                    first_last_name,
                    second_last_name,
                    phone,
                    birth_date,
                    status,
                    created_by
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9,
                    'active',
                    $10
                )
                RETURNING *
            `, [
                tenantId,
                appUser.id,
                normalizedRun,
                normalizedDv,
                first_name.trim(),
                first_last_name.trim(),
                second_last_name?.trim() || null,
                normalizedPhone,
                birth_date || null,
                adminId
            ]);

        const caregiver =
            caregiverResult.rows[0];


        // ==================================================
        // ADMINISTRADOR
        // ==================================================

        const adminResult =
            await client.query(`
                SELECT full_name
                FROM admin.admin_users
                WHERE id = $1
                AND tenant_id = $2
                LIMIT 1
            `, [
                adminId,
                tenantId
            ]);

        const actorName =
            adminResult.rows[0]?.full_name ||
            null;


        // ==================================================
        // AUDITORÍA
        // ==================================================

        await client.query(`
            INSERT INTO admin.audit_log (
                tenant_id,
                actor_id,
                actor_name,
                actor_role,
                action,
                entity_type,
                entity_id,
                before,
                after,
                ip,
                user_agent
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                'caregiver_created',
                'caregiver',
                $5,
                NULL,
                $6::jsonb,
                $7,
                $8
            )
        `, [
            tenantId,
            adminId,
            actorName,
            adminRole,
            caregiver.id,

            JSON.stringify({
                name:
                    `${caregiver.first_name} ${caregiver.first_last_name}`,

                run:
                    `${caregiver.run_number}-${caregiver.check_digit}`,

                email:
                    appUser.email,

                role_code:
                    appUser.role_code,

                status:
                    caregiver.status
            }),

            req.ip || null,
            req.get('user-agent') || null
        ]);


        await client.query('COMMIT');


        return res.status(201).json({message:'Cuidador creado correctamente',

            caregiver: {
                ...caregiver,

                email:
                    appUser.email,

                role_code:
                    appUser.role_code,

                user_is_active:
                    appUser.is_active
            }
        });

    } catch (error) {

        await client.query('ROLLBACK');

        console.error('Error creando cuidador:',error
        );

        return res.status(500).json({
            message:'Error interno creando el cuidador'
        });

    } finally {
        client.release();
    }
};


// ======================================================
// ASIGNAR CUIDADOR A NÚCLEO FAMILIAR
// SOLO ADMIN
// ======================================================

exports.assignFamilyGroup = async (req, res) => {
    const tenantId = req.user.tenant_id;
    const adminId = req.user.id;
    const adminRole = req.user.role_code;

    const caregiverId = req.params.id;

    const {
        family_group_id
    } = req.body;

    if (!family_group_id) {
        return res.status(400).json({
            message:
                'Debe seleccionar un núcleo familiar'
        });
    }

    const client = await db.connect();

    try {
        await client.query('BEGIN');


        // ==================================================
        // COMPROBAR CUIDADOR
        // ==================================================

        const caregiverResult =
            await client.query(`
                SELECT
                    c.id,
                    c.first_name,
                    c.first_last_name,
                    c.status,
                    au.email,
                    au.role_code,
                    au.is_active
                FROM admin.caregivers c

                JOIN admin.app_users au
                    ON au.id = c.app_user_id
                    AND au.tenant_id = c.tenant_id

                WHERE c.id = $1
                  AND c.tenant_id = $2
                LIMIT 1
            `, [
                caregiverId,
                tenantId
            ]);

        if (caregiverResult.rows.length === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                message:
                    'Cuidador no encontrado'
            });
        }

        const caregiver =
            caregiverResult.rows[0];

        if (
            caregiver.status !== 'active' ||
            caregiver.is_active  === false
        ) {
            await client.query('ROLLBACK');

            return res.status(400).json({
                message:
                    'El cuidador no se encuentra activo'
            });
        }


        // ==================================================
        // COMPROBAR NÚCLEO FAMILIAR
        // ==================================================

        const familyResult =
            await client.query(`
                SELECT
                    id,
                    name,
                    status
                FROM admin.family_groups
                WHERE id = $1
                  AND tenant_id = $2
                LIMIT 1
            `, [
                family_group_id,
                tenantId
            ]);

        if (familyResult.rows.length === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                message:
                    'Núcleo familiar no encontrado'
            });
        }

        const familyGroup =
            familyResult.rows[0];

        if (familyGroup.status !== 'active') {
            await client.query('ROLLBACK');

            return res.status(400).json({
                message:
                    'El núcleo familiar no se encuentra activo'
            });
        }


        // ==================================================
        // COMPROBAR SI EL NÚCLEO YA TIENE CUIDADOR ACTIVO
        // ==================================================

        const existingAssignment =
            await client.query(`
                SELECT
                    cfg.id,
                    cfg.caregiver_id,
                    c.first_name,
                    c.first_last_name

                FROM admin.caregiver_family_groups cfg

                JOIN admin.caregivers c
                    ON c.id = cfg.caregiver_id

                WHERE cfg.family_group_id = $1
                  AND cfg.tenant_id = $2
                  AND cfg.status = 'active'

                LIMIT 1
            `, [
                family_group_id,
                tenantId
            ]);

        if (existingAssignment.rows.length > 0) {
            const existing =
                existingAssignment.rows[0];

            await client.query('ROLLBACK');

            return res.status(409).json({
                message:
                    `Este núcleo ya tiene asignado al cuidador ${existing.first_name} ${existing.first_last_name}`
            });
        }


        // ==================================================
        // CREAR ASIGNACIÓN
        // ==================================================

        const assignmentResult =
            await client.query(`
                INSERT INTO admin.caregiver_family_groups (
                    tenant_id,
                    caregiver_id,
                    family_group_id,
                    assigned_by,
                    assigned_at,
                    status
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    CURRENT_TIMESTAMP,
                    'active'
                )
                RETURNING *
            `, [
                tenantId,
                caregiverId,
                family_group_id,
                adminId
            ]);

        const assignment =
            assignmentResult.rows[0];


        // ==================================================
        // ADMINISTRADOR
        // ==================================================

        const adminResult =
            await client.query(`
                SELECT full_name
                FROM admin.admin_users
                WHERE id = $1
                  AND tenant_id = $2
                LIMIT 1
            `, [
                adminId,
                tenantId
            ]);

        const actorName =
            adminResult.rows[0]?.full_name ||
            null;


        // ==================================================
        // AUDITORÍA
        // ==================================================

        await client.query(`
            INSERT INTO admin.audit_log (
                tenant_id,
                actor_id,
                actor_name,
                actor_role,
                action,
                entity_type,
                entity_id,
                before,
                after,
                ip,
                user_agent
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                'caregiver_family_group_assigned',
                'caregiver_family_group',
                $5,
                NULL,
                $6::jsonb,
                $7,
                $8
            )
        `, [
            tenantId,
            adminId,
            actorName,
            adminRole,
            assignment.id,

            JSON.stringify({
                caregiver_id:
                    caregiver.id,

                caregiver_name:
                    `${caregiver.first_name} ${caregiver.first_last_name}`,

                family_group_id:
                    familyGroup.id,

                family_group_name:
                    familyGroup.name,

                status:
                    assignment.status
            }),

            req.ip || null,
            req.get('user-agent') || null
        ]);


        await client.query('COMMIT');


        return res.status(201).json({
            message:
                'Cuidador asignado al núcleo familiar correctamente',

            assignment: {
                ...assignment,

                caregiver_name:
                    `${caregiver.first_name} ${caregiver.first_last_name}`,

                family_group_name:
                    familyGroup.name
            }
        });

    } catch (error) {

        await client.query('ROLLBACK');

        console.error(
            'Error asignando cuidador:',
            error
        );

        return res.status(500).json({
            message:
                'Error interno asignando el cuidador'
        });

    } finally {
        client.release();
    }
};