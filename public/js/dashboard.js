

let selectedSubscriptionId = null;
let selectedCancelSubscriptionId = null;
let currentSubscriptions = [];
let currentTransactions = [];
let selectedTransactionId = null;
let currentAuditEntries = [];
  
  // ============================================
  // SESIÓN
  // ============================================

  const token =
    sessionStorage.getItem('agecare_token');
  const sessionLoader =
    document.getElementById('sessionLoader');
  const appRoot =
    document.getElementById('appRoot');



  // ============================================
  // VALIDAR SESIÓN
  // ============================================

  async function validateSession() {
    if (!token) {
      redirectToLogin();
      return;
    }
    try {
      const response =
        await fetch('/api/auth/me', {
          method: 'GET',
          headers: {
            'Authorization':
              `Bearer ${token}`
          }
        });



      if (!response.ok) {
        throw new Error(
          'Sesión inválida o expirada'
        );
      }



      const data =
        await response.json();
      const user =
        data.user;

      sessionStorage.setItem(
        'agecare_user',
        JSON.stringify(user)
      );
      renderLoggedUser(user);
sessionLoader.classList.add('d-none');
appRoot.classList.remove('d-none');
await loadBillingDashboard();
    } catch (error) {
      console.error(
        'Error validando sesión:',
        error
      );
      redirectToLogin();
    }
  }



  // ============================================
  // MOSTRAR USUARIO
  // ============================================

  function renderLoggedUser(user) {
    const fullName =
      user.full_name || 'Usuario';
    const role =
      user.role_code || 'Sin rol';
    const initials =
      fullName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(word =>
          word.charAt(0).toUpperCase()
        )
        .join('');



    // DESKTOP
    document.getElementById(
      'userAvatar'
    ).textContent =
      initials || 'U';
    document.getElementById(
      'userName'
    ).textContent =
      fullName;
    document.getElementById(
      'userRole'
    ).textContent =
      formatRole(role);

    // MOBILE
    document.getElementById(
      'mobileUserAvatar'
    ).textContent =
      initials || 'U';
    document.getElementById(
      'mobileUserName'
    ).textContent =
      fullName;
    document.getElementById(
      'mobileUserRole'
    ).textContent =
      formatRole(role);
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
      .replace(/\b\w/g, letter =>
        letter.toUpperCase()
      );
  }



  // ============================================
  // LOGOUT
  // ============================================

  function logout() {
    sessionStorage.removeItem(
      'agecare_token'
    );
    sessionStorage.removeItem(
      'agecare_user'
    );
    window.location.replace('/');
  }



  // ============================================
  // REDIRECCIÓN LOGIN
  // ============================================

  function redirectToLogin() {
    sessionStorage.removeItem(
      'agecare_token'
    );
    sessionStorage.removeItem(
      'agecare_user'
    );
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

  auditoria: [
    'Auditoría Administrativa',
    'Administración · Trazabilidad de acciones'
  ]
};



  let currentRowEditing = null;



  function switchView(viewId) {
    document
      .querySelectorAll(
        '.nav-item-btn'
      )
      .forEach(button => {
        button.classList.remove(
          'active'
        );
      });



    document
      .querySelectorAll(
        `.nav-btn-${viewId}`
      )
      .forEach(button => {
        button.classList.add('active');
      });



    document
      .querySelectorAll('.view')
      .forEach(section => {section.classList.remove('active');
      });



    const selectedView =
      document.getElementById('view-' + viewId);


    if (selectedView) {
      selectedView.classList.add('active');
    }



    const metadata =
      viewMeta[viewId];


    if (metadata) {
      document.getElementById(
        'tb-title'
      ).textContent =
        metadata[0];
      document.getElementById(
        'tb-crumb'
      ).textContent =
        metadata[1];
    }
  }



  // ============================================
  // FILTRAR TRANSACCIONES
  // ============================================

  function filterTransactions() {
    const textFilter =
      document
        .getElementById('searchTrx')
        .value
        .toLowerCase()
        .trim();

    const statusFilter =
      document
        .getElementById('selectStatus')
        .value;



    const rows =
      document.querySelectorAll(
        '#trxTable tbody tr'
      );



    let visibleCount =
      0;

    rows.forEach(row => {
      const rowText =
        row.innerText
          .toLowerCase();

      const rowStatus =
        row.getAttribute('data-status');



      const matchesText =
        textFilter === '' ||
        rowText.includes(textFilter);

      const matchesStatus =
        statusFilter === 'Todos' ||
        rowStatus ===
          statusFilter;

      if (
        matchesText &&
        matchesStatus) {

        row.classList.remove(
          'd-none');


        visibleCount++;
      } else {
        row.classList.add(
          'd-none'
        );
      }
    });
    const noResultsMsg =
      document.getElementById(
        'noResultsMsg');

    if (visibleCount === 0) {
      noResultsMsg.classList.remove(
        'd-none'
      );
    } else {
      noResultsMsg.classList.add(
        'd-none'
      );
    }
  }

  // ============================================
  // EXPORTAR CSV
  // ============================================

  function exportTableToCSV(
    filename = 'transacciones.csv'
  ) {
    const table =
      document.getElementById(
        'trxTable'
      );

    const rows =
      table.querySelectorAll(
        'tr'
      );

    const csv =
      [];

    rows.forEach(row => {
      if (
        row.classList.contains(
          'd-none'
        )) {
        return;
      }

      const cols =
        row.querySelectorAll(
          'th, td'
        );

      const rowData =
        [];

      cols.forEach(
        (col, index) => {
          // Ignorar columna acciones
          if (
            index ===
            cols.length - 1
          ) {

            return;

          }

          let text =
            col.innerText
              .replace(
                /(\r\n|\n|\r)/gm,
                ' '
              )
              .replace(
                /\s+/g,
                ' '
              )
              .trim();

          text =
            text.replace(
              /"/g,
              '""'
            );

          rowData.push(
            `"${text}"`
          );

        }
      );

      if (
        rowData.length > 0
      ) {

        csv.push(
          rowData.join(';')
        );

      }

    });

    if (
      csv.length === 0
    ) {
      showToastNotification(
        'No hay datos visibles para exportar'
      );
      return;
    }

    const csvContent =
      '\uFEFF' +
      csv.join('\n');

    const blob =
      new Blob(
        [csvContent],
        {
          type:
            'text/csv;charset=utf-8;'
        }
      );

    const link =
      document.createElement(
        'a'
      );

    const url =
      URL.createObjectURL(
        blob
      );

    link.setAttribute(
      'href',
      url
    );

    link.setAttribute(
      'download',
      filename
    );

    link.style.visibility =
      'hidden';

    document.body.appendChild(
      link
    );

    link.click();

    document.body.removeChild(
      link
    );

    URL.revokeObjectURL(
      url
    );
  }



  // ============================================
  // PREPARAR MODAL PLAN
  // ============================================

