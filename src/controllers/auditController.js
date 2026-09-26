const db = require('../config/db');


// ======================================================
// OBTENER AUDITORÍA ADMINISTRATIVA
// ======================================================
exports.getAuditLog = async (req, res) => {
    try {
        const tenantId = req.user.tenant_id;

        let limit = Number(req.query.limit || 100);

        if (!Number.isInteger(limit) || limit < 1) {
            limit = 100;
        }

        if (limit > 200) {
            limit = 200;
        }

        const result = await db.query(`
            SELECT
                a.id,
                a.actor_id,
                a.actor_name,
                a.actor_role,
                a.action,
                a.entity_type,
                a.entity_id,
                a.before,
                a.after,
                a.ip,
                a.created_at,

                COALESCE(
                    bs.display_name,
                    bt.display_name
                ) AS subject_name

            FROM admin.audit_log a

            LEFT JOIN admin.subscriptions s
                ON a.entity_type = 'subscription'
                AND s.id = a.entity_id

            LEFT JOIN admin.billing_accounts bs
                ON bs.id = s.billing_account_id

            LEFT JOIN admin.payment_transactions t
                ON a.entity_type = 'payment_transaction'
                AND t.id = a.entity_id

            LEFT JOIN admin.billing_accounts bt
                ON bt.id = t.billing_account_id

            WHERE a.tenant_id = $1

            ORDER BY a.created_at DESC

            LIMIT $2
        `, [
            tenantId,
            limit
        ]);

        return res.status(200).json({
            audit: result.rows
        });

    } catch (error) {
        console.error(
            'Error obteniendo auditoría:',
            error
        );

        return res.status(500).json({
            message:
                'Error obteniendo la auditoría administrativa'
        });
    }
};