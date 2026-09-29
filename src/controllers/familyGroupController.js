const db = require('../config/db');


// ======================================================
// LISTAR NÚCLEOS FAMILIARES
// ADMIN + ANALYST
// ======================================================
exports.getFamilyGroups = async (req, res) => {
    try {
        const tenantId = req.user.tenant_id;
        const result = await db.query(`
            SELECT
                fg.id,
                fg.name,
                fg.description,
                fg.status,
                fg.billing_account_id,
                fg.created_at,
                fg.updated_at,

                ba.display_name AS billing_account_name,
                ba.account_type,

                COUNT(r.id)::INTEGER AS resident_count

            FROM admin.family_groups fg

            LEFT JOIN admin.billing_accounts ba
                ON ba.id = fg.billing_account_id
                AND ba.tenant_id = fg.tenant_id

            LEFT JOIN admin.residents r
                ON r.family_group_id = fg.id
                AND r.tenant_id = fg.tenant_id
                AND r.status = 'active'

            WHERE fg.tenant_id = $1

            GROUP BY
                fg.id,
                ba.id

            ORDER BY
                fg.name ASC
        `, [
            tenantId
        ]);

        return res.status(200).json({
            family_groups: result.rows
        });

    } catch (error) {
        console.error('Error obteniendo núcleos familiares:',error);
        return res.status(500).json({message:'Error obteniendo los núcleos familiares'});
    }
};


// ======================================================
// CREAR NÚCLEO FAMILIAR
// SOLO ADMIN
// ======================================================
exports.createFamilyGroup = async (req, res) => {
    const tenantId = req.user.tenant_id;
    const adminId = req.user.id;
    const adminRole = req.user.role_code;

    const {
        name,
        description = null,
        billing_account_id = null
    } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({
            message:'El nombre del núcleo familiar es obligatorio'});
    }

    const client = await db.connect();
    try {await client.query('BEGIN');

        // ------------------------------------------------
        // Si viene una cuenta comercial,
        // comprobar que pertenezca al tenant
        // ------------------------------------------------
        let billingAccount = null;

        if (billing_account_id) {
            const billingResult =
                await client.query(`
                    SELECT
                        id,
                        display_name,
                        account_type
                    FROM admin.billing_accounts
                    WHERE id = $1
                    AND tenant_id = $2
                    LIMIT 1
                `, [
                    billing_account_id,
                    tenantId
                ]);

            if (billingResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({message:'La cuenta comercial seleccionada no existe'});
            }

            billingAccount =
                billingResult.rows[0];
        }

        // ------------------------------------------------
        // Crear núcleo
        // ------------------------------------------------
        const insertResult =
            await client.query(`
                INSERT INTO admin.family_groups (
                    tenant_id,
                    billing_account_id,
                    name,
                    description,
                    status
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    'active'
                )
                RETURNING
                    id,
                    billing_account_id,
                    name,
                    description,
                    status,
                    created_at,
                    updated_at
            `, [
                tenantId,
                billing_account_id,
                name.trim(),
                description?.trim() || null
            ]);

        const familyGroup =
            insertResult.rows[0];

        // ------------------------------------------------
        // Nombre del administrador
        // ------------------------------------------------
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
            adminResult.rows[0]?.full_name || null;

        // ------------------------------------------------
        // Auditoría
        // ------------------------------------------------
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
                'family_group_created',
                'family_group',
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
            familyGroup.id,

            JSON.stringify({name: familyGroup.name,
                billing_account_id:
                    familyGroup.billing_account_id,
                billing_account_name:
                    billingAccount?.display_name || null,
                status:
                    familyGroup.status
            }),

            req.ip || null,
            req.get('user-agent') || null
        ]);

        await client.query('COMMIT');
        return res.status(201).json({
            message:'Núcleo familiar creado correctamente',
            family_group: {
                ...familyGroup,
                billing_account_name:
                    billingAccount?.display_name || null,
                account_type:
                    billingAccount?.account_type || null,
                resident_count: 0
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creando núcleo familiar:',error);
        return res.status(500).json({
            message:'Error interno creando el núcleo familiar'});

    } finally {client.release();}
};