function prepareUpgradeModal(subscriptionId, clientName, currentPlan) {
  selectedSubscriptionId = subscriptionId;
  document.getElementById(
    'modalClientName'
  ).value = clientName;

  document.getElementById(
    'modalPlanSelect'
  ).value = currentPlan;
}

function openCancelSubscriptionModal(subscriptionId) {
  const subscription =
    currentSubscriptions.find(
      item => item.id === subscriptionId
    );

  if (!subscription) {
    showToastNotification(
      'No se encontró la suscripción'
    );
    return;
  }

  if (subscription.status === 'canceled') {
    showToastNotification(
      'La suscripción ya se encuentra cancelada'
    );
    return;
  }

  selectedCancelSubscriptionId =
    subscription.id;

  document.getElementById(
    'cancelSubscriptionClient'
  ).textContent =
    subscription.display_name ||
    'No disponible';

  document.getElementById(
    'cancelSubscriptionPlan'
  ).textContent =
    subscription.plan_name ||
    'Sin plan';

  document.getElementById(
    'cancelSubscriptionStatus'
  ).textContent =
    subscription.status === 'active'
      ? 'Activa'
      : subscription.status === 'past_due'
        ? 'Morosa'
        : subscription.status;

  document.getElementById(
    'cancelSubscriptionNextCharge'
  ).textContent =
    formatDate(
      subscription.current_period_end
    );

  const modal =
    new bootstrap.Modal(
      document.getElementById(
        'modal-cancel-subscription'
      )
    );

  modal.show();
}

