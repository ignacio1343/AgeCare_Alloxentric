const db = require('../config/db');


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
// LISTAR RESIDENTES
// ADMIN + ANALYST
// ======================================================
exports.getResidents = async (req, res) => {
    try {
        const tenantId = req.user.tenant_id;

        const result = await db.query(`
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
                r.created_at,

                fg.id AS family_group_id,
                fg.name AS family_group_name,

                ba.id AS billing_account_id,
                ba.display_name AS billing_account_name,

                COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', a.id,
                                'name', a.name,
                                'notes', ra.notes
                            )
                            ORDER BY a.name
                        )
                        FROM admin.resident_allergies ra
                        JOIN admin.allergies a
                            ON a.id = ra.allergy_id
                        WHERE ra.resident_id = r.id
                    ),
                    '[]'::jsonb
                ) AS allergies,

                COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', hc.id,
                                'condition_name', hc.condition_name,
                                'notes', hc.notes,
                                'diagnosed_at', hc.diagnosed_at,
                                'is_active', hc.is_active
                            )
                            ORDER BY hc.condition_name
                        )
                        FROM admin.resident_health_conditions hc
                        WHERE hc.resident_id = r.id
                        AND hc.is_active = true
                    ),
                    '[]'::jsonb
                ) AS health_conditions

            FROM admin.residents r

            JOIN admin.family_groups fg
                ON fg.id = r.family_group_id
                AND fg.tenant_id = r.tenant_id

            LEFT JOIN admin.billing_accounts ba
                ON ba.id = fg.billing_account_id
                AND ba.tenant_id = r.tenant_id

            WHERE r.tenant_id = $1

            ORDER BY
                r.first_last_name,
                r.first_name
        `, [
            tenantId
        ]);

        return res.status(200).json({
            residents: result.rows
        });

    } catch (error) {
        console.error('Error obteniendo residentes:',error);

        return res.status(500).json({message:'Error obteniendo los residentes'});}
};


// ======================================================
// OBTENER FICHA DE UN RESIDENTE
// ADMIN + ANALYST
// ======================================================
exports.getResidentById = async (req, res) => {
    const residentId = req.params.id;
    const tenantId = req.user.tenant_id;

    try {
        const result = await db.query(`
            SELECT
                r.*,

                fg.name AS family_group_name,

                ba.display_name AS billing_account_name,

                COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', a.id,
                                'name', a.name,
                                'notes', ra.notes
                            )
                            ORDER BY a.name
                        )
                        FROM admin.resident_allergies ra
                        JOIN admin.allergies a
                            ON a.id = ra.allergy_id
                        WHERE ra.resident_id = r.id
                    ),
                    '[]'::jsonb
                ) AS allergies,

                COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', hc.id,
                                'condition_name', hc.condition_name,
                                'notes', hc.notes,
                                'diagnosed_at', hc.diagnosed_at,
                                'is_active', hc.is_active
                            )
                            ORDER BY hc.condition_name
                        )
                        FROM admin.resident_health_conditions hc
                        WHERE hc.resident_id = r.id
                        AND hc.is_active = true
                    ),
                    '[]'::jsonb
                ) AS health_conditions

            FROM admin.residents r

            JOIN admin.family_groups fg
                ON fg.id = r.family_group_id
                AND fg.tenant_id = r.tenant_id

            LEFT JOIN admin.billing_accounts ba
                ON ba.id = fg.billing_account_id

            WHERE r.id = $1
            AND r.tenant_id = $2

            LIMIT 1
        `, [
            residentId,
            tenantId
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Residente no encontrado'
            });
        }

        return res.status(200).json({
            resident: result.rows[0]
        });

    } catch (error) {
        console.error('Error obteniendo residente:',error);
        return res.status(500).json({message:'Error obteniendo la ficha del residente'});}
};


