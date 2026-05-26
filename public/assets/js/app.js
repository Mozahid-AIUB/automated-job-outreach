const page = document.body.dataset.page || 'jobs';
const jobStats = document.getElementById('job-stats');
const serviceStats = document.getElementById('service-stats');
const recentJobs = document.getElementById('recent-jobs');
const recentServices = document.getElementById('recent-services');
const toastArea = document.getElementById('toast-area');
const previewKind = document.getElementById('preview-kind');
const previewKindSide = document.getElementById('preview-kind-side');
const previewSubject = document.getElementById('preview-subject');
const previewBody = document.getElementById('preview-body');
let currentFilter = 'all';
let dashboardCache = { recentJobs: [], recentServices: [] };

function addMessage(message, type = 'success') {
  if (!toastArea) return;

  const item = document.createElement('div');
  item.className = `message-item ${type === 'error' ? 'is-error' : 'is-success'}`;
  item.innerHTML = `<strong>${type === 'error' ? 'Attention' : 'Updated'}</strong><span>${message}</span>`;
  toastArea.prepend(item);
}

function renderStats(container, stats) {
  if (!container) return;

  if (container.id === 'job-stats' && page === 'jobs') {
    const emailsSent = Number(stats.sent || 0);
    const jobsQueued = Number(stats.pending || 0);
    const servicesSent = Number(dashboardCache.services?.sent || 0);
    const companiesReached = emailsSent + servicesSent;
    const metrics = [
      { label: 'Emails Sent', value: emailsSent },
      { label: 'Jobs Queued', value: jobsQueued },
      { label: 'Services Sent', value: servicesSent },
      { label: 'Companies Reached', value: companiesReached },
    ];
    const maxValue = Math.max(...metrics.map((metric) => metric.value), 1);

    container.innerHTML = metrics
      .map(
        (metric) => `
        <article class="metric-card" data-animate data-countup-target="${metric.value}">
          <strong class="countup-value">0</strong>
          <span>${metric.label}</span>
          <div class="metric-bar"><span style="width: ${(metric.value / maxValue) * 100}%"></span></div>
        </article>
      `
      )
      .join('');
    return;
  }

  const labels = [
    ['pending', 'Pending'],
    ['sent', 'Sent'],
    ['failed', 'Failed'],
    ['skipped', 'Skipped'],
  ];

  container.innerHTML = labels
    .map(
      ([key, label]) => `
      <div class="stat-card" data-animate>
        <strong>${stats[key] || 0}</strong>
        <span>${label}</span>
      </div>
    `
    )
    .join('');
}

function renderActivity(container, rows, type) {
  if (!container) return;

  const filteredRows =
    currentFilter === 'all'
      ? rows
      : rows.filter((row) => String(row.status || '').trim().toLowerCase() === currentFilter);

  if (!filteredRows.length) {
    container.innerHTML = `<div class="activity-item"><span>No recent ${type} rows yet.</span></div>`;
    return;
  }

  container.innerHTML = filteredRows
    .map((row) => {
      const title = row.company_name || row.business_name || 'Untitled';
      const subtitle = row.job_title || row.service_offer || row.website || 'Queued item';
      const status = row.status || 'unknown';
      const note = row.last_message || row.found_email || row.source_page || 'No extra detail yet.';

      return `
        <div class="activity-item ${status}" data-animate>
          <div class="activity-item-content">
            <strong>${title}</strong>
            <span>${subtitle}</span>
            <span>Status: ${status}</span>
            <span>${note}</span>
          </div>
        </div>
      `;
    })
    .join('');
}

async function fetchDashboard() {
  const response = await fetch('/api/dashboard');
  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.message || 'Failed to load dashboard state.');
  }

  dashboardCache = data;
  renderStats(jobStats, data.jobs);
  renderStats(serviceStats, data.services);
  renderActivity(recentJobs, dashboardCache.recentJobs, 'job');
  renderActivity(recentServices, dashboardCache.recentServices, 'service');
  document.dispatchEvent(new CustomEvent('ui:content-updated'));
}

