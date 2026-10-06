const db = require('../config/db');

// ============================================
// CREAR ALERTA CRÍTICA DE RESIDENTE
// ============================================

async function createCriticalResidentNotification({
  client = db,
  tenantId,
  residentId,
  statusHistoryId,
  observation = null
}) {
  // Buscamos residente + representante principal activo.
  const result = await client.query(
    `
    SELECT
      r.id AS resident_id,
      r.first_name AS resident_first_name,
      r.first_last_name AS resident_last_name,
      r.second_last_name AS resident_second_last_name,

      rr.representative_id,
      rr.receives_alerts,

      rep.first_name AS representative_first_name,
      rep.first_last_name AS representative_last_name,
      rep.second_last_name AS representative_second_last_name,
      rep.phone,
      rep.whatsapp_enabled,
      rep.whatsapp_verified_at,
      rep.status AS representative_status

    FROM admin.residents r

    LEFT JOIN admin.resident_representatives rr
      ON rr.resident_id = r.id
      AND rr.is_primary = TRUE
      AND rr.status = 'active'

    LEFT JOIN admin.representatives rep
      ON rep.id = rr.representative_id
      AND rep.tenant_id = r.tenant_id
      AND rep.status = 'active'

    WHERE r.id = $1
      AND r.tenant_id = $2

    LIMIT 1
    `,
    [residentId, tenantId]
  );

  if (result.rows.length === 0) {
    throw new Error(
      'No fue posible encontrar al residente para generar la alerta'
    );
  }

  const data = result.rows[0];

  const residentName = [
    data.resident_first_name,
    data.resident_last_name,
    data.resident_second_last_name
  ]
    .filter(Boolean)
    .join(' ');

  // ============================================
  // DETERMINAR SI LA ALERTA PUEDE SER ENVIADA
  // ============================================

  let notificationStatus = 'pending';
  let skipReason = null;

  if (!data.representative_id) {
    notificationStatus = 'skipped';
    skipReason = 'no_primary_representative';

  } else if (!data.receives_alerts) {
    notificationStatus = 'skipped';
    skipReason = 'representative_alerts_disabled';

  } else if (!data.whatsapp_enabled) {
    notificationStatus = 'skipped';
    skipReason = 'whatsapp_disabled';

  } else if (!data.phone) {
    notificationStatus = 'skipped';
    skipReason = 'representative_without_phone';

  } else if (!data.whatsapp_verified_at) {
    notificationStatus = 'skipped';
    skipReason = 'whatsapp_not_verified';
  }

  // ============================================
  // CONTENIDO DE LA NOTIFICACIÓN
  // ============================================

  const title =
    'Alerta crítica de residente';

  const message =
    `${residentName} fue registrado en estado RIESGOSO.` +
    (
      observation
        ? ` Observación: ${observation}`
        : ''
    );

  const metadata = {
    resident_name: residentName,
    generated_by: 'resident_status',
    severity: 'critical'
  };

  if (skipReason) {
    metadata.skip_reason = skipReason;
  }

  // ============================================
  // GUARDAR NOTIFICACIÓN
  // ============================================

  const notificationResult = await client.query(
    `
    INSERT INTO admin.notifications (
      tenant_id,
      resident_id,
      representative_id,
      source_status_history_id,
      notification_type,
      channel,
      title,
      message,
      status,
      destination,
      metadata
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      'critical_resident_alert',
      'whatsapp',
      $5,
      $6,
      $7,
      $8,
      $9::jsonb
    )

    ON CONFLICT DO NOTHING

    RETURNING *
    `,
    [
      tenantId,
      residentId,
      data.representative_id || null,
      statusHistoryId,
      title,
      message,
      notificationStatus,
      data.phone || null,
      JSON.stringify(metadata)
    ]
  );

  // Si no insertó nada significa que ya existía
  // una alerta para ese mismo evento.
  if (notificationResult.rows.length === 0) {
    return {
      created: false,
      duplicate: true,
      notification: null
    };
  }

  return {
    created: true,
    duplicate: false,
    notification: notificationResult.rows[0]
  };
}

module.exports = {
  createCriticalResidentNotification
};