// ======================================================
// CREAR RESIDENTE
// SOLO ADMIN
// ======================================================
exports.createResident = async (req, res) => {
    const tenantId = req.user.tenant_id;
    const adminId = req.user.id;
    const adminRole = req.user.role_code;

    const {
        family_group_id = null,

        run_number,
        check_digit,

        first_name,
        first_last_name,
        second_last_name = null,

        birth_date,
        plan_started_at,

        health_notes = null,

        allergies = [],
        health_conditions = []
    } = req.body;

    // ==================================================
    // VALIDACIONES BÁSICAS
    // ==================================================

    if (
        !run_number ||
        !check_digit ||
        !first_name ||
        !first_last_name ||
        !birth_date ||
        !plan_started_at
    ) {
        return res.status(400).json({message:'Faltan datos obligatorios del residente'});
    }

    if (
        !validateRun(
            run_number,
            check_digit
        )
    ) {
        return res.status(400).json({message:'El RUN o dígito verificador no es válido'});
    }

    const normalizedRun =
        String(run_number)
            .replace(/\D/g, '');

    const normalizedDv =
        String(check_digit)
            .trim()
            .toUpperCase();

    const client = await db.connect();

    try {
        await client.query('BEGIN');

        // ==================================================
        // COMPROBAR RUN DUPLICADO
        // ==================================================

        const existingResident =
            await client.query(`
                SELECT id
                FROM admin.residents
                WHERE tenant_id = $1
                  AND run_number = $2
                  AND UPPER(check_digit) = $3
                LIMIT 1
            `, [
                tenantId,
                normalizedRun,
                normalizedDv
            ]);

        if (existingResident.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({message:'Ya existe un residente registrado con este RUN'});
        }

        // ==================================================
        // NÚCLEO FAMILIAR
        // ==================================================

        let finalFamilyGroupId =
            family_group_id;

        let familyGroupName = null;

        // Si seleccionaron un núcleo existente
        if (family_group_id) {

            const familyResult =
                await client.query(`
                    SELECT
                        id,
                        name
                    FROM admin.family_groups
                    WHERE id = $1
                    AND tenant_id = $2
                    AND status = 'active'
                    LIMIT 1
                `, [
                    family_group_id,
                    tenantId
                ]);

            if (familyResult.rows.length === 0) {
                await client.query('ROLLBACK');

                return res.status(404).json({message:'El núcleo familiar seleccionado no existe'});
            }

            familyGroupName =
                familyResult.rows[0].name;

        } else {

            // ==================================================
            // SIN NÚCLEO:
            // CREAR UNO INDIVIDUAL AUTOMÁTICAMENTE
            // ==================================================

            const generatedName =
                `Individual - ${first_name.trim()} ${first_last_name.trim()}`;

            const familyResult =
                await client.query(`
                    INSERT INTO admin.family_groups (
                        tenant_id,
                        name,
                        description,
                        status
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        'active'
                    )
                    RETURNING
                        id,
                        name
                `, [
                    tenantId,
                    generatedName,
                    'Núcleo individual creado automáticamente por AgeCare.'
                ]);

            finalFamilyGroupId =
                familyResult.rows[0].id;

            familyGroupName =
                familyResult.rows[0].name;
        }

        // ==================================================
        // CREAR RESIDENTE
        // ==================================================

        const residentResult =
            await client.query(`
                INSERT INTO admin.residents (
                    tenant_id,
                    family_group_id,
                    run_number,
                    check_digit,
                    first_name,
                    first_last_name,
                    second_last_name,
                    birth_date,
                    plan_started_at,
                    health_notes,
                    status
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
                    $10,
                    'active'
                )
                RETURNING *
            `, [
                tenantId,
                finalFamilyGroupId,
                normalizedRun,
                normalizedDv,
                first_name.trim(),
                first_last_name.trim(),
                second_last_name?.trim() || null,
                birth_date,
                plan_started_at,
                health_notes?.trim() || null
            ]);

        const resident =
            residentResult.rows[0];

        // ==================================================
        // ALERGIAS
        // ==================================================

        for (const allergy of allergies) {

            const allergyName =
                String(allergy?.name || allergy || '')
                    .trim();

            if (!allergyName) {
                continue;
            }

            const allergyResult =
                await client.query(`
                    INSERT INTO admin.allergies (
                        tenant_id,
                        name
                    )
                    VALUES (
                        $1,
                        $2
                    )

                    ON CONFLICT (
                        tenant_id,
                        name
                    )

                    DO UPDATE SET
                        name = EXCLUDED.name

                    RETURNING id
                `, [
                    tenantId,
                    allergyName
                ]);

            const allergyId =
                allergyResult.rows[0].id;

            const allergyNotes =
                typeof allergy === 'object'
                    ? allergy.notes || null
                    : null;

            await client.query(`
                INSERT INTO admin.resident_allergies (
                    resident_id,
                    allergy_id,
                    notes
                )
                VALUES (
                    $1,
                    $2,
                    $3
                )

                ON CONFLICT DO NOTHING
            `, [
                resident.id,
                allergyId,
                allergyNotes
            ]);
        }

        // ==================================================
        // CONDICIONES DE SALUD
        // ==================================================

        for (const condition of health_conditions) {

            const conditionName =
                String(
                    condition?.condition_name ||
                    condition ||
                    ''
                ).trim();

            if (!conditionName) {
                continue;
            }

            const conditionNotes =
                typeof condition === 'object'
                    ? condition.notes || null
                    : null;

            const diagnosedAt =
                typeof condition === 'object'
                    ? condition.diagnosed_at || null
                    : null;

            await client.query(`
                INSERT INTO admin.resident_health_conditions (
                    tenant_id,
                    resident_id,
                    condition_name,
                    notes,
                    diagnosed_at,
                    is_active
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    true
                )
            `, [
                tenantId,
                resident.id,
                conditionName,
                conditionNotes,
                diagnosedAt
            ]);
        }

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
                'resident_created',
                'resident',
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
            resident.id,

            JSON.stringify({
                run:
                    `${normalizedRun}-${normalizedDv}`,

                name:
                    `${resident.first_name} ${resident.first_last_name}`,

                family_group_id:
                    finalFamilyGroupId,

                family_group_name:
                    familyGroupName,

                status:
                    resident.status
            }),

            req.ip || null,
            req.get('user-agent') || null
        ]);

        await client.query('COMMIT');

        return res.status(201).json({message:'Residente creado correctamente',
            resident: {
                ...resident,
                family_group_name:
                    familyGroupName
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creando residente:',error);

        return res.status(500).json({message:'Error interno creando el residente'});
    } finally {client.release();}
};