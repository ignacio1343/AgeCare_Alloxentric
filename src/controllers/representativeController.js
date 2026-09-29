const db = require('../config/db');


// ======================================================
// NORMALIZAR TELÉFONO CHILENO
// ======================================================
function normalizePhone(phone) {
    if (!phone) {
        return null;
    }

    let digits = String(phone)
        .replace(/\D/g, '');

    // Ejemplo:
    // 912345678 -> 56912345678
    if (
        digits.length === 9 &&
        digits.startsWith('9')
    ) {
        digits = `56${digits}`;
    }

    // Debe quedar 569XXXXXXXX
    if (
        !/^569\d{8}$/.test(digits)
    ) {
        return null;
    }

    return `+${digits}`;
}


// ======================================================
// LISTAR REPRESENTANTES
// ADMIN + ANALYST
// ======================================================
exports.getRepresentatives = async (req, res) => {
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
                r.phone,
                r.email,
                r.whatsapp_enabled,
                r.whatsapp_verified_at,
                r.status,
                r.created_at,

                COUNT(
                    rr.id
                ) FILTER (
                    WHERE rr.status = 'active'
                )::INTEGER AS resident_count

            FROM admin.representatives r

            LEFT JOIN admin.resident_representatives rr
                ON rr.representative_id = r.id
                AND rr.tenant_id = r.tenant_id

            WHERE r.tenant_id = $1

            GROUP BY r.id

            ORDER BY
                r.first_last_name,
                r.first_name
        `, [
            tenantId
        ]);

        return res.status(200).json({
            representatives: result.rows
        });

    } catch (error) {
        console.error('Error obteniendo representantes:',error);

        return res.status(500).json({message:'Error obteniendo los representantes'});
    }
};


// ======================================================
// VER REPRESENTANTE
// ADMIN + ANALYST
// ======================================================
exports.getRepresentativeById = async (req, res) => {
    const representativeId = req.params.id;
    const tenantId = req.user.tenant_id;

    try {
        const result = await db.query(`
            SELECT
                rep.*,

                COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'relationship_id', rr.id,
                                'resident_id', res.id,
                                'resident_name',
                                    CONCAT(
                                        res.first_name,
                                        ' ',
                                        res.first_last_name
                                    ),
                                'relationship', rr.relationship,
                                'is_primary', rr.is_primary,
                                'receives_alerts', rr.receives_alerts,
                                'can_view_status', rr.can_view_status,
                                'can_view_health_summary',
                                    rr.can_view_health_summary
                            )
                            ORDER BY
                                res.first_last_name,
                                res.first_name
                        )

                        FROM admin.resident_representatives rr

                        JOIN admin.residents res
                            ON res.id = rr.resident_id
                            AND res.tenant_id = rr.tenant_id

                        WHERE rr.representative_id = rep.id
                        AND rr.status = 'active'
                    ),
                    '[]'::jsonb
                ) AS residents

            FROM admin.representatives rep

            WHERE rep.id = $1
            AND rep.tenant_id = $2

            LIMIT 1
        `, [
            representativeId,
            tenantId
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message:'Representante no encontrado'
            });
        }

        return res.status(200).json({
            representative: result.rows[0]
        });

    } catch (error) {
        console.error('Error obteniendo representante:',error);

        return res.status(500).json({
            message:'Error obteniendo el representante'});
    }
};


// ======================================================
// CREAR REPRESENTANTE
// SOLO ADMIN
// ======================================================
exports.createRepresentative = async (req, res) => {
    const tenantId = req.user.tenant_id;
    const adminId = req.user.id;
    const adminRole = req.user.role_code;

    const {
        run_number = null,
        check_digit = null,

        first_name,
        first_last_name,
        second_last_name = null,

        phone = null,
        email = null,

        whatsapp_enabled = false
    } = req.body;

    if (
        !first_name ||
        !first_last_name
    ) {
        return res.status(400).json({message:'Nombre y primer apellido son obligatorios'});
    }

    const normalizedPhone =
        phone
            ? normalizePhone(phone)
            : null;

    if (
        phone &&
        !normalizedPhone
    ) {
        return res.status(400).json({
            message:'El número de teléfono no tiene un formato chileno válido'});
    }

    const client = await db.connect();

    try {
        await client.query('BEGIN');

        // ==================================================
        // TELÉFONO DUPLICADO
        // ==================================================

        if (normalizedPhone) {
            const phoneResult =
                await client.query(`
                    SELECT id
                    FROM admin.representatives
                    WHERE tenant_id = $1
                      AND phone = $2
                      AND status = 'active'
                    LIMIT 1
                `, [
                    tenantId,
                    normalizedPhone
                ]);

            if (phoneResult.rows.length > 0) {
                await client.query('ROLLBACK');

                return res.status(409).json({
                    message:'Este número ya pertenece a otro representante'});
            }
        }

        // ==================================================
        // CREAR REPRESENTANTE
        // ==================================================

        const result =
            await client.query(`
                INSERT INTO admin.representatives (
                    tenant_id,
                    run_number,
                    check_digit,
                    first_name,
                    first_last_name,
                    second_last_name,
                    phone,
                    email,
                    whatsapp_enabled,
                    whatsapp_verified_at,
                    whatsapp_verified_by,
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
                    $11,
                    'active'
                )
                RETURNING *
            `, [
                tenantId,
                run_number || null,
                check_digit
                    ? String(check_digit).toUpperCase()
                    : null,

                first_name.trim(),
                first_last_name.trim(),
                second_last_name?.trim() || null,

                normalizedPhone,
                email?.trim().toLowerCase() || null,

                Boolean(
                    whatsapp_enabled &&
                    normalizedPhone
                ),

                whatsapp_enabled && normalizedPhone
                    ? new Date()
                    : null,

                whatsapp_enabled && normalizedPhone
                    ? adminId
                    : null
            ]);

        const representative =
            result.rows[0];

        // ==================================================
        // ADMIN
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
                'representative_created',
                'representative',
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
            representative.id,

            JSON.stringify({
                name:
                    `${representative.first_name} ${representative.first_last_name}`,

                phone:
                    representative.phone,

                whatsapp_enabled:
                    representative.whatsapp_enabled,

                status:
                    representative.status
            }),

            req.ip || null,
            req.get('user-agent') || null
        ]);

        await client.query('COMMIT');

        return res.status(201).json({message:'Representante creado correctamente',
            representative
        });

    } catch (error) {
        await client.query('ROLLBACK');

        console.error('Error creando representante:',error);

        return res.status(500).json({
            message:'Error interno creando el representante'});
    } finally {
        client.release();
    }
};


// ======================================================
// ASIGNAR REPRESENTANTE A RESIDENTE
// SOLO ADMIN
// ======================================================
exports.assignRepresentativeToResident =
async (req, res) => {

    const tenantId = req.user.tenant_id;
    const adminId = req.user.id;
    const adminRole = req.user.role_code;

    const residentId =
        req.params.residentId;

    const {
        representative_id,
        relationship,

        is_primary = false,
        receives_alerts = true,
        can_view_status = true,
        can_view_health_summary = true
    } = req.body;

    if (
        !representative_id ||
        !relationship
    ) {
        return res.status(400).json({
            message:'Representante y relación son obligatorios'});}

    const client =
        await db.connect();

    try {
        await client.query('BEGIN');

        // ==================================================
        // RESIDENTE
        // ==================================================

        const residentResult =
            await client.query(`
                SELECT
                    id,
                    first_name,
                    first_last_name
                FROM admin.residents
                WHERE id = $1
                AND tenant_id = $2
                LIMIT 1
            `, [
                residentId,
                tenantId
            ]);

        if (
            residentResult.rows.length === 0
        ) {
            await client.query('ROLLBACK');

            return res.status(404).json({message:'Residente no encontrado'});}

        // ==================================================
        // REPRESENTANTE
        // ==================================================

        const representativeResult =
            await client.query(`
                SELECT
                    id,
                    first_name,
                    first_last_name
                FROM admin.representatives
                WHERE id = $1
                AND tenant_id = $2
                AND status = 'active'
                LIMIT 1
            `, [
                representative_id,
                tenantId
            ]);

        if (
            representativeResult.rows.length === 0
        ) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                message:'Representante no encontrado'});}

        // ==================================================
        // DUPLICADO
        // ==================================================

        const existingRelation =
            await client.query(`
                SELECT id
                FROM admin.resident_representatives
                WHERE resident_id = $1
                  AND representative_id = $2
                LIMIT 1
            `, [
                residentId,
                representative_id
            ]);

        if (
            existingRelation.rows.length > 0
        ) {
            await client.query('ROLLBACK');

            return res.status(409).json({
                message:'El representante ya está asignado a este residente'});}

        // ==================================================
        // SOLO UN PRINCIPAL
        // ==================================================

        if (is_primary) {
            const primaryResult =
                await client.query(`
                    SELECT id
                    FROM admin.resident_representatives
                    WHERE resident_id = $1
                      AND is_primary = true
                      AND status = 'active'
                    LIMIT 1
                `, [
                    residentId
                ]);

            if (
                primaryResult.rows.length > 0
            ) {
                await client.query('ROLLBACK');
                return res.status(409).json({message:'Este residente ya tiene un representante principal'});
            }
        }

        // ==================================================
        // CREAR RELACIÓN
        // ==================================================

        const relationResult =
            await client.query(`
                INSERT INTO admin.resident_representatives (
                    tenant_id,
                    resident_id,
                    representative_id,
                    relationship,
                    is_primary,
                    receives_alerts,
                    can_view_status,
                    can_view_health_summary,
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
                    'active'
                )
                RETURNING *
            `, [
                tenantId,
                residentId,
                representative_id,

                relationship.trim(),

                Boolean(is_primary),
                Boolean(receives_alerts),
                Boolean(can_view_status),
                Boolean(can_view_health_summary)
            ]);

        const relation =
            relationResult.rows[0];

        const resident =
            residentResult.rows[0];

        const representative =
            representativeResult.rows[0];

        // ==================================================
        // ADMIN
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
                'resident_representative_assigned',
                'resident_representative',
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
            relation.id,

            JSON.stringify({
                resident:
                    `${resident.first_name} ${resident.first_last_name}`,

                representative:
                    `${representative.first_name} ${representative.first_last_name}`,

                relationship:
                    relation.relationship,

                is_primary:
                    relation.is_primary
            }),

            req.ip || null,
            req.get('user-agent') || null
        ]);

        await client.query('COMMIT');

        return res.status(201).json({message:'Representante asignado correctamente',

            relationship: relation
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error asignando representante:',error);

        return res.status(500).json({
            message:'Error interno asignando el representante'});
    } finally {
        client.release();
    }
};