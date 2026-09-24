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


// ======================================================
// MODIFICAR PLAN DE UNA SUSCRIPCIÓN
// ======================================================
exports.updateSubscriptionPlan = async (req, res) => {
    const subscriptionId = req.params.id;
    const { plan_code } = req.body;
    const tenantId = req.user.tenant_id;
    const adminId = req.user.id;
    const adminRole = req.user.role_code;

    if (!plan_code) {
        return res.status(400).json({
            message: 'Debe indicar el nuevo plan'
        });
    }

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(subscriptionId)) {
        return res.status(400).json({
            message: 'ID de suscripción inválido'
        });
    }

    const client = await db.connect();

    try {
        await client.query('BEGIN');

        // Verificar que el plan existe y está activo
        const planResult = await client.query(`
            SELECT
                code,
                name,
                price_amount,
                currency_code,
                is_active
            FROM admin.plans
            WHERE code = $1
            LIMIT 1
        `, [plan_code]);

        if (planResult.rows.length === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                message: 'El plan seleccionado no existe'
            });
        }

        const newPlan = planResult.rows[0];

        if (!newPlan.is_active) {
            await client.query('ROLLBACK');

            return res.status(400).json({
                message: 'El plan seleccionado está desactivado'
            });
        }

        // Obtener estado actual de la suscripción
        const subscriptionResult = await client.query(`
            SELECT
                s.id,
                s.billing_account_id,
                s.plan_code,
                s.status,
                s.current_period_start,
                s.current_period_end,
                b.display_name
            FROM admin.subscriptions s
            INNER JOIN admin.billing_accounts b
                ON b.id = s.billing_account_id
            WHERE s.id = $1
              AND s.tenant_id = $2
            LIMIT 1
            FOR UPDATE
        `, [
            subscriptionId,
            tenantId
        ]);

        if (subscriptionResult.rows.length === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                message: 'Suscripción no encontrada'
            });
        }

        const previousSubscription =
            subscriptionResult.rows[0];

        // Si ya tiene ese plan, no hacemos un UPDATE innecesario
        if (
            previousSubscription.plan_code ===
            plan_code
        ) {
            await client.query('ROLLBACK');

            return res.status(400).json({
                message: 'La suscripción ya pertenece a ese plan'
            });
        }

        // Actualizar el plan
        const updateResult = await client.query(`
            UPDATE admin.subscriptions
            SET plan_code = $1
            WHERE id = $2
              AND tenant_id = $3
            RETURNING
                id,
                billing_account_id,
                plan_code,
                status,
                current_period_start,
                current_period_end,
                updated_at
        `, [
            plan_code,
            subscriptionId,
            tenantId
        ]);

        const updatedSubscription =
            updateResult.rows[0];

        // Obtener nombre del administrador que realizó el cambio
        const adminResult = await client.query(`
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

        // Registrar auditoría
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
                'subscription_plan_changed',
                'subscription',
                $5,
                $6::jsonb,
                $7::jsonb,
                $8,
                $9
            )
        `, [
            tenantId,
            adminId,
            actorName,
            adminRole,
            subscriptionId,
            JSON.stringify({
                plan_code:
                    previousSubscription.plan_code
            }),
            JSON.stringify({
                plan_code:
                    updatedSubscription.plan_code
            }),
            req.ip || null,
            req.get('user-agent') || null
        ]);

        await client.query('COMMIT');

        return res.status(200).json({
            message: 'Plan actualizado correctamente',
            subscription: {
                ...updatedSubscription,
                customer:
                    previousSubscription.display_name,
                plan: newPlan
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');

        console.error(
            'Error modificando plan:',
            error
        );

        return res.status(500).json({
            message: 'Error interno modificando la suscripción'
        });

    } finally {
        client.release();
    }
};

// ======================================================
// MÉTRICAS COMERCIALES
// ======================================================
exports.getCommercialMetrics = async (req, res) => {
    try {
        const tenantId = req.user.tenant_id;

        const summaryResult = await db.query(`
            SELECT
                COUNT(DISTINCT b.id) AS total_accounts,

                COUNT(*) FILTER (
                    WHERE s.status = 'active'
                ) AS active_subscriptions,

                COUNT(*) FILTER (
                    WHERE s.status = 'active'
                    AND p.is_paid = true
                ) AS paid_subscriptions,

                COALESCE(
                    SUM(p.price_amount) FILTER (
                        WHERE s.status = 'active'
                        AND p.is_paid = true
                    ),
                    0
                ) AS mrr,

                COUNT(*) FILTER (
                    WHERE s.status = 'canceled'
                    AND s.canceled_at >= date_trunc('month', CURRENT_DATE)
                ) AS canceled_this_month

            FROM admin.billing_accounts b

            LEFT JOIN admin.subscriptions s
                ON s.billing_account_id = b.id
                AND s.tenant_id = b.tenant_id

            LEFT JOIN admin.plans p
                ON p.code = s.plan_code

            WHERE b.tenant_id = $1
              AND b.status = 'active'
        `, [tenantId]);


        const planResult = await db.query(`
            SELECT
                p.code,
                p.name,
                p.price_amount,
                p.currency_code,

                COUNT(s.id) FILTER (
                    WHERE s.status = 'active'
                ) AS active_subscriptions

            FROM admin.plans p

            LEFT JOIN admin.subscriptions s
                ON s.plan_code = p.code
                AND s.tenant_id = $1

            WHERE p.is_active = true

            GROUP BY
                p.code,
                p.name,
                p.price_amount,
                p.currency_code,
                p.sort_order

            ORDER BY p.sort_order
        `, [tenantId]);


        const metrics = summaryResult.rows[0];

        return res.status(200).json({
            metrics: {
                total_accounts:
                    Number(metrics.total_accounts),

                active_subscriptions:
                    Number(metrics.active_subscriptions),

                paid_subscriptions:
                    Number(metrics.paid_subscriptions),

                mrr:
                    Number(metrics.mrr),

                canceled_this_month:
                    Number(metrics.canceled_this_month)
            },

            plans: planResult.rows.map(plan => ({
                ...plan,
                price_amount:
                    Number(plan.price_amount),

                active_subscriptions:
                    Number(plan.active_subscriptions)
            }))
        });

    } catch (error) {

        console.error(
            'Error obteniendo métricas comerciales:',
            error
        );

        return res.status(500).json({
            message:
                'Error obteniendo métricas comerciales'
        });

    }
};


// ======================================================
// REEMBOLSAR TRANSACCIÓN
// ======================================================
exports.refundTransaction = async (req, res) => {
    const transactionId = req.params.id;
    const tenantId = req.user.tenant_id;
    const adminId = req.user.id;
    const adminRole = req.user.role_code;

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(transactionId)) {
        return res.status(400).json({
            message: 'ID de transacción inválido'
        });
    }

    const client = await db.connect();

    try {
        await client.query('BEGIN');

        // Buscar y bloquear la transacción
        const transactionResult = await client.query(`
            SELECT
                t.id,
                t.billing_account_id,
                t.amount,
                t.currency_code,
                t.status,
                t.refunded_amount,
                t.provider,
                t.provider_payment_intent_id,
                b.display_name
            FROM admin.payment_transactions t
            INNER JOIN admin.billing_accounts b
                ON b.id = t.billing_account_id
            WHERE t.id = $1
              AND t.tenant_id = $2
            LIMIT 1
            FOR UPDATE
        `, [
            transactionId,
            tenantId
        ]);

        if (transactionResult.rows.length === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                message: 'Transacción no encontrada'
            });
        }

        const transaction =
            transactionResult.rows[0];

        if (transaction.status !== 'approved') {
            await client.query('ROLLBACK');

            return res.status(400).json({
                message:
                    'Solo se pueden reembolsar transacciones aprobadas'
            });
        }

        // Registrar reembolso
        const refundResult = await client.query(`
            INSERT INTO admin.payment_refunds (
                tenant_id,
                transaction_id,
                amount,
                reason,
                status,
                requested_by,
                processed_at
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                'succeeded',
                $5,
                CURRENT_TIMESTAMP
            )
            RETURNING
                id,
                amount,
                status,
                created_at,
                processed_at
        `, [
            tenantId,
            transactionId,
            transaction.amount,
            'Reembolso solicitado desde panel administrativo',
            adminId
        ]);

        // Actualizar transacción
        const updatedTransaction =
            await client.query(`
                UPDATE admin.payment_transactions
                SET
                    status = 'refunded',
                    refunded_amount = amount
                WHERE id = $1
                  AND tenant_id = $2
                RETURNING *
            `, [
                transactionId,
                tenantId
            ]);

        // Nombre del administrador
        const adminResult = await client.query(`
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

        // Auditoría
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
                'payment_refunded',
                'payment_transaction',
                $5,
                $6::jsonb,
                $7::jsonb,
                $8,
                $9
            )
        `, [
            tenantId,
            adminId,
            actorName,
            adminRole,
            transactionId,

            JSON.stringify({
                status:
                    transaction.status,
                refunded_amount:
                    Number(transaction.refunded_amount || 0)
            }),

            JSON.stringify({
                status: 'refunded',
                refunded_amount:
                    Number(transaction.amount)
            }),

            req.ip || null,
            req.get('user-agent') || null
        ]);

        await client.query('COMMIT');

        return res.status(200).json({
            message:
                'Reembolso registrado correctamente',

            refund:
                refundResult.rows[0],

            transaction:
                updatedTransaction.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');

        console.error(
            'Error realizando reembolso:',
            error
        );

        return res.status(500).json({
            message:
                'Error interno realizando el reembolso'
        });

    } finally {
        client.release();
    }
};