function bindAdvancedToggle(toggleId, targetId) {
  const toggle = document.getElementById(toggleId);
  const target = document.getElementById(targetId);
  if (!toggle || !target) return;

  toggle.addEventListener('change', () => {
    target.classList.toggle('open', toggle.checked);
  });
}

function formToObject(form) {
  const formData = new FormData(form);
  return Object.fromEntries(formData.entries());
}

function hasJobSource(payload) {
  return Boolean(
    String(payload.job_post || '').trim() ||
    String(payload.job_post_upload_path || '').trim() ||
    String(payload.website || '').trim() ||
    String(payload.recipient_email || '').trim()
  );
}

function submitForm(formId, endpoint) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = formToObject(form);
    if (formId === 'job-form') {
      if (!hasJobSource(payload)) {
        addMessage('Provide at least one job source: post link, uploaded file, company website, or hiring email.', 'error');
        return;
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!data.ok) {
      addMessage(data.message || 'Submission failed.', 'error');
      return;
    }

    addMessage(data.message || 'Saved successfully.');
    const rememberedServiceOffer =
      formId === 'service-form' ? localStorage.getItem('outreach-studio.service-offer') || '' : '';
    form.reset();
    document.querySelectorAll('.advanced-group').forEach((group) => group.classList.remove('open'));
    document.querySelectorAll('.advanced-toggle input').forEach((toggle) => {
      toggle.checked = false;
    });
    if (formId === 'service-form') {
      const serviceOfferInput = form.querySelector('#service-offer-input');
      if (serviceOfferInput && rememberedServiceOffer) {
        serviceOfferInput.value = rememberedServiceOffer;
      }
    }
    if (formId === 'job-form') {
      const jobSourceHidden = form.querySelector('#job-source-hidden');
      const jobSourceName = form.querySelector('#job-source-name');
      const jobSourceClear = form.querySelector('#job-source-clear');
      const jobSourceInput = form.querySelector('#job-source-input');
      if (jobSourceHidden) jobSourceHidden.value = '';
      if (jobSourceInput) jobSourceInput.value = '';
      if (jobSourceName) {
        jobSourceName.textContent = 'Choose a job post file (PDF, PNG, JPG, WEBP)';
        jobSourceName.classList.add('empty');
      }
      if (jobSourceClear) {
        jobSourceClear.style.display = 'none';
      }
    }
    await fetchDashboard();
  });
}

function bindRunButtons() {
  document.querySelectorAll('[data-run-mode]').forEach((button) => {
    button.addEventListener('click', async () => {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: button.dataset.runMode }),
      });

      const data = await response.json();
      if (!data.ok) {
        addMessage(data.message || 'Automation run failed.', 'error');
        return;
      }

      addMessage(data.message || 'Automation completed.');
      await fetchDashboard();
    });
  });
}

function bindFilters() {
  document.querySelectorAll('.filter-chip').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      currentFilter = button.dataset.filter;

      if (page === 'services') {
        renderActivity(recentServices, dashboardCache.recentServices || [], 'service');
      } else {
        renderActivity(recentJobs, dashboardCache.recentJobs || [], 'job');
      }

      document.dispatchEvent(new CustomEvent('ui:content-updated'));
    });
  });
}

