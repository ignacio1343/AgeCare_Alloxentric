let selectedSubscriptionId = null;
let selectedCancelSubscriptionId = null;
let currentSubscriptions = [];
let currentTransactions = [];
let selectedTransactionId = null;
let currentAuditEntries = [];
let currentResidentMonitoring = [];
let currentUserRole = null;
let previousResidentStatuses = new Map();
let monitoringBaselineReady = false;




function isAdmin() {
  return currentUserRole === 'admin';
}

function isAnalyst() {
  return currentUserRole === 'analyst';
}

// ============================================
// SESIÓN
// ============================================

const token = sessionStorage.getItem('agecare_token');
const sessionLoader = document.getElementById('sessionLoader');
const appRoot = document.getElementById('appRoot');

// ============================================
// VALIDAR SESIÓN
// ============================================

async function validateSession() {
  if (!token) {
    redirectToLogin();
    return;
  }

  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      redirectToLogin();
      return;
    }

    const data = await response.json();
    const user = data.user || data;

    if (!protectAdministrativePortal(user)) {
      return;
    }

    currentUserRole = user.role_code;

    renderLoggedUser(user);
    applyRoleInterface();

    sessionLoader.classList.add('d-none');
    appRoot.classList.remove('d-none');

    await loadBillingDashboard();
    startResidentMonitoringAutoRefresh();

  } catch (error) {
    console.error('Error validando sesión:', error);
    redirectToLogin();
  }
}

// ============================================
// MOSTRAR USUARIO
// ============================================

function renderLoggedUser(user) {
  const fullName = user.full_name || 'Usuario';
  const role = user.role_code || 'Sin rol';

  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join('');

  document.getElementById('userAvatar').textContent = initials || 'U';
  document.getElementById('userName').textContent = fullName;
  document.getElementById('userRole').textContent = formatRole(role);

  document.getElementById('mobileUserAvatar').textContent = initials || 'U';
  document.getElementById('mobileUserName').textContent = fullName;
  document.getElementById('mobileUserRole').textContent = formatRole(role);
}

// ============================================
// FORMATEAR ROL
// ============================================

