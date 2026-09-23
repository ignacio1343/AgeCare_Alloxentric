const db = require('../config/db');


// ======================================================
// OBTENER PLANES
// ======================================================

exports.getPlans = async (req, res) => {

    try {

        const result = await db.query(`
            SELECT
                code,
                name,
                billing_unit,
                is_paid,
                price_amount,
                currency_code,
                billing_interval,
                is_active
            FROM admin.plans
            WHERE is_active = true
            ORDER BY sort_order
        `);

        return res.status(200).json({
            plans: result.rows
        });

    } catch (error) {

        console.error(
            'Error obteniendo planes:',
            error
        );
        return res.status(500).json({
            message: 'Error obteniendo los planes'
        });
    }
};


// ======================================================
// OBTENER SUSCRIPCIONES
// ======================================================

exports.getSubscriptions = async (req, res) => {

    try {

        const tenantId = req.user.tenant_id;
        const result = await db.query(`
            SELECT
                s.id,
                b.id AS billing_account_id,
                b.display_name,
                b.email,
                b.account_type,
                p.code AS plan_code,
                p.name AS plan_name,
                p.price_amount,
                p.currency_code,
                s.status,
                s.started_at,
                s.current_period_start,
                s.current_period_end,
                s.cancel_at_period_end,
                pm.brand,
                pm.last4,
                pm.method_type
            FROM admin.subscriptions s
            INNER JOIN admin.billing_accounts b
                ON b.id = s.billing_account_id
            INNER JOIN admin.plans p
                ON p.code = s.plan_code
            LEFT JOIN admin.payment_methods pm
                ON pm.billing_account_id = b.id
                AND pm.is_default = true
                AND pm.status = 'active'
            WHERE s.tenant_id = $1
            ORDER BY s.created_at DESC
        `,
        [tenantId]);
        return res.status(200).json({
            subscriptions: result.rows
        });
    } catch (error) {
        console.error(
            'Error obteniendo suscripciones:',
            error
        );
        return res.status(500).json({
            message: 'Error obteniendo las suscripciones'
        });
    }
};


// ======================================================
// OBTENER TRANSACCIONES
// ======================================================

exports.getTransactions = async (req, res) => {

    try {

        const tenantId = req.user.tenant_id;

        const result = await db.query(`
            SELECT
                t.id,
                t.provider,
                t.provider_payment_intent_id,
                t.amount,
                t.currency_code,
                t.status,
                t.failure_code,
                t.failure_reason,
                t.description,
                t.refunded_amount,
                t.paid_at,
                t.created_at,
                b.id AS billing_account_id,
                b.display_name,
                b.account_type,
                b.email,
                p.code AS plan_code,
                p.name AS plan_name,
                pm.brand,
                pm.last4

            FROM admin.payment_transactions t
            INNER JOIN admin.billing_accounts b
                ON b.id = t.billing_account_id
            LEFT JOIN admin.plans p
                ON p.code = t.plan_code
            LEFT JOIN admin.payment_methods pm
                ON pm.id = t.payment_method_id
            WHERE t.tenant_id = $1
            ORDER BY t.created_at DESC
            LIMIT 100
        `,
        [tenantId]);

        return res.status(200).json({
            transactions: result.rows
        });

    } catch (error) {
        console.error(
            'Error obteniendo transacciones:',
            error
        );
        return res.status(500).json({
            message: 'Error obteniendo las transacciones'
        });
    }
};


// ======================================================
// MÉTRICAS FINANCIERAS
// ======================================================

exports.getMetrics = async (req, res) => {

    try {

        const tenantId = req.user.tenant_id;
        const result = await db.query(`
            SELECT
                COUNT(*) FILTER (
                    WHERE status = 'approved'
                    AND created_at::date = CURRENT_DATE
                ) AS approved_today,
                COALESCE(
                    SUM(amount) FILTER (
                        WHERE status = 'approved'
                        AND created_at::date = CURRENT_DATE
                    ),
                    0
                ) AS approved_amount_today,
                COUNT(*) FILTER (
                    WHERE status = 'failed'
                ) AS failed_transactions,
                COUNT(*) AS total_transactions,
                COUNT(*) FILTER (
                    WHERE status = 'approved'
                ) AS approved_transactions
            FROM admin.payment_transactions
            WHERE tenant_id = $1
        `,
        [tenantId]);

        const metrics = result.rows[0];
        const total =
            Number(metrics.total_transactions);
        const approved =
            Number(metrics.approved_transactions);

        const successRate =
            total > 0
                ? ((approved / total) * 100).toFixed(1)
                : '0.0';
        return res.status(200).json({

            metrics: {
                approved_today:
                    Number(metrics.approved_today),
                approved_amount_today:
                    Number(metrics.approved_amount_today),
                failed_transactions:
                    Number(metrics.failed_transactions),
                total_transactions:
                    total,
                approved_transactions:
                    approved,
                success_rate:
                    Number(successRate)
            }
        });

    } catch (error) {
        console.error(
            'Error obteniendo métricas:',
            error
        );
        return res.status(500).json({
            message: 'Error obteniendo métricas'
        });
    }

};