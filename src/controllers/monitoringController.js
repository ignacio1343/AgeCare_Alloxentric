const db = require('../config/db');

// ============================================
// MONITOREO GENERAL DE RESIDENTES
// ============================================

exports.getResidentMonitoring = async (req, res) => {
  try {
    if (
      req.user.user_type !== 'admin' ||
      !['admin', 'analyst'].includes(req.user.role_code)
    ) {
      return res.status(403).json({
        message: 'No tienes permisos para acceder al monitoreo'
      });
    }

    const tenantId = req.user.tenant_id;

    const result = await db.query(
      `
      SELECT
        r.id,
        r.run_number,
        r.check_digit,
        r.first_name,
        r.first_last_name,
        r.second_last_name,

        fg.id AS family_group_id,
        fg.name AS family_group_name,

        assigned.id AS assigned_caregiver_id,
        assigned.first_name AS assigned_caregiver_first_name,
        assigned.first_last_name AS assigned_caregiver_last_name,

        COALESCE(rcs.status_code, 'SIN_REGISTRAR') AS status_code,
        rcs.observation,
        rcs.updated_at,

        recorder.first_name AS recorded_by_first_name,
        recorder.first_last_name AS recorded_by_last_name

      FROM admin.residents r

      INNER JOIN admin.family_groups fg
        ON fg.id = r.family_group_id
        AND fg.tenant_id = r.tenant_id

      LEFT JOIN admin.caregiver_family_groups cfg
        ON cfg.family_group_id = fg.id
        AND cfg.tenant_id = fg.tenant_id
        AND cfg.status = 'active'

      LEFT JOIN admin.caregivers assigned
        ON assigned.id = cfg.caregiver_id
        AND assigned.tenant_id = r.tenant_id

      LEFT JOIN admin.resident_current_status rcs
        ON rcs.resident_id = r.id
        AND rcs.tenant_id = r.tenant_id

      LEFT JOIN admin.caregivers recorder
        ON recorder.id = rcs.caregiver_id
        AND recorder.tenant_id = r.tenant_id

      WHERE r.tenant_id = $1
        AND r.status = 'active'
        AND fg.status = 'active'

      ORDER BY
        CASE COALESCE(rcs.status_code, 'SIN_REGISTRAR')
          WHEN 'RIESGOSO' THEN 1
          WHEN 'ALERTA' THEN 2
          WHEN 'NORMAL' THEN 3
          ELSE 4
        END,
        r.first_last_name,
        r.first_name
      `,
      [tenantId]
    );

    const residents = result.rows;

    const metrics = residents.reduce(
      (acc, resident) => {
        acc.total++;

        if (resident.status_code === 'RIESGOSO') {
          acc.risky++;
        } else if (resident.status_code === 'ALERTA') {
          acc.alert++;
        } else if (resident.status_code === 'NORMAL') {
          acc.normal++;
        } else {
          acc.unregistered++;
        }

        return acc;
      },
      {
        total: 0,
        risky: 0,
        alert: 0,
        normal: 0,
        unregistered: 0
      }
    );

    return res.status(200).json({
      metrics,
      residents
    });

  } catch (error) {
    console.error('Error obteniendo monitoreo de residentes:', error);

    return res.status(500).json({
      message: 'Error interno obteniendo el monitoreo de residentes'
    });
  }
};


// ============================================
// HISTORIAL DE UN RESIDENTE
// ADMIN + ANALYST
// ============================================

exports.getResidentHistory = async (req, res) => {
  try {
    if (
      req.user.user_type !== 'admin' ||
      !['admin', 'analyst'].includes(req.user.role_code)
    ) {
      return res.status(403).json({
        message: 'No tienes permisos para consultar el historial'
      });
    }

    const tenantId = req.user.tenant_id;
    const residentId = req.params.id;

    // ============================================
    // DATOS DEL RESIDENTE
    // ============================================

    const residentResult = await db.query(
      `
      SELECT
        r.id,
        r.run_number,
        r.check_digit,
        r.first_name,
        r.first_last_name,
        r.second_last_name,
        r.birth_date,
        r.health_notes,
        r.status,

        fg.id AS family_group_id,
        fg.name AS family_group_name,

        assigned.id AS assigned_caregiver_id,
        assigned.first_name AS assigned_caregiver_first_name,
        assigned.first_last_name AS assigned_caregiver_last_name,

        COALESCE(rcs.status_code, 'SIN_REGISTRAR') AS current_status_code,
        rcs.observation AS current_observation,
        rcs.updated_at AS current_updated_at,

        recorder.first_name AS current_recorded_by_first_name,
        recorder.first_last_name AS current_recorded_by_last_name

      FROM admin.residents r

      INNER JOIN admin.family_groups fg
        ON fg.id = r.family_group_id
        AND fg.tenant_id = r.tenant_id

      LEFT JOIN admin.caregiver_family_groups cfg
        ON cfg.family_group_id = fg.id
        AND cfg.tenant_id = fg.tenant_id
        AND cfg.status = 'active'

      LEFT JOIN admin.caregivers assigned
        ON assigned.id = cfg.caregiver_id
        AND assigned.tenant_id = r.tenant_id

      LEFT JOIN admin.resident_current_status rcs
        ON rcs.resident_id = r.id
        AND rcs.tenant_id = r.tenant_id

      LEFT JOIN admin.caregivers recorder
        ON recorder.id = rcs.caregiver_id
        AND recorder.tenant_id = r.tenant_id

      WHERE r.id = $1
        AND r.tenant_id = $2

      LIMIT 1
      `,
      [residentId, tenantId]
    );

    if (residentResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Residente no encontrado'
      });
    }

    const resident = residentResult.rows[0];

    // ============================================
    // HISTORIAL COMPLETO DE ESTADOS
    // ============================================

    const historyResult = await db.query(
      `
      SELECT
        rsh.id,
        rsh.status_code,
        rsh.observation,
        rsh.created_at,

        c.id AS caregiver_id,
        c.first_name AS caregiver_first_name,
        c.first_last_name AS caregiver_last_name,
        c.second_last_name AS caregiver_second_last_name

      FROM admin.resident_status_history rsh

      INNER JOIN admin.caregivers c
        ON c.id = rsh.caregiver_id
        AND c.tenant_id = rsh.tenant_id

      WHERE rsh.resident_id = $1
        AND rsh.tenant_id = $2

      ORDER BY rsh.created_at DESC
      `,
      [residentId, tenantId]
    );

    const history = historyResult.rows;

    // ============================================
    // MÉTRICAS DEL HISTORIAL
    // ============================================

    const historyMetrics = history.reduce(
      (acc, item) => {
        acc.total++;

        if (item.status_code === 'RIESGOSO') {
          acc.risky++;
        } else if (item.status_code === 'ALERTA') {
          acc.alert++;
        } else if (item.status_code === 'NORMAL') {
          acc.normal++;
        }

        return acc;
      },
      {
        total: 0,
        risky: 0,
        alert: 0,
        normal: 0
      }
    );

    return res.status(200).json({
      resident,
      history_metrics: historyMetrics,
      history
    });

  } catch (error) {
    console.error('Error obteniendo historial del residente:', error);

    return res.status(500).json({
      message: 'Error interno obteniendo el historial del residente'
    });
  }
};