function formatRole(role) {
  if (!role) {
    return 'Sin rol';
  }

  return role
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

// ============================================
// LOGOUT
// ============================================

function logout() {
  sessionStorage.removeItem('agecare_token');
  sessionStorage.removeItem('agecare_user');
  window.location.replace('/');
}

// ============================================
// REDIRECCIÓN LOGIN
// ============================================

function redirectToLogin() {
  sessionStorage.removeItem('agecare_token');
  sessionStorage.removeItem('agecare_user');
  window.location.replace('/');
}

// ============================================
// VISTAS
// ============================================

const viewMeta = {
  comercial: [
    'Suscripciones y MRR',
    'Negocio y Ventas · Métricas de conversión y planes'
  ],

  pagos: [
    'Pasarela de Pagos',
    'Negocio y Ventas · Transacciones y Gestión de Cobros'
  ],

  monitoreo: [
    'Monitoreo de Residentes',
    'Administración · Seguimiento operativo y estados de residentes'
  ],

  auditoria: [
    'Auditoría Administrativa',
    'Administración · Trazabilidad de acciones'
  ]
};

let currentRowEditing = null;

function switchView(viewId) {
  document
    .querySelectorAll('.nav-item-btn')
    .forEach(button => {
      button.classList.remove('active');
    });

  document
    .querySelectorAll(`.nav-btn-${viewId}`)
    .forEach(button => {
      button.classList.add('active');
    });

  document
    .querySelectorAll('.view')
    .forEach(section => {
      section.classList.remove('active');
    });

  const selectedView = document.getElementById('view-' + viewId);

  if (selectedView) {
    selectedView.classList.add('active');
  }

  const metadata = viewMeta[viewId];

  if (metadata) {
    document.getElementById('tb-title').textContent = metadata[0];
    document.getElementById('tb-crumb').textContent = metadata[1];
  }
}

// ============================================
// FILTRAR TRANSACCIONES
// ============================================

function filterTransactions() {
  const textFilter = document
    .getElementById('searchTrx')
    .value
    .toLowerCase()
    .trim();

  const statusFilter = document
    .getElementById('selectStatus')
    .value;

  const rows = document.querySelectorAll('#trxTable tbody tr');

  let visibleCount = 0;

  rows.forEach(row => {
    const rowText = row.innerText.toLowerCase();
    const rowStatus = row.getAttribute('data-status');

    const matchesText =
      textFilter === '' ||
      rowText.includes(textFilter);

    const matchesStatus =
      statusFilter === 'Todos' ||
      rowStatus === statusFilter;

    if (matchesText && matchesStatus) {
      row.classList.remove('d-none');
      visibleCount++;
    } else {
      row.classList.add('d-none');
    }
  });

  const noResultsMsg = document.getElementById('noResultsMsg');

  if (visibleCount === 0) {
    noResultsMsg.classList.remove('d-none');
  } else {
    noResultsMsg.classList.add('d-none');
  }
}

// ============================================
// EXPORTAR CSV
// ============================================

function exportTableToCSV(filename = 'transacciones.csv') {
  const table = document.getElementById('trxTable');
  const rows = table.querySelectorAll('tr');
  const csv = [];

  rows.forEach(row => {
    if (row.classList.contains('d-none')) {
      return;
    }

    const cols = row.querySelectorAll('th, td');
    const rowData = [];

    cols.forEach((col, index) => {
      if (index === cols.length - 1) {
        return;
      }

      let text = col.innerText
        .replace(/(\r\n|\n|\r)/gm, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      text = text.replace(/"/g, '""');

      rowData.push(`"${text}"`);
    });

    if (rowData.length > 0) {
      csv.push(rowData.join(';'));
    }
  });

  if (csv.length === 0) {
    showToastNotification('No hay datos visibles para exportar');
    return;
  }

  const csvContent = '\uFEFF' + csv.join('\n');

  const blob = new Blob(
    [csvContent],
    {
      type: 'text/csv;charset=utf-8;'
    }
  );

  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

// ============================================
// PREPARAR MODAL PLAN
// ============================================

function prepareUpgradeModal(subscriptionId, clientName, currentPlan) {
  selectedSubscriptionId = subscriptionId;

  document.getElementById('modalClientName').value = clientName;
  document.getElementById('modalPlanSelect').value = currentPlan;
}

// ============================================
// ABRIR CANCELACIÓN
// ============================================

function openCancelSubscriptionModal(subscriptionId) {
  const subscription = currentSubscriptions.find(
    item => item.id === subscriptionId
  );

  if (!subscription) {
    showToastNotification('No se encontró la suscripción');
    return;
  }

  if (subscription.status === 'canceled') {
    showToastNotification('La suscripción ya se encuentra cancelada');
    return;
  }

  selectedCancelSubscriptionId = subscription.id;

  document.getElementById('cancelSubscriptionClient').textContent =
    subscription.display_name || 'No disponible';

  document.getElementById('cancelSubscriptionPlan').textContent =
    subscription.plan_name || 'Sin plan';

  document.getElementById('cancelSubscriptionStatus').textContent =
    subscription.status === 'active'
      ? 'Activa'
      : subscription.status === 'past_due'
        ? 'Morosa'
        : subscription.status;

  document.getElementById('cancelSubscriptionNextCharge').textContent =
    formatDate(subscription.current_period_end);

  const modal = new bootstrap.Modal(
    document.getElementById('modal-cancel-subscription')
  );

  modal.show();
}

// ============================================
// CANCELAR SUSCRIPCIÓN
// ============================================

async function cancelSubscription() {
  if (!selectedCancelSubscriptionId) {
    showToastNotification('No se pudo identificar la suscripción');
    return;
  }

  const cancelButton = document.getElementById(
    'confirmCancelSubscriptionButton'
  );

  try {
    cancelButton.disabled = true;

    cancelButton.innerHTML = `
      <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
      Cancelando...
    `;

    const response = await authenticatedFetch(
      `/api/billing/subscriptions/${selectedCancelSubscriptionId}/cancel`,
      {
        method: 'POST'
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        'No fue posible cancelar la suscripción'
      );
    }

    const modalElement = document.getElementById(
      'modal-cancel-subscription'
    );

    const modal = bootstrap.Modal.getInstance(modalElement);

    if (modal) {
      modal.hide();
    }

    showToastNotification('Suscripción cancelada correctamente');

    selectedCancelSubscriptionId = null;

    await Promise.all([
      loadSubscriptions(),
      loadCommercialMetrics()
    ]);

  } catch (error) {
    console.error(
      'Error cancelando suscripción:',
      error
    );

    showToastNotification(
      error.message ||
      'Error cancelando la suscripción'
    );

  } finally {
    cancelButton.disabled = false;

    cancelButton.innerHTML = `
      <i class="bi bi-x-circle me-1"></i>
      Confirmar Cancelación
    `;
  }
}

// ============================================
// GUARDAR CAMBIO PLAN
// ============================================

async function savePlanChange() {
  if (!selectedSubscriptionId) {
    showToastNotification(
      'No se pudo identificar la suscripción'
    );

    return;
  }

  const select = document.getElementById('modalPlanSelect');
  const planCode = select.value;

  const saveButton = document.querySelector(
    '#modal-upgrade .btn-primary'
  );

  try {
    saveButton.disabled = true;

    saveButton.innerHTML = `
      <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
      Guardando...
    `;

    const response = await authenticatedFetch(
      `/api/billing/subscriptions/${selectedSubscriptionId}/plan`,
      {
        method: 'PUT',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          plan_code: planCode
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        'No fue posible modificar el plan'
      );
    }

    const modalElement = document.getElementById(
      'modal-upgrade'
    );

    const modal = bootstrap.Modal.getInstance(modalElement);

    if (modal) {
      modal.hide();
    }

    showToastNotification(
      'Plan actualizado correctamente'
    );

    selectedSubscriptionId = null;

    await Promise.all([
      loadSubscriptions(),
      loadCommercialMetrics(),
      loadAuditLog()
    ]);

  } catch (error) {
    console.error(
      'Error modificando plan:',
      error
    );

    showToastNotification(
      error.message ||
      'Error modificando el plan'
    );

  } finally {
    saveButton.disabled = false;
    saveButton.innerHTML = 'Guardar Cambios';
  }
}

// ============================================
// REINTENTO PAGO
// ============================================

function retryPayment() {
  showToastNotification(
    'Solicitud de reintento iniciada'
  );
}

// ============================================
// TOAST
// ============================================

function showToastNotification(message) {
  const toastEl = document.getElementById(
    'toastNotification'
  );

  const toastBody = document.getElementById(
    'toastMessage'
  );

  toastBody.innerHTML = `
    <i class="bi bi-check-circle-fill text-success fs-6"></i>
    ${message}
  `;

  const toast = bootstrap.Toast.getOrCreateInstance(
    toastEl,
    {
      delay: 3000
    }
  );

  toast.show();
}

// ============================================
// FETCH AUTENTICADO
// ============================================

async function authenticatedFetch(url, options = {}) {
  const currentToken = sessionStorage.getItem(
    'agecare_token'
  );

  const response = await fetch(
    url,
    {
      ...options,

      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${currentToken}`
      }
    }
  );

  if (response.status === 401) {
    redirectToLogin();

    throw new Error(
      'Sesión expirada'
    );
  }

  return response;
}

// ============================================
// UTILIDADES
// ============================================

function escapeHtml(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatCurrency(
  amount,
  currency = 'CLP'
) {
  return new Intl.NumberFormat(
    'es-CL',
    {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0
    }
  ).format(
    Number(amount || 0)
  );
}

function formatDate(value) {
  if (!value) {
    return 'N/A';
  }

  return new Intl.DateTimeFormat(
    'es-CL',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }
  ).format(
    new Date(value)
  );
}

function formatDateTime(value) {
  if (!value) {
    return 'No disponible';
  }

  return new Intl.DateTimeFormat(
    'es-CL',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }
  ).format(
    new Date(value)
  );
}

function transactionStatusLabel(status) {
  const statuses = {
    approved: 'Aprobado',
    failed: 'Fallido',
    pending: 'Pendiente',
    canceled: 'Cancelado',
    refunded: 'Reembolsado',
    partially_refunded:
      'Reembolso parcial'
  };

  return (
    statuses[status] ||
    status ||
    'Desconocido'
  );
}

// ============================================
// MODAL TRANSACCIÓN
// ============================================

function openTransactionModal(transactionId) {
  const transaction = currentTransactions.find(
    item => item.id === transactionId
  );

  if (!transaction) {
    showToastNotification(
      'No se encontró la transacción'
    );

    return;
  }

  selectedTransactionId =
    transaction.id;

  const shortId = transaction.id
    .slice(-8)
    .toUpperCase();

  document.getElementById(
    'modalTransactionTitle'
  ).textContent =
    `Detalle de Transacción #${shortId}`;

  document.getElementById(
    'modalTransactionClient'
  ).textContent =
    transaction.display_name ||
    'No disponible';

  document.getElementById(
    'modalTransactionDate'
  ).textContent =
    formatDateTime(
      transaction.paid_at ||
      transaction.created_at
    );

  document.getElementById(
    'modalTransactionPlan'
  ).textContent =
    transaction.plan_name ||
    'Sin plan';

  document.getElementById(
    'modalTransactionConcept'
  ).textContent =
    transaction.description ||
    'Sin descripción';

  let paymentMethod =
    'No registrado';

  if (
    transaction.brand &&
    transaction.last4
  ) {
    paymentMethod =
      `${transaction.brand} •••• ${transaction.last4}`;
  }

  document.getElementById(
    'modalTransactionMethod'
  ).textContent =
    paymentMethod;

  document.getElementById(
    'modalTransactionStatus'
  ).textContent =
    transactionStatusLabel(
      transaction.status
    );

  document.getElementById(
    'modalTransactionProvider'
  ).textContent =
    transaction.provider ||
    'No disponible';

  document.getElementById(
    'modalTransactionProviderId'
  ).textContent =
    transaction.provider_payment_intent_id ||
    'No disponible';

  document.getElementById(
    'modalTransactionTotal'
  ).textContent =
    formatCurrency(
      transaction.amount,
      transaction.currency_code
    );

  const refundButton = document.getElementById(
    'refundTransactionButton'
  );

  if (!isAdmin()) {
    refundButton.classList.add(
      'd-none'
    );
  } else {
    refundButton.classList.remove(
      'd-none'
    );

    refundButton.disabled =
      transaction.status !== 'approved';
  }

  const modal = new bootstrap.Modal(
    document.getElementById(
      'modal-detalle'
    )
  );

  modal.show();
}

// ============================================
// CONFIRMACIÓN REEMBOLSO
// ============================================

function openRefundConfirmation() {
  if (!selectedTransactionId) {
    showToastNotification(
      'No se pudo identificar la transacción'
    );

    return;
  }

  const transaction =
    currentTransactions.find(
      item =>
        item.id === selectedTransactionId
    );

  if (!transaction) {
    showToastNotification(
      'No se encontró la transacción'
    );

    return;
  }

  if (
    transaction.status !== 'approved'
  ) {
    showToastNotification(
      'Solo se pueden reembolsar transacciones aprobadas'
    );

    return;
  }

  const shortId =
    transaction.id
      .slice(-8)
      .toUpperCase();

  document.getElementById(
    'refundClient'
  ).textContent =
    transaction.display_name ||
    'No disponible';

  document.getElementById(
    'refundTransactionId'
  ).textContent =
    `#${shortId}`;

  document.getElementById(
    'refundPlan'
  ).textContent =
    transaction.plan_name ||
    'Sin plan';

  document.getElementById(
    'refundAmount'
  ).textContent =
    formatCurrency(
      transaction.amount,
      transaction.currency_code
    );

  const detailModalElement =
    document.getElementById(
      'modal-detalle'
    );

  const detailModal =
    bootstrap.Modal.getInstance(
      detailModalElement
    );

  if (detailModal) {
    detailModal.hide();
  }

  detailModalElement.addEventListener(
    'hidden.bs.modal',
    () => {
      const refundModal =
        new bootstrap.Modal(
          document.getElementById(
            'modal-refund'
          )
        );

      refundModal.show();
    },
    {
      once: true
    }
  );
}

// ============================================
// REEMBOLSO
// ============================================

async function requestTransactionRefund() {
  if (!selectedTransactionId) {
    showToastNotification(
      'No se pudo identificar la transacción'
    );

    return;
  }

  const refundButton =
    document.getElementById(
      'confirmRefundButton'
    );

  try {
    refundButton.disabled = true;

    refundButton.innerHTML = `
      <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
      Procesando...
    `;

    const response =
      await authenticatedFetch(
        `/api/billing/transactions/${selectedTransactionId}/refund`,
        {
          method: 'POST'
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        'No fue posible realizar el reembolso'
      );
    }

    const refundModalElement =
      document.getElementById(
        'modal-refund'
      );

    const refundModal =
      bootstrap.Modal.getInstance(
        refundModalElement
      );

    if (refundModal) {
      refundModal.hide();
    }

    showToastNotification(
      'Reembolso registrado correctamente'
    );

    selectedTransactionId = null;

    await Promise.all([
      loadTransactions(),
      loadMetrics()
    ]);

  } catch (error) {
    console.error(
      'Error realizando reembolso:',
      error
    );

    showToastNotification(
      error.message ||
      'Error realizando el reembolso'
    );

  } finally {
    refundButton.disabled = false;

    refundButton.innerHTML = `
      <i class="bi bi-arrow-counterclockwise me-1"></i>
      Confirmar Reembolso
    `;
  }
}

// ============================================
// TIPO DE CUENTA
// ============================================

function formatAccountType(type) {
  const types = {
    family: 'Familia',
    agency: 'Agencia',
    caregiver: 'Cuidador'
  };

  return types[type] || type;
}

// ============================================
// MÉTRICAS
// ============================================

async function loadMetrics() {
  try {
    const response =
      await authenticatedFetch(
        '/api/billing/metrics'
      );

    if (!response.ok) {
      throw new Error(
        'Error cargando métricas'
      );
    }

    const data =
      await response.json();

    const metrics =
      data.metrics;

    document.getElementById(
      'kpiApprovedToday'
    ).textContent =
      metrics.approved_today;

    document.getElementById(
      'kpiApprovedAmount'
    ).textContent =
      formatCurrency(
        metrics.approved_amount_today
      );

    document.getElementById(
      'kpiFailedTransactions'
    ).textContent =
      metrics.failed_transactions;

    document.getElementById(
      'kpiSuccessRate'
    ).textContent =
      `${metrics.success_rate}%`;

  } catch (error) {
    console.error(
      'Error cargando métricas:',
      error
    );
  }
}

// ============================================
// TRANSACCIONES
// ============================================

async function loadTransactions() {
  const tbody =
    document.getElementById(
      'transactionsBody'
    );

  try {
    const response =
      await authenticatedFetch(
        '/api/billing/transactions'
      );

    if (!response.ok) {
      throw new Error(
        'Error cargando transacciones'
      );
    }

    const data =
      await response.json();

    currentTransactions =
      data.transactions || [];

    const transactions =
      currentTransactions;

    if (!transactions.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted py-4">
            No hay transacciones registradas.
          </td>
        </tr>
      `;

      return;
    }

    tbody.innerHTML =
      transactions
        .map(
          transaction => {
            let statusLabel = '';
            let statusClass =
              'neutral';
            let icon = '●';

            switch (
              transaction.status
            ) {
              case 'approved':
                statusLabel =
                  'Aprobado';

                statusClass =
                  'ok';

                icon = '✔';

                break;

              case 'failed':
                statusLabel =
                  'Fallido';

                statusClass =
                  'crit';

                icon = '✖';

                break;

              case 'refunded':
                statusLabel =
                  'Reembolsado';

                statusClass =
                  'warn';

                icon = '↩';

                break;

              case 'partially_refunded':
                statusLabel =
                  'Reembolso parcial';

                statusClass =
                  'warn';

                icon = '↩';

                break;

              case 'pending':
                statusLabel =
                  'Pendiente';

                break;

              case 'canceled':
                statusLabel =
                  'Cancelado';

                statusClass =
                  'crit';

                icon = '✖';

                break;

              default:
                statusLabel =
                  transaction.status;
            }

            const shortId =
              transaction.id
                .slice(-8)
                .toUpperCase();

            return `
              <tr data-status="${statusLabel}">
                <td>
                  <span class="font-monospace text-muted">
                    #${shortId}
                  </span>
                </td>

                <td>
                  <div class="fw-semibold">
                    ${escapeHtml(
                      transaction.display_name
                    )}
                  </div>

                  <div class="text-muted" style="font-size:10.5px;">
                    ${escapeHtml(
                      formatAccountType(
                        transaction.account_type
                      )
                    )}
                  </div>
                </td>

                <td>
                  <span class="chip neutral">
                    ${escapeHtml(
                      transaction.plan_name ||
                      'Sin plan'
                    )}
                  </span>
                </td>

                <td class="text-end fw-semibold">
                  ${formatCurrency(
                    transaction.amount,
                    transaction.currency_code
                  )}
                </td>

                <td>
                  <span class="chip ${statusClass}">
                    ${icon}
                    ${escapeHtml(statusLabel)}
                  </span>
                </td>

                <td>
                  <button
                    class="action-btn"
                    type="button"
                    onclick="openTransactionModal('${transaction.id}')"
                  >
                    Ver Recibo
                  </button>
                </td>
              </tr>
            `;
          }
        )
        .join('');

  } catch (error) {
    console.error(
      'Error cargando transacciones:',
      error
    );

    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-danger py-4">
          No fue posible cargar las transacciones.
        </td>
      </tr>
    `;
  }
}

// ============================================
// SUSCRIPCIONES
// ============================================

async function loadSubscriptions() {
  const tbody =
    document.getElementById(
      'subscriptionsBody'
    );

  try {
    const response =
      await authenticatedFetch(
        '/api/billing/subscriptions'
      );

    if (!response.ok) {
      throw new Error(
        'Error cargando suscripciones'
      );
    }

    const data =
      await response.json();

    currentSubscriptions =
      data.subscriptions || [];

    const subscriptions =
      currentSubscriptions;

    if (!subscriptions.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted py-4">
            No hay suscripciones registradas.
          </td>
        </tr>
      `;

      return;
    }

    tbody.innerHTML =
      subscriptions
        .map(
          subscription => {
            let statusLabel = '';
            let statusClass =
              'neutral';

            switch (
              subscription.status
            ) {
              case 'active':
                statusLabel =
                  'Activa';

                statusClass =
                  'ok';

                break;

              case 'past_due':
                statusLabel =
                  'Morosa';

                statusClass =
                  'crit';

                break;

              case 'trialing':
                statusLabel =
                  'Periodo de prueba';

                break;

              case 'pending':
                statusLabel =
                  'Pendiente';

                break;

              case 'paused':
                statusLabel =
                  'Pausada';

                statusClass =
                  'warn';

                break;

              case 'canceled':
                statusLabel =
                  'Cancelada';

                statusClass =
                  'crit';

                break;

              default:
                statusLabel =
                  subscription.status;
            }

            let paymentMethod =
              'No registrado';

            if (
              subscription.brand &&
              subscription.last4
            ) {
              paymentMethod =
                `${escapeHtml(
                  subscription.brand
                )} •••• ${escapeHtml(
                  subscription.last4
                )}`;
            }

            let nextCharge =
              formatDate(
                subscription.current_period_end
              );

            if (
              subscription.status ===
              'canceled'
            ) {
              nextCharge =
                'Cancelada';
            }

            return `
              <tr>
                <td>
                  <div class="fw-semibold">
                    ${escapeHtml(
                      subscription.display_name
                    )}
                  </div>

                  <div class="text-muted" style="font-size:10.5px;">
                    ${escapeHtml(
                      formatAccountType(
                        subscription.account_type
                      )
                    )}
                  </div>
                </td>

                <td>
                  <span class="chip neutral">
                    ${escapeHtml(
                      subscription.plan_name
                    )}
                  </span>
                </td>

                <td>
                  <span class="chip ${statusClass}">
                    ${escapeHtml(statusLabel)}
                  </span>
                </td>

                <td>
                  ${nextCharge}
                </td>

                <td>
                  ${paymentMethod}
                </td>

                <td>
                  <div class="d-flex flex-wrap gap-1">

                    ${
                      isAdmin()

                        ? (
                            subscription.status !==
                            'canceled'

                              ? `
                                <button
                                  class="action-btn"
                                  type="button"
                                  data-bs-toggle="modal"
                                  data-bs-target="#modal-upgrade"
                                  onclick="prepareUpgradeModal(
                                    '${subscription.id}',
                                    '${escapeHtml(
                                      subscription.display_name
                                    )}',
                                    '${subscription.plan_code}'
                                  )"
                                >
                                  Modificar Plan
                                </button>

                                <button
                                  class="action-btn text-danger"
                                  type="button"
                                  onclick="openCancelSubscriptionModal('${subscription.id}')"
                                >
                                  Cancelar
                                </button>
                              `

                              : `
                                <span class="text-muted small">
                                  Sin acciones
                                </span>
                              `
                          )

                        : `
                          <span class="text-muted small">
                            <i class="bi bi-eye me-1"></i>
                            Solo lectura
                          </span>
                        `
                    }

                  </div>
                </td>
              </tr>
            `;
          }
        )
        .join('');

  } catch (error) {
    console.error(
      'Error cargando suscripciones:',
      error
    );

    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-danger py-4">
          No fue posible cargar las suscripciones.
        </td>
      </tr>
    `;
  }
}

// ============================================
// MONITOREO DE RESIDENTES
// ============================================

function residentStatusPresentation(status) {
  const map = {
    RIESGOSO: {
      label: 'Riesgoso',
      chip: 'crit',
      icon: 'bi-exclamation-octagon-fill'
    },

    ALERTA: {
      label: 'Alerta',
      chip: 'warn',
      icon: 'bi-exclamation-triangle-fill'
    },

    NORMAL: {
      label: 'Normal',
      chip: 'ok',
      icon: 'bi-check-circle-fill'
    },

    SIN_REGISTRAR: {
      label: 'Sin registrar',
      chip: 'neutral',
      icon: 'bi-dash-circle'
    }
  };

  return (
    map[status] ||
    map.SIN_REGISTRAR
  );
}

// ============================================
// EDAD DEL RESIDENTE
// ============================================

function calculateResidentAge(birthDate) {
  if (!birthDate) return null;

  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birth.getDate())
  ) {
    age--;
  }

  return age;
}


// ============================================
// RENDER HISTORIAL RESIDENTE
// ============================================

function renderResidentHistoryList(history) {
  const container = document.getElementById('residentHistoryList');

  if (!history || history.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted border rounded-3 p-4">
        Todavía no existen registros de estado para este residente.
      </div>
    `;
    return;
  }

  container.innerHTML = history.map(item => {
    const presentation = residentStatusPresentation(item.status_code);

    const caregiverName = [
      item.caregiver_first_name,
      item.caregiver_last_name,
      item.caregiver_second_last_name
    ]
      .filter(Boolean)
      .join(' ') || 'Cuidador no identificado';

    return `
      <div class="border rounded-3 p-3 mb-2">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div>
            <span class="chip ${presentation.chip}">
              <i class="bi ${presentation.icon}"></i>
              ${escapeHtml(presentation.label)}
            </span>

            <div class="fw-semibold mt-2">
              ${escapeHtml(item.observation || 'Sin observaciones.')}
            </div>

            <div class="text-muted mt-1" style="font-size:11.5px;">
              <i class="bi bi-person me-1"></i>
              ${escapeHtml(caregiverName)}
            </div>
          </div>

          <div class="text-muted text-end" style="font-size:11.5px;">
            <i class="bi bi-clock me-1"></i>
            ${escapeHtml(formatDateTime(item.created_at))}
          </div>
        </div>
      </div>
    `;
  }).join('');
}


// ============================================
// ABRIR HISTORIAL DEL RESIDENTE
// ============================================

async function openResidentHistory(residentId) {
  const modalElement = document.getElementById('residentHistoryModal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalElement);

  const loader = document.getElementById('residentHistoryLoader');
  const content = document.getElementById('residentHistoryContent');
  const errorBox = document.getElementById('residentHistoryError');

  loader.classList.remove('d-none');
  content.classList.add('d-none');
  errorBox.classList.add('d-none');
  errorBox.textContent = '';

  modal.show();

  try {
    const response = await authenticatedFetch(
      `/api/admin/monitoring/residents/${residentId}/history`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        'No fue posible cargar el historial del residente'
      );
    }

    const resident = data.resident;
    const metrics = data.history_metrics || {};
    const history = data.history || [];

    // ========================================
    // NOMBRE
    // ========================================

    const residentName = [
      resident.first_name,
      resident.first_last_name,
      resident.second_last_name
    ]
      .filter(Boolean)
      .join(' ');

    document.getElementById('historyResidentName').textContent =
      residentName || 'Residente';

    document.getElementById('historyResidentRun').textContent =
      `RUN: ${resident.run_number}-${resident.check_digit}`;

    // ========================================
    // DATOS GENERALES
    // ========================================

    document.getElementById('historyFamilyGroup').textContent =
      resident.family_group_name || 'Sin núcleo';

    const assignedCaregiver = [
      resident.assigned_caregiver_first_name,
      resident.assigned_caregiver_last_name
    ]
      .filter(Boolean)
      .join(' ');

    document.getElementById('historyAssignedCaregiver').textContent =
      assignedCaregiver || 'Sin cuidador asignado';

    const age = calculateResidentAge(resident.birth_date);

    document.getElementById('historyResidentAge').textContent =
      age !== null
        ? `${age} años`
        : 'No registrada';

    // ========================================
    // ESTADO ACTUAL
    // ========================================

    const currentStatus =
      resident.current_status_code ||
      'SIN_REGISTRAR';

    const presentation =
      residentStatusPresentation(currentStatus);

    document.getElementById('historyCurrentStatus').innerHTML = `
      <span class="chip ${presentation.chip}">
        <i class="bi ${presentation.icon}"></i>
        ${escapeHtml(presentation.label)}
      </span>
    `;

    const recordedBy = [
      resident.current_recorded_by_first_name,
      resident.current_recorded_by_last_name
    ]
      .filter(Boolean)
      .join(' ');

    if (resident.current_updated_at) {
      document.getElementById('historyCurrentMeta').textContent =
        `Actualizado ${formatDateTime(resident.current_updated_at)}${
          recordedBy ? ` · Registrado por ${recordedBy}` : ''
        }`;
    } else {
      document.getElementById('historyCurrentMeta').textContent =
        'Todavía no existe un estado registrado.';
    }

    document.getElementById('historyCurrentObservation').textContent =
      resident.current_observation ||
      'Sin observaciones registradas.';

    // ========================================
    // SALUD
    // ========================================

    document.getElementById('historyHealthNotes').textContent =
      resident.health_notes ||
      'Sin información adicional registrada.';

    // ========================================
    // KPI HISTORIAL
    // ========================================

    document.getElementById('historyTotalRecords').textContent =
      metrics.total ?? 0;

    document.getElementById('historyNormalRecords').textContent =
      metrics.normal ?? 0;

    document.getElementById('historyAlertRecords').textContent =
      metrics.alert ?? 0;

    document.getElementById('historyRiskyRecords').textContent =
      metrics.risky ?? 0;

    // ========================================
    // HISTORIAL
    // ========================================

    renderResidentHistoryList(history);

    loader.classList.add('d-none');
    content.classList.remove('d-none');

  } catch (error) {
    console.error(
      'Error cargando historial del residente:',
      error
    );

    loader.classList.add('d-none');

    errorBox.textContent =
      error.message ||
      'No fue posible cargar el historial.';

    errorBox.classList.remove('d-none');
  }
}

// ============================================
// KPIS MONITOREO
// ============================================

function updateResidentMonitoringMetrics(
  metrics = {}
) {
  document.getElementById(
    'monitorTotalResidents'
  ).textContent =
    metrics.total ?? 0;

  document.getElementById(
    'monitorRisky'
  ).textContent =
    metrics.risky ?? 0;

  document.getElementById(
    'monitorAlert'
  ).textContent =
    metrics.alert ?? 0;

  document.getElementById(
    'monitorNormal'
  ).textContent =
    metrics.normal ?? 0;

  document.getElementById(
    'monitorNoStatus'
  ).textContent =
    metrics.unregistered ?? 0;
}

// ============================================
// RENDER MONITOREO
// ============================================

function renderResidentMonitoring(residents) {
  const tbody =
    document.getElementById(
      'monitoringBody'
    );

  if (!residents.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">
          No hay residentes activos para monitorear.
        </td>
      </tr>
    `;

    return;
  }

  tbody.innerHTML =
    residents
      .map(
        item => {
          const status =
            item.status_code ||
            'SIN_REGISTRAR';

          const presentation =
            residentStatusPresentation(
              status
            );

          const residentName = [
            item.first_name,
            item.first_last_name,
            item.second_last_name
          ]
            .filter(Boolean)
            .join(' ');

          const assignedCaregiver = [
            item.assigned_caregiver_first_name,
            item.assigned_caregiver_last_name
          ]
            .filter(Boolean)
            .join(' ') ||
            'Sin cuidador asignado';

          const recordedBy = [
            item.recorded_by_first_name,
            item.recorded_by_last_name
          ]
            .filter(Boolean)
            .join(' ');

          const lastControl =
            item.updated_at

              ? `
                ${formatDateTime(
                  item.updated_at
                )}

                ${
                  recordedBy
                    ? `
                      <div class="text-muted mt-1">
                        Por ${escapeHtml(recordedBy)}
                      </div>
                    `
                    : ''
                }
              `

              : `
                <span class="text-muted">
                  Sin registro
                </span>
              `;

          const observation =
            item.observation

              ? escapeHtml(
                  item.observation
                )

              : `
                <span class="text-muted">
                  Sin observación
                </span>
              `;

          const rowClass =
            status === 'RIESGOSO'

              ? 'monitor-row-risky'

              : status === 'ALERTA'

                ? 'monitor-row-alert'

                : '';

          return `
            <tr
              class="${rowClass}"
              data-status="${escapeHtml(status)}"
            >

              <td>
                <span class="chip ${presentation.chip}">
                  <i class="bi ${presentation.icon}"></i>
                  ${presentation.label}
                </span>
              </td>

              <td>
                <button
                  type="button"
                  class="action-btn p-0 text-start monitor-resident-name"
                  onclick="openResidentHistory('${item.id}')"
                >
                  <i class="bi bi-person-lines-fill me-1"></i>
                  ${escapeHtml(residentName)}
                </button>

                <div class="text-muted mt-1">
                  RUN ${escapeHtml(item.run_number)}-${escapeHtml(item.check_digit)}
                </div>

                <button
                  type="button"
                  class="btn btn-link btn-sm p-0 mt-1 text-decoration-none"
                  style="font-size:11px;"
                  onclick="openResidentHistory('${item.id}')"
                >
                  Ver historial
                  <i class="bi bi-chevron-right ms-1"></i>
                </button>
              </td>

              <td>
                ${escapeHtml(
                  item.family_group_name ||
                  'Sin núcleo'
                )}
              </td>

              <td>
                ${escapeHtml(
                  assignedCaregiver
                )}
              </td>

              <td>
                ${lastControl}
              </td>

              <td class="monitor-observation">
                ${observation}
              </td>

            </tr>
          `;
        }
      )
      .join('');
}

// ============================================
// CARGAR MONITOREO
// ============================================

async function loadResidentMonitoring() {
  const tbody =
    document.getElementById(
      'monitoringBody'
    );

  if (!tbody) {
    return;
  }

  tbody.innerHTML = `
    <tr>
      <td colspan="6" class="text-center text-muted py-4">
        <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
        Cargando monitoreo...
      </td>
    </tr>
  `;

  try {
    const response =
      await authenticatedFetch(
        '/api/admin/monitoring/residents'
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        'No fue posible cargar el monitoreo'
      );
    }

    currentResidentMonitoring =
      data.residents || [];
    
    detectNewRiskyResidents(
      currentResidentMonitoring
    );

    renderResidentMonitoring(
      currentResidentMonitoring
    );

    updateResidentMonitoringMetrics(
      data.metrics || {}
    );

    filterResidentMonitoring();

  } catch (error) {
    console.error(
      'Error cargando monitoreo de residentes:',
      error
    );

    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-danger py-4">
          ${escapeHtml(
            error.message ||
            'No fue posible cargar el monitoreo.'
          )}
        </td>
      </tr>
    `;
  }
}

// ============================================
// FILTRAR MONITOREO
// ============================================

function filterResidentMonitoring() {
  const searchInput =
    document.getElementById(
      'monitorSearch'
    );

  const statusSelect =
    document.getElementById(
      'monitorStatusFilter'
    );

  const noResults =
    document.getElementById(
      'monitorNoResults'
    );

  if (
    !searchInput ||
    !statusSelect ||
    !noResults
  ) {
    return;
  }

  const search =
    searchInput.value
      .toLowerCase()
      .trim();

  const status =
    statusSelect.value;

  const rows =
    document.querySelectorAll(
      '#monitoringBody tr[data-status]'
    );

  let visible = 0;

  rows.forEach(
    row => {
      const matchesSearch =
        !search ||
        row.innerText
          .toLowerCase()
          .includes(search);

      const matchesStatus =
        status === 'Todos' ||
        row.dataset.status ===
        status;

      row.classList.toggle(
        'd-none',
        !(
          matchesSearch &&
          matchesStatus
        )
      );

      if (
        matchesSearch &&
        matchesStatus
      ) {
        visible++;
      }
    }
  );

  noResults.classList.toggle(
    'd-none',
    visible !== 0 ||
    rows.length === 0
  );
}

// ============================================
// CARGAR DASHBOARD COMPLETO
// ============================================

async function loadBillingDashboard() {
  await Promise.all([
    loadMetrics(),
    loadTransactions(),
    loadSubscriptions(),
    loadCommercialMetrics(),
    loadAuditLog(),
    loadResidentMonitoring()
  ]);
}

// ============================================
// MÉTRICAS COMERCIALES
// ============================================

async function loadCommercialMetrics() {
  try {
    const response =
      await authenticatedFetch(
        '/api/billing/commercial-metrics'
      );

    if (!response.ok) {
      throw new Error(
        'No fue posible cargar las métricas comerciales'
      );
    }

    const data =
      await response.json();

    const metrics =
      data.metrics;

    document.getElementById(
      'commercialTotalAccounts'
    ).textContent =
      metrics.total_accounts;

    document.getElementById(
      'commercialPaidSubscriptions'
    ).textContent =
      metrics.paid_subscriptions;

    document.getElementById(
      'commercialActiveSubscriptions'
    ).textContent =
      `${metrics.active_subscriptions} suscripciones activas`;

    document.getElementById(
      'commercialMRR'
    ).textContent =
      formatCurrency(
        metrics.mrr,
        'CLP'
      );

    document.getElementById(
      'commercialCanceled'
    ).textContent =
      metrics.canceled_this_month;

  } catch (error) {
    console.error(
      'Error cargando métricas comerciales:',
      error
    );
  }
}

// ============================================
// AUDITORÍA
// ============================================

function auditActionLabel(action) {
  const labels = {
    subscription_plan_changed:
      'Cambio de plan',

    payment_refunded:
      'Reembolso',

    subscription_canceled:
      'Cancelación de suscripción',

    family_group_created:
      'Núcleo familiar creado',

    resident_created:
      'Residente creado',

    representative_created:
      'Representante creado',

    resident_representative_assigned:
      'Representante asignado',

    caregiver_created:
      'Cuidador creado',

    caregiver_family_group_assigned:
      'Cuidador asignado'
  };

  return labels[action] || action;
}

function auditActionClass(action) {
  const classes = {
    subscription_plan_changed:
      'neutral',

    payment_refunded:
      'warn',

    subscription_canceled:
      'crit',

    family_group_created:
      'neutral',

    resident_created:
      'ok',

    representative_created:
      'neutral',

    resident_representative_assigned:
      'neutral',

    caregiver_created:
      'ok',

    caregiver_family_group_assigned:
      'neutral'
  };

  return (
    classes[action] ||
    'neutral'
  );
}

function formatAuditValue(value) {
  if (!value) {
    return '—';
  }

  if (
    typeof value === 'string'
  ) {
    return value;
  }

  const entries =
    Object.entries(value);

  if (!entries.length) {
    return '—';
  }

  return entries
    .map(
      ([key, val]) => {
        const labels = {
          plan_code: 'Plan',
          status: 'Estado',
          refunded_amount:
            'Reembolsado',
          cancel_at_period_end:
            'Cancelar al fin',
          canceled_at:
            'Cancelado'
        };

        const label =
          labels[key] ||
          key;

        let displayValue =
          val;

        if (
          key === 'refunded_amount' &&
          val !== null
        ) {
          displayValue =
            formatCurrency(
              val,
              'CLP'
            );
        }

        if (
          key === 'canceled_at' &&
          val
        ) {
          displayValue =
            formatDateTime(val);
        }

        if (
          key === 'cancel_at_period_end'
        ) {
          displayValue =
            val
              ? 'Sí'
              : 'No';
        }

        return (
          `${label}: ${
            displayValue ??
            '—'
          }`
        );
      }
    )
    .join(' · ');
}

// ============================================
// CARGAR AUDITORÍA
// ============================================

async function loadAuditLog() {
  const tbody =
    document.getElementById(
      'auditBody'
    );

  try {
    const response =
      await authenticatedFetch(
        '/api/admin/audit?limit=100'
      );

    if (!response.ok) {
      throw new Error(
        'No fue posible cargar la auditoría'
      );
    }

    const data =
      await response.json();

    currentAuditEntries =
      data.audit || [];

    renderAuditLog(
      currentAuditEntries
    );

    updateAuditMetrics(
      currentAuditEntries
    );

  } catch (error) {
    console.error(
      'Error cargando auditoría:',
      error
    );

    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-danger py-4">
          No fue posible cargar la auditoría.
        </td>
      </tr>
    `;
  }
}

// ============================================
// RENDER AUDITORÍA
// ============================================

function renderAuditLog(entries) {
  const tbody =
    document.getElementById(
      'auditBody'
    );

  if (!entries.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">
          No hay registros de auditoría.
        </td>
      </tr>
    `;

    return;
  }

  tbody.innerHTML =
    entries
      .map(
        entry => {
          const actionLabel =
            auditActionLabel(
              entry.action
            );

          const actionClass =
            auditActionClass(
              entry.action
            );

          return `
            <tr data-action="${escapeHtml(entry.action)}">

              <td>
                ${formatDateTime(
                  entry.created_at
                )}
              </td>

              <td>
                <div class="fw-semibold">
                  ${escapeHtml(
                    entry.actor_name ||
                    'Sistema'
                  )}
                </div>

                <div class="text-muted" style="font-size:10.5px;">
                  ${escapeHtml(
                    formatRole(
                      entry.actor_role ||
                      'sin rol'
                    )
                  )}
                </div>
              </td>

              <td>
                ${escapeHtml(
                  entry.subject_name ||
                  'No disponible'
                )}
              </td>

              <td>
                <span class="chip ${actionClass}">
                  ${escapeHtml(
                    actionLabel
                  )}
                </span>
              </td>

              <td>
                <div
                  class="text-muted"
                  style="max-width:300px;"
                >
                  ${escapeHtml(
                    formatAuditValue(
                      entry.before
                    )
                  )}
                </div>
              </td>

              <td>
                <div
                  style="max-width:300px;"
                >
                  ${escapeHtml(
                    formatAuditValue(
                      entry.after
                    )
                  )}
                </div>
              </td>

            </tr>
          `;
        }
      )
      .join('');
}

// ============================================
// MÉTRICAS AUDITORÍA
// ============================================

function updateAuditMetrics(entries) {
  document.getElementById(
    'auditTotalActions'
  ).textContent =
    entries.length;

  document.getElementById(
    'auditPlanChanges'
  ).textContent =
    entries.filter(
      entry =>
        entry.action ===
        'subscription_plan_changed'
    ).length;

  document.getElementById(
    'auditCriticalActions'
  ).textContent =
    entries.filter(
      entry =>
        entry.action ===
          'payment_refunded' ||
        entry.action ===
          'subscription_canceled'
    ).length;
}

// ============================================
// FILTRAR AUDITORÍA
// ============================================

function filterAuditLog() {
  const search =
    document
      .getElementById(
        'auditSearch'
      )
      .value
      .toLowerCase()
      .trim();

  const action =
    document
      .getElementById(
        'auditActionFilter'
      )
      .value;

  const rows =
    document.querySelectorAll(
      '#auditBody tr'
    );

  let visible = 0;

  rows.forEach(
    row => {
      const rowText =
        row.innerText
          .toLowerCase();

      const rowAction =
        row.getAttribute(
          'data-action'
        );

      const matchesSearch =
        search === '' ||
        rowText.includes(search);

      const matchesAction =
        action === 'Todos' ||
        rowAction === action;

      if (
        matchesSearch &&
        matchesAction
      ) {
        row.classList.remove(
          'd-none'
        );

        visible++;

      } else {
        row.classList.add(
          'd-none'
        );
      }
    }
  );

  document.getElementById(
    'auditNoResults'
  ).classList.toggle(
    'd-none',
    visible !== 0
  );
}

// ============================================
// INTERFAZ POR ROL
// ============================================

function applyRoleInterface() {
  const envBadge =
    document.querySelector(
      '.env-badge'
    );

  if (!envBadge) {
    return;
  }

  if (isAnalyst()) {
    envBadge.innerHTML = `
      <i class="bi bi-eye-fill me-1"></i>
      Modo solo lectura
    `;
  } else {
    envBadge.innerHTML = `
      <i class="bi bi-check-circle-fill me-1"></i>
      Sesión verificada
    `;
  }
}

// ============================================
// PROTECCIÓN DEL PORTAL ADMINISTRATIVO
// ============================================

function protectAdministrativePortal(user) {
  if (
    user.user_type === 'app' &&
    user.role_code === 'caregiver'
  ) {
    window.location.replace(
      '/caregiver.html'
    );

    return false;
  }

  const administrativeRoles = [
    'admin',
    'analyst'
  ];

  if (
    user.user_type !== 'admin' ||
    !administrativeRoles.includes(
      user.role_code
    )
  ) {
    sessionStorage.removeItem(
      'agecare_token'
    );

    sessionStorage.removeItem(
      'agecare_user'
    );

    window.location.replace('/');

    return false;
  }

  return true;
}


// ============================================
// MONITOREO AUTOMÁTICO DE RESIDENTES
// ============================================

let residentMonitoringInterval = null;
let residentMonitoringRequestRunning = false;

function startResidentMonitoringAutoRefresh() {
  if (residentMonitoringInterval) {
    return;
  }

  residentMonitoringInterval = setInterval(
    async () => {
      const monitoringView = document.getElementById('view-monitoreo');

      // Solo consultamos si el usuario está viendo
      // actualmente el módulo de monitoreo.
      if (
        !monitoringView ||
        !monitoringView.classList.contains('active')
      ) {
        return;
      }

      // Evita que una petición se solape con otra.
      if (residentMonitoringRequestRunning) {
        return;
      }

      residentMonitoringRequestRunning = true;

      try {
        await refreshResidentMonitoringSilently();

      } catch (error) {
        console.error(
          'Error actualizando monitoreo automáticamente:',
          error
        );

      } finally {
        residentMonitoringRequestRunning = false;
      }

    },
    5000
  );
}

// ============================================
// DETECTAR NUEVOS ESTADOS RIESGOSOS
// ============================================

function detectNewRiskyResidents(residents) {
  if (!monitoringBaselineReady) {
    residents.forEach(resident => {
      previousResidentStatuses.set(
        resident.id,
        resident.status_code || 'SIN_REGISTRAR'
      );
    });

    monitoringBaselineReady = true;
    return;
  }

  residents.forEach(resident => {
    const currentStatus =
      resident.status_code || 'SIN_REGISTRAR';

    const previousStatus =
      previousResidentStatuses.get(resident.id);

    if (
      previousStatus &&
      previousStatus !== 'RIESGOSO' &&
      currentStatus === 'RIESGOSO'
    ) {
      showRiskyResidentAlert(resident);
    }

    previousResidentStatuses.set(
      resident.id,
      currentStatus
    );
  });
}

// ============================================
// ALERTA VISUAL DE RESIDENTE RIESGOSO
// ============================================

function showRiskyResidentAlert(resident) {
  const residentName = [
    resident.first_name,
    resident.first_last_name,
    resident.second_last_name
  ]
    .filter(Boolean)
    .join(' ');

  const toastEl =
    document.getElementById('toastNotification');

  const toastBody =
    document.getElementById('toastMessage');

  toastBody.innerHTML = `
    <i class="bi bi-exclamation-octagon-fill text-danger fs-5"></i>

    <div>
      <div class="fw-bold text-danger">
        Estado riesgoso detectado
      </div>

      <div class="small">
        ${escapeHtml(residentName)}
      </div>

      ${
        resident.observation
          ? `
            <div class="small text-white-50 mt-1">
              ${escapeHtml(resident.observation)}
            </div>
          `
          : ''
      }
    </div>
  `;

  const toast =
    bootstrap.Toast.getOrCreateInstance(
      toastEl,
      {
        delay: 7000
      }
    );

  toast.show();
}




// ============================================
// ACTUALIZACIÓN SILENCIOSA
// ============================================

async function refreshResidentMonitoringSilently() {
  const response = await authenticatedFetch(
    '/api/admin/monitoring/residents'
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ||
      'No fue posible actualizar el monitoreo'
    );
  }

  currentResidentMonitoring =
    data.residents || [];

  detectNewRiskyResidents(
    currentResidentMonitoring
  );

  renderResidentMonitoring(
    currentResidentMonitoring
  );

  updateResidentMonitoringMetrics(
    data.metrics || {}
  );

  filterResidentMonitoring();
}



// ============================================
// INICIAR
// ============================================

validateSession();