// ======================================================
// CANCELAR SUSCRIPCIÓN
// ======================================================
exports.cancelSubscription = async (req, res) => {
    const subscriptionId = req.params.id;
    const tenantId = req.user.tenant_id;
    const adminId = req.user.id;
    const adminRole = req.user.role_code;

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(subscriptionId)) {
        return res.status(400).json({
            message: 'ID de suscripción inválido'
        });
    }

    const client = await db.connect();

    try {
        await client.query('BEGIN');

        // Buscar y bloquear la suscripción
        const subscriptionResult = await client.query(`
            SELECT
                s.id,
                s.billing_account_id,
                s.plan_code,
                s.status,
                s.started_at,
                s.current_period_start,
                s.current_period_end,
                s.cancel_at_period_end,
                s.canceled_at,
                b.display_name,
                p.name AS plan_name
            FROM admin.subscriptions s
            INNER JOIN admin.billing_accounts b
                ON b.id = s.billing_account_id
            INNER JOIN admin.plans p
                ON p.code = s.plan_code
            WHERE s.id = $1
              AND s.tenant_id = $2
            LIMIT 1
            FOR UPDATE
        `, [
            subscriptionId,
            tenantId
        ]);

        if (subscriptionResult.rows.length === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                message: 'Suscripción no encontrada'
            });
        }

        const subscription =
            subscriptionResult.rows[0];

        if (subscription.status === 'canceled') {
            await client.query('ROLLBACK');

            return res.status(400).json({
                message: 'La suscripción ya se encuentra cancelada'
            });
        }

        // Cancelación inmediata
        const updateResult = await client.query(`
            UPDATE admin.subscriptions
            SET
                status = 'canceled',
                cancel_at_period_end = false,
                canceled_at = CURRENT_TIMESTAMP
            WHERE id = $1
              AND tenant_id = $2
            RETURNING
                id,
                billing_account_id,
                plan_code,
                status,
                current_period_end,
                cancel_at_period_end,
                canceled_at,
                updated_at
        `, [
            subscriptionId,
            tenantId
        ]);

        const updatedSubscription =
            updateResult.rows[0];

        // Obtener administrador responsable
        const adminResult = await client.query(`
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

        // Auditoría
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
                'subscription_canceled',
                'subscription',
                $5,
                $6::jsonb,
                $7::jsonb,
                $8,
                $9
            )
        `, [
            tenantId,
            adminId,
            actorName,
            adminRole,
            subscriptionId,

            JSON.stringify({
                status: subscription.status,
                plan_code: subscription.plan_code,
                cancel_at_period_end:
                    subscription.cancel_at_period_end,
                canceled_at:
                    subscription.canceled_at
            }),

            JSON.stringify({
                status: 'canceled',
                plan_code: subscription.plan_code,
                cancel_at_period_end: false,
                canceled_at:
                    updatedSubscription.canceled_at
            }),

            req.ip || null,
            req.get('user-agent') || null
        ]);

        await client.query('COMMIT');

        return res.status(200).json({
            message: 'Suscripción cancelada correctamente',
            subscription: {
                ...updatedSubscription,
                customer: subscription.display_name,
                plan_name: subscription.plan_name
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');

        console.error(
            'Error cancelando suscripción:',
            error
        );

        return res.status(500).json({
            message:
                'Error interno cancelando la suscripción'
        });

    } finally {
        client.release();
    }
};