function bindPreviewButtons() {
  document.querySelectorAll('.preview-trigger').forEach((button) => {
    button.addEventListener('click', async () => {
      const type = button.dataset.preview;
      const form = document.getElementById(`${type}-form`);
      if (!form) return;

      const payload = formToObject(form);
      if (type === 'job' && !hasJobSource(payload)) {
        addMessage('Provide at least one job source: post link, uploaded file, company website, or hiring email.', 'error');
        return;
      }
      const response = await fetch(`/api/preview/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!data.ok) {
        addMessage(data.message || 'Preview generation failed.', 'error');
        return;
      }

      if (previewKind) {
        previewKind.textContent = type === 'job' ? 'Job Draft Preview' : 'Service Draft Preview';
      }
      if (previewKindSide) {
        previewKindSide.textContent = type === 'job' ? 'Job draft preview' : 'Service draft preview';
      }

      if (previewSubject) {
        previewSubject.textContent = data.draft.subject || 'No subject generated.';
      }

      if (previewBody) {
        previewBody.textContent = data.draft.text || 'No email body generated.';
      }

      addMessage('Draft preview generated.');
      document.dispatchEvent(new CustomEvent('ui:content-updated'));
    });
  });
}

const sessionState = { sent: 0, failed: 0, items: [] };

function formatSessionTime(date) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function renderSession() {
  const sentEl = document.getElementById('sess-sent');
  const failedEl = document.getElementById('sess-failed');
  const lastEl = document.getElementById('sess-last');
  const listEl = document.getElementById('sess-list');
  if (!sentEl || !failedEl || !lastEl || !listEl) return;

  sentEl.textContent = String(sessionState.sent);
  failedEl.textContent = String(sessionState.failed);
  const lastSent = sessionState.items.find((it) => it.status === 'sent');
  lastEl.textContent = lastSent ? formatSessionTime(lastSent.at) : '—';

  if (!sessionState.items.length) {
    listEl.innerHTML = '<p class="session-empty">No emails sent yet this session.</p>';
    return;
  }
  listEl.innerHTML = sessionState.items
    .slice(0, 8)
    .map((it) => `
      <div class="session-item ${it.status === 'failed' ? 'failed' : ''}">
        <div class="session-item-body">
          <span class="session-item-title">${it.title}</span>
          <span class="session-item-meta">${it.status === 'sent' ? 'Sent to' : 'Failed'} ${it.recipient || ''}</span>
        </div>
        <span class="session-item-time">${formatSessionTime(it.at)}</span>
      </div>
    `)
    .join('');
}

function addSessionEntry(entry) {
  sessionState.items.unshift({ ...entry, at: new Date() });
  if (entry.status === 'sent') sessionState.sent += 1;
  if (entry.status === 'failed') sessionState.failed += 1;
  renderSession();
}

function bindSendNowButtons() {
  document.querySelectorAll('.send-now-trigger').forEach((button) => {
    button.addEventListener('click', async () => {
      const type = button.dataset.send;
      const form = document.getElementById(`${type}-form`);
      if (!form) return;

      const payload = formToObject(form);
      if (type === 'job' && !hasJobSource(payload)) {
        addMessage('Provide at least one job source: post link, uploaded file, company website, or hiring email.', 'error');
        return;
      }
      if (type === 'service' && (!payload.service_offer || (!payload.website && !payload.recipient_email))) {
        addMessage('Service offer and either website or recipient email are required.', 'error');
        return;
      }

      const recipient = payload.recipient_email || '(auto-detected from website)';
      const title = payload.company_name || payload.business_name || recipient;
      const confirmMsg =
        type === 'job'
          ? `Send this job application email to ${recipient}? This cannot be undone.`
          : `Send this outreach email to ${recipient}? This cannot be undone.`;
      if (!window.confirm(confirmMsg)) return;

      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Sending...';

      try {
        const response = await fetch(`/api/send-row/${type}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!data.ok) {
          addSessionEntry({ status: 'failed', title, recipient: data.recipient || recipient });
          addMessage(data.message || 'Send failed.', 'error');
          return;
        }
        addSessionEntry({ status: 'sent', title, recipient: data.recipient || recipient });
        addMessage(data.message || 'Email sent.');
        form.reset();
        document.querySelectorAll('.advanced-group').forEach((group) => group.classList.remove('open'));
        document.querySelectorAll('.advanced-toggle input').forEach((toggle) => {
          toggle.checked = false;
        });
      } catch (error) {
        addSessionEntry({ status: 'failed', title, recipient });
        addMessage(error.message || 'Send failed.', 'error');
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
}

async function bootstrap() {
  bindAdvancedToggle('job-advanced-toggle', 'job-advanced');
  bindAdvancedToggle('service-advanced-toggle', 'service-advanced');
  submitForm('job-form', '/api/job');
  submitForm('service-form', '/api/service');
  bindRunButtons();
  bindFilters();
  bindPreviewButtons();
  bindSendNowButtons();
  renderSession();

  try {
    await fetchDashboard();
  } catch (error) {
    addMessage(error.message, 'error');
  }
}

bootstrap();