async function cancelSubscription() {
  if (!selectedCancelSubscriptionId) {
    showToastNotification(
      'No se pudo identificar la suscripción'
    );
    return;
  }

  const cancelButton =
    document.getElementById(
      'confirmCancelSubscriptionButton'
    );

  try {
    cancelButton.disabled = true;

    cancelButton.innerHTML = `
      <span
        class="spinner-border spinner-border-sm me-1"
        aria-hidden="true"
      ></span>
      Cancelando...
    `;

    const response =
      await authenticatedFetch(
        `/api/billing/subscriptions/${selectedCancelSubscriptionId}/cancel`,
        {
          method: 'POST'
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        'No fue posible cancelar la suscripción'
      );
    }

    const modalElement =
      document.getElementById(
        'modal-cancel-subscription'
      );

    const modal =
      bootstrap.Modal.getInstance(
        modalElement
      );

    if (modal) {
      modal.hide();
    }

    showToastNotification(
      'Suscripción cancelada correctamente'
    );

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

  const select =
    document.getElementById('modalPlanSelect');

  const planCode =
    select.value;

  const saveButton =
    document.querySelector(
      '#modal-upgrade .btn-primary'
    );

  try {
    saveButton.disabled = true;
    saveButton.innerHTML = `
      <span
        class="spinner-border spinner-border-sm me-1"
        aria-hidden="true"
      ></span>
      Guardando...
    `;

    const response =
      await authenticatedFetch(
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

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        'No fue posible modificar el plan'
      );
    }

    const modalElement =
      document.getElementById(
        'modal-upgrade'
      );

    const modal =
      bootstrap.Modal.getInstance(
        modalElement
      );

    if (modal) {
      modal.hide();
    }

    showToastNotification(
      'Plan actualizado correctamente'
    );

    selectedSubscriptionId = null;

    await Promise.all([
      loadSubscriptions(),
      loadMetrics()
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
    saveButton.innerHTML =
      'Guardar Cambios';
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

    const toastEl =
      document.getElementById('toastNotification');

    const toastBody =
      document.getElementById('toastMessage');
    toastBody.innerHTML =
      `
        <i
          class="bi bi-check-circle-fill text-success fs-6"
        ></i>

        ${message}
      `;
    const toast =
      bootstrap.Toast.getOrCreateInstance(
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
  const currentToken = sessionStorage.getItem('agecare_token');
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${currentToken}`
    }
  });
  if (response.status === 401) {
    redirectToLogin();
    throw new Error('Sesión expirada');
  }
  return response;
}

// ============================================
// UTILIDADES
// ============================================

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function formatCurrency(amount, currency = 'CLP') {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0
  }).format(Number(amount || 0));
}


function formatDate(value) {
  if (!value) {
    return 'N/A';
  }
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) {
    return 'No disponible';
  }

  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function transactionStatusLabel(status) {
  const statuses = {
    approved: 'Aprobado',
    failed: 'Fallido',
    pending: 'Pendiente',
    canceled: 'Cancelado',
    refunded: 'Reembolsado',
    partially_refunded: 'Reembolso parcial'
  };

  return statuses[status] || status || 'Desconocido';
}

function openTransactionModal(transactionId) {
  const transaction =
    currentTransactions.find(
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

const shortId =
  transaction.id
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

  const refundButton =
    document.getElementById(
      'refundTransactionButton'
    );

  refundButton.disabled =
    transaction.status !== 'approved';

  const modal =
    new bootstrap.Modal(
      document.getElementById(
        'modal-detalle'
      )
    );

  modal.show();
}
function openRefundConfirmation() {
  if (!selectedTransactionId) {
    showToastNotification(
      'No se pudo identificar la transacción'
    );
    return;
  }

  const transaction =
    currentTransactions.find(
      item => item.id === selectedTransactionId
    );

  if (!transaction) {
    showToastNotification(
      'No se encontró la transacción'
    );
    return;
  }

  if (transaction.status !== 'approved') {
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
    document.getElementById('modal-detalle');

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
      <span
        class="spinner-border spinner-border-sm me-1"
        aria-hidden="true"
      ></span>
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
      await authenticatedFetch('/api/billing/metrics');
    if (!response.ok) {
      throw new Error('Error cargando métricas');
    }

    const data = await response.json();
    const metrics = data.metrics;

    document.getElementById(
      'kpiApprovedToday'
    ).textContent = metrics.approved_today;

    document.getElementById(
      'kpiApprovedAmount'
    ).textContent = formatCurrency(
      metrics.approved_amount_today
    );

    document.getElementById(
      'kpiFailedTransactions'
    ).textContent = metrics.failed_transactions;

    document.getElementById(
      'kpiSuccessRate'
    ).textContent = `${metrics.success_rate}%`;

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
    document.getElementById('transactionsBody');
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
          <td colspan="6"
              class="text-center text-muted py-4">
            No hay transacciones registradas.
          </td>
        </tr>
      `;
      return;
    }


    tbody.innerHTML =
      transactions.map(transaction => {

        let statusLabel = '';
        let statusClass = 'neutral';
        let icon = '●';
        switch (transaction.status) {

          case 'approved':
            statusLabel = 'Aprobado';
            statusClass = 'ok';
            icon = '✔';
            break;

          case 'failed':
            statusLabel = 'Fallido';
            statusClass = 'crit';
            icon = '✖';
            break;

          case 'refunded':
            statusLabel = 'Reembolsado';
            statusClass = 'warn';
            icon = '↩';
            break;

          case 'partially_refunded':
            statusLabel = 'Reembolso parcial';
            statusClass = 'warn';
            icon = '↩';
            break;

          case 'pending':
            statusLabel = 'Pendiente';
            break;

          case 'canceled':
            statusLabel = 'Cancelado';
            statusClass = 'crit';
            icon = '✖';
            break;

          default:
            statusLabel = transaction.status;
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
                ${escapeHtml(transaction.display_name)}
              </div>

              <div class="text-muted"
                   style="font-size:10.5px;">
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
                  transaction.plan_name || 'Sin plan'
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
                <button class="action-btn" type="button" onclick="openTransactionModal('${transaction.id}')"> Ver Recibo </button>
                </td>
          </tr>
        `;
      }).join('');

  } catch (error) {
    console.error(
      'Error cargando transacciones:',
      error
    );
    tbody.innerHTML = `
      <tr>
        <td colspan="6"
            class="text-center text-danger py-4">
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
    document.getElementById('subscriptionsBody');
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
          <td colspan="6"
              class="text-center text-muted py-4">
            No hay suscripciones registradas.
          </td>
        </tr>
      `;
      return;
    }


    tbody.innerHTML =
      subscriptions.map(subscription => {
        let statusLabel = '';
        let statusClass = 'neutral';
        switch (subscription.status) {
          case 'active':
            statusLabel = 'Activa';
            statusClass = 'ok';
            break;

          case 'past_due':
            statusLabel = 'Morosa';
            statusClass = 'crit';
            break;

          case 'trialing':
            statusLabel = 'Periodo de prueba';
            break;

          case 'pending':
            statusLabel = 'Pendiente';
            break;

          case 'paused':
            statusLabel = 'Pausada';
            statusClass = 'warn';
            break;

          case 'canceled':
            statusLabel = 'Cancelada';
            statusClass = 'crit';
            break;

          default:
            statusLabel = subscription.status;
        }

        let paymentMethod =
          'No registrado';

        if (
          subscription.brand &&
          subscription.last4
        ) {

          paymentMethod =
            `${escapeHtml(subscription.brand)}
            •••• ${escapeHtml(subscription.last4)}`;
        }


        let nextCharge =
          formatDate(
            subscription.current_period_end
          );

        if (
          subscription.status === 'canceled'
        ) {
          nextCharge = 'Cancelada';
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

              <span
                class="chip ${statusClass}"
              >
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
                    subscription.status !== 'canceled'
                    ? `
                        <button class="action-btn" type="button" data-bs-toggle="modal" data-bs-target="#modal-upgrade" onclick="prepareUpgradeModal(
                            '${subscription.id}',
                            '${escapeHtml(subscription.display_name)}',
                            '${subscription.plan_code}')">
                        Modificar Plan
                        </button>

                        <button class="action-btn text-danger" type="button" onclick="openCancelSubscriptionModal('${subscription.id}')">
                        Cancelar
                        </button>
                    `
                    : `
                        <span class="text-muted small">
                        Sin acciones
                        </span>
                    `
                    }
                </div>
                </td>

          </tr>
        `;

      }).join('');

  } catch (error) {

    console.error(
      'Error cargando suscripciones:',
      error
    );

    tbody.innerHTML = `
      <tr>
        <td colspan="6"
            class="text-center text-danger py-4">
          No fue posible cargar las suscripciones.
        </td>
      </tr>
    `;

  }
}

// ============================================
// CARGAR INFORMACIÓN COMERCIAL
// ============================================

async function loadBillingDashboard() {
  await Promise.all([
    loadMetrics(),
    loadTransactions(),
    loadSubscriptions(),
    loadCommercialMetrics(),
    loadAuditLog()
  ]);
}

async function loadCommercialMetrics() {
  try {
    const response = await authenticatedFetch(
      '/api/billing/commercial-metrics'
    );

    if (!response.ok) {
      throw new Error(
        'No fue posible cargar las métricas comerciales'
      );
    }

    const data = await response.json();
    const metrics = data.metrics;

    document.getElementById(
      'commercialTotalAccounts'
    ).textContent = metrics.total_accounts;

    document.getElementById(
      'commercialPaidSubscriptions'
    ).textContent = metrics.paid_subscriptions;

    document.getElementById(
      'commercialActiveSubscriptions'
    ).textContent =
      `${metrics.active_subscriptions} suscripciones activas`;

    document.getElementById(
      'commercialMRR'
    ).textContent =
      formatCurrency(metrics.mrr, 'CLP');

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

function auditActionLabel(action) {
  const labels = {
    subscription_plan_changed: 'Cambio de plan',
    payment_refunded: 'Reembolso',
    subscription_canceled: 'Cancelación de suscripción'
  };

  return labels[action] || action;
}

function auditActionClass(action) {
  const classes = {
    subscription_plan_changed: 'neutral',
    payment_refunded: 'warn',
    subscription_canceled: 'crit'
  };

  return classes[action] || 'neutral';
}

function formatAuditValue(value) {
  if (!value) {
    return '—';
  }

  if (typeof value === 'string') {
    return value;
  }

  const entries =
    Object.entries(value);

  if (!entries.length) {
    return '—';
  }

  return entries
    .map(([key, val]) => {
      const labels = {
        plan_code: 'Plan',
        status: 'Estado',
        refunded_amount: 'Reembolsado',
        cancel_at_period_end: 'Cancelar al fin',
        canceled_at: 'Cancelado'
      };

      const label =
        labels[key] || key;

      let displayValue = val;

      if (
        key === 'refunded_amount' &&
        val !== null
      ) {
        displayValue =
          formatCurrency(val, 'CLP');
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
          val ? 'Sí' : 'No';
      }

      return `${label}: ${displayValue ?? '—'}`;
    })
    .join(' · ');
}

async function loadAuditLog() {
  const tbody =
    document.getElementById('auditBody');

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
        <td
          colspan="6"
          class="text-center text-danger py-4"
        >
          No fue posible cargar la auditoría.
        </td>
      </tr>
    `;
  }
}

function renderAuditLog(entries) {
  const tbody =
    document.getElementById(
      'auditBody'
    );

  if (!entries.length) {
    tbody.innerHTML = `
      <tr>
        <td
          colspan="6"
          class="text-center text-muted py-4"
        >
          No hay registros de auditoría.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML =
    entries.map(entry => {

      const actionLabel =
        auditActionLabel(
          entry.action
        );

      const actionClass =
        auditActionClass(
          entry.action
        );

      return `
        <tr
          data-action="${escapeHtml(entry.action)}"
        >

          <td>
            ${formatDateTime(entry.created_at)}
          </td>

          <td>
            <div class="fw-semibold">
              ${escapeHtml(
                entry.actor_name ||
                'Sistema'
              )}
            </div>

            <div
              class="text-muted"
              style="font-size:10.5px;"
            >
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
            <span
              class="chip ${actionClass}"
            >
              ${escapeHtml(actionLabel)}
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

    }).join('');
}

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

  rows.forEach(row => {
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
  });

  document.getElementById(
    'auditNoResults'
  ).classList.toggle(
    'd-none',
    visible !== 0
  );
}



  // ============================================
  // INICIAR
  // ============================================
  validateSession();
