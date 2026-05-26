const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { config } = require('./config');
const logger = require('./lib/logger');
const { runAutomation } = require('./index');
const { appendRow, getSheetRows } = require('./lib/googleSheets');
const { buildJobEmail, buildServiceEmail } = require('./lib/templates');
const { enrichJobRecord } = require('./workflows/jobApplications');
const { enrichServiceRecord } = require('./workflows/serviceOutreach');
const { sendMail, normalizeAttachments } = require('./lib/mailer');
const { extractTextFromFile, inferJobTitleFromText } = require('./lib/documentParser');

function extractSheetId(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  const urlMatch = value.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(value)) return value;
  return '';
}

function updateEnvFile(key, value) {
  const envPath = path.join(__dirname, '..', '.env');
  let content = '';
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch (error) {
    content = '';
  }

  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) {
    content = content.replace(pattern, line);
  } else {
    content = content.replace(/\s*$/, '') + `\n${line}\n`;
  }
  fs.writeFileSync(envPath, content, 'utf8');
}

const JOB_CSV_HEADERS = [
  'company_name', 'recipient_email', 'website', 'career_page', 'job_post',
  'job_title', 'application_mode', 'status', 'resume_path', 'custom_note',
  'last_message', 'last_run_at', 'found_email', 'source_page',
];

const SERVICE_CSV_HEADERS = [
  'business_name', 'recipient_email', 'recipient_name', 'industry', 'country',
  'website', 'pain_point', 'service_offer', 'outreach_type', 'custom_note',
  'status', 'last_message', 'last_run_at', 'found_email', 'source_page',
];

function buildCsvTemplate(headers, sampleRow) {
  const rows = [headers.join(','), sampleRow.map((v) => `"${v}"`).join(',')];
  return rows.join('\n') + '\n';
}

const app = express();
const publicDir = path.join(__dirname, '..', 'public');

const jobHeaders = [
  'company_name',
  'recipient_email',
  'website',
  'career_page',
  'job_post',
  'job_title',
  'application_mode',
  'status',
  'resume_path',
  'custom_note',
  'last_message',
  'last_run_at',
  'found_email',
  'source_page',
];

const serviceHeaders = [
  'business_name',
  'recipient_email',
  'website',
  'service_offer',
  'outreach_type',
  'status',
  'custom_note',
  'last_message',
  'last_run_at',
  'found_email',
  'source_page',
];

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const cvStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
    cb(null, `cv-${Date.now()}${ext}`);
  },
});

const cvUpload = multer({
  storage: cvStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Only PDF, DOC, or DOCX files are allowed.'));
    }
    cb(null, true);
  },
});

const jobSourceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
    cb(null, `job-source-${Date.now()}${ext}`);
  },
});

const jobSourceUpload = multer({
  storage: jobSourceStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Only PDF, PNG, JPG, JPEG, or WEBP files are allowed.'));
    }
    cb(null, true);
  },
});

async function extractFileText(filePath) {
  try {
    return await extractTextFromFile(filePath);
  } catch (error) {
    logger.warn('Failed to extract file text.', { message: error.message });
    return '';
  }
}

app.use(express.json());
app.use(express.static(publicDir));

function summarizeRows(rows) {
  const counts = { pending: 0, sent: 0, failed: 0, skipped: 0 };

  rows.forEach((row) => {
    const status = String(row.record.status || '').trim().toLowerCase();
    if (counts[status] !== undefined) {
      counts[status] += 1;
    }
  });

  return counts;
}

app.get('/api/dashboard', async (_request, response) => {
  try {
    const [jobRows, serviceRows] = await Promise.all([
      getSheetRows(config.sheets.jobSheetName),
      getSheetRows(config.sheets.serviceSheetName),
    ]);

    response.json({
      ok: true,
      jobs: summarizeRows(jobRows),
      services: summarizeRows(serviceRows),
      recentJobs: jobRows.slice(-5).reverse().map((row) => row.record),
      recentServices: serviceRows.slice(-5).reverse().map((row) => row.record),
    });
  } catch (error) {
    response.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/jobs/latest', async (_request, response) => {
  try {
    const jobRows = await getSheetRows(config.sheets.jobSheetName);

    // Format jobs for display on the job board
    const jobs = jobRows.map((row) => ({
      company_name: row.record.company_name || 'Unknown Company',
      job_title: row.record.job_title || 'Open Position',
      job_type: row.record.job_type || 'Full-time',
      location: row.record.location || 'Remote',
      job_post: row.record.job_post || '',
      website: row.record.website || '',
      career_page: row.record.career_page || '',
      recipient_email: row.record.recipient_email || '',
      source_page: row.record.source_page || '',
      custom_note: row.record.custom_note || '',
      status: row.record.status || 'pending',
      tags: (row.record.job_tags || '').split(',').filter(t => t.trim()),
      posted_days_ago: row.record.posted_days_ago || 'unknown',
    })).reverse();

    response.json({
      ok: true,
      jobs: jobs,
      total: jobs.length,
    });
  } catch (error) {
    response.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/job', async (request, response) => {
  try {
    const body = request.body || {};
    const jobSource = body.job_post || body.job_post_upload_path || '';
    const payload = {
      company_name: body.company_name || '',
      recipient_email: body.recipient_email || '',
      website: body.website || '',
      career_page: body.career_page || '',
      job_post: jobSource,
      job_title: body.job_title || '',
      application_mode:
        body.application_mode || (jobSource || body.career_page ? 'targeted' : 'general'),
      status: 'pending',
      resume_path: body.resume_path || '',
      custom_note: body.custom_note || '',
      last_message: '',
      last_run_at: '',
      found_email: '',
      source_page: '',
    };

    if (!payload.job_post && !payload.website && !payload.recipient_email) {
      return response.status(400).json({
        ok: false,
        message: 'Provide at least one job source: post link/upload, company website, or hiring email.',
      });
    }

    await appendRow(config.sheets.jobSheetName, jobHeaders, payload);
    response.json({ ok: true, message: 'Job application added to queue.' });
  } catch (error) {
    response.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/preview/job', async (request, response) => {
  try {
    const body = request.body || {};
    const jobSource = body.job_post || body.job_post_upload_path || '';
    const payload = {
      company_name: body.company_name || '',
      recipient_email: body.recipient_email || '',
      website: body.website || '',
      career_page: body.career_page || '',
      job_post: jobSource,
      job_title: body.job_title || '',
      application_mode:
        body.application_mode || (jobSource || body.career_page ? 'targeted' : 'general'),
      resume_path: body.resume_path || '',
      custom_note: body.custom_note || '',
    };

    if (!payload.job_post && !payload.website && !payload.recipient_email) {
      return response.status(400).json({
        ok: false,
        message: 'Provide at least one job source: post link/upload, company website, or hiring email.',
      });
    }

    const { enrichedRecord } = await enrichJobRecord(payload);
    const draft = await buildJobEmail(enrichedRecord);
    response.json({ ok: true, draft });
  } catch (error) {
    response.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/service', async (request, response) => {
  try {
    const body = request.body || {};
    const payload = {
      business_name: body.business_name || '',
      recipient_name: body.recipient_name || '',
      recipient_email: body.recipient_email || '',
      website: body.website || '',
      service_offer: body.service_offer || '',
      industry: body.industry || '',
      country: body.country || '',
      pain_point: body.pain_point || '',
      outreach_type: body.outreach_type || 'cold',
      status: 'pending',
      custom_note: body.custom_note || '',
      last_message: '',
      last_run_at: '',
      found_email: '',
      source_page: '',
    };

    if (!payload.service_offer || (!payload.website && !payload.recipient_email)) {
      return response.status(400).json({
        ok: false,
        message: 'Service offer and either website or recipient email are required.',
      });
    }

    await appendRow(config.sheets.serviceSheetName, serviceHeaders, payload);
    response.json({ ok: true, message: 'Service outreach added to queue.' });
  } catch (error) {
    response.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/preview/service', async (request, response) => {
  try {
    const body = request.body || {};
    const payload = {
      business_name: body.business_name || '',
      recipient_name: body.recipient_name || '',
      recipient_email: body.recipient_email || '',
      website: body.website || '',
      service_offer: body.service_offer || '',
      industry: body.industry || '',
      country: body.country || '',
      pain_point: body.pain_point || '',
      outreach_type: body.outreach_type || 'cold',
      custom_note: body.custom_note || '',
    };

    if (!payload.service_offer || (!payload.website && !payload.recipient_email)) {
      return response.status(400).json({
        ok: false,
        message: 'Service offer and either website or recipient email are required.',
      });
    }

    const { enrichedRecord } = await enrichServiceRecord(payload);
    const draft = await buildServiceEmail(enrichedRecord);
    response.json({ ok: true, draft });
  } catch (error) {
    response.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/run', async (request, response) => {
  try {
    const mode = request.body?.mode === 'send' ? 'send' : 'preview';
    await runAutomation(mode);
    response.json({ ok: true, message: `Automation completed in ${mode} mode.` });
  } catch (error) {
    logger.error('Dashboard-triggered automation failed.', {
      message: error.message,
      stack: error.stack,
    });
    response.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/send-row/job', async (request, response) => {
  try {
    const body = request.body || {};
    const jobSource = body.job_post || body.job_post_upload_path || '';
    const payload = {
      company_name: body.company_name || '',
      recipient_email: body.recipient_email || '',
      website: body.website || '',
      career_page: body.career_page || '',
      job_post: jobSource,
      job_title: body.job_title || '',
      application_mode:
        body.application_mode || (jobSource || body.career_page ? 'targeted' : 'general'),
      resume_path: body.resume_path || '',
      custom_note: body.custom_note || '',
    };

    if (!payload.job_post && !payload.website && !payload.recipient_email) {
      return response.status(400).json({
        ok: false,
        message: 'Provide at least one job source: post link/upload, company website, or hiring email.',
      });
    }

    const { enrichedRecord } = await enrichJobRecord(payload);
    const resolvedEmail = enrichedRecord.recipient_email || enrichedRecord.found_email || '';
    if (!resolvedEmail) {
      return response.status(400).json({
        ok: false,
        message: 'No recipient email available. Provide a hiring email or a website that exposes a contact.',
      });
    }

    const draft = await buildJobEmail(enrichedRecord);
    const attachments = normalizeAttachments([
      enrichedRecord.resume_path,
      !enrichedRecord.resume_path && config.senderProfile.cvFilePath ? config.senderProfile.cvFilePath : null,
    ]);

    await sendMail('job', {
      from: config.gmail.job.user,
      to: resolvedEmail,
      subject: draft.subject,
      text: draft.text,
      attachments,
    });

    const rowToAppend = {
      ...payload,
      recipient_email: resolvedEmail,
      status: 'sent',
      last_message: 'Email sent successfully (manual send).',
      last_run_at: new Date().toISOString(),
      found_email: enrichedRecord.found_email || '',
      source_page: enrichedRecord.source_page || '',
    };
    try {
      await appendRow(config.sheets.jobSheetName, jobHeaders, rowToAppend);
    } catch (sheetError) {
      logger.warn('Job email sent but sheet append failed.', { message: sheetError.message });
    }

    logger.info(`Job email sent (manual) to ${resolvedEmail}`);
    response.json({ ok: true, message: `Email sent to ${resolvedEmail}.`, recipient: resolvedEmail });
  } catch (error) {
    logger.error('Manual job send failed.', { message: error.message, stack: error.stack });
    response.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/send-row/service', async (request, response) => {
  try {
    const body = request.body || {};
    const payload = {
      business_name: body.business_name || '',
      recipient_name: body.recipient_name || '',
      recipient_email: body.recipient_email || '',
      website: body.website || '',
      service_offer: body.service_offer || '',
      industry: body.industry || '',
      country: body.country || '',
      pain_point: body.pain_point || '',
      outreach_type: body.outreach_type || 'cold',
      custom_note: body.custom_note || '',
    };

    if (!payload.service_offer || (!payload.website && !payload.recipient_email)) {
      return response.status(400).json({
        ok: false,
        message: 'Service offer and either website or recipient email are required.',
      });
    }

    const { enrichedRecord } = await enrichServiceRecord(payload);
    const resolvedEmail = enrichedRecord.recipient_email || enrichedRecord.found_email || '';
    if (!resolvedEmail) {
      return response.status(400).json({
        ok: false,
        message: 'No recipient email available. Provide a recipient email or a website that exposes a contact.',
      });
    }

    const draft = await buildServiceEmail(enrichedRecord);

    await sendMail('service', {
      from: config.gmail.service.user,
      to: resolvedEmail,
      subject: draft.subject,
      text: draft.text,
    });

    const rowToAppend = {
      ...payload,
      recipient_email: resolvedEmail,
      status: 'sent',
      last_message: 'Email sent successfully (manual send).',
      last_run_at: new Date().toISOString(),
      found_email: enrichedRecord.found_email || '',
      source_page: enrichedRecord.source_page || '',
    };
    try {
      await appendRow(config.sheets.serviceSheetName, serviceHeaders, rowToAppend);
    } catch (sheetError) {
      logger.warn('Service email sent but sheet append failed.', { message: sheetError.message });
    }

    logger.info(`Service email sent (manual) to ${resolvedEmail}`);
    response.json({ ok: true, message: `Email sent to ${resolvedEmail}.`, recipient: resolvedEmail });
  } catch (error) {
    logger.error('Manual service send failed.', { message: error.message, stack: error.stack });
    response.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/settings/sheet', (_request, response) => {
  const id = config.sheets.spreadsheetId || '';
  response.json({
    ok: true,
    sheetId: id,
    url: id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : '',
    serviceAccountEmail: config.sheets.serviceAccountEmail || '',
    jobSheetName: config.sheets.jobSheetName,
    serviceSheetName: config.sheets.serviceSheetName,
  });
});

app.post('/api/settings/sheet', (request, response) => {
  try {
    const id = extractSheetId(request.body?.url || request.body?.sheetId);
    if (!id) {
      return response.status(400).json({
        ok: false,
        message: 'Could not extract a Google Sheet ID from that input.',
      });
    }

    updateEnvFile('GOOGLE_SHEETS_ID', id);
    config.sheets.spreadsheetId = id;
    process.env.GOOGLE_SHEETS_ID = id;

    response.json({
      ok: true,
      sheetId: id,
      url: `https://docs.google.com/spreadsheets/d/${id}/edit`,
      message: 'Sheet linked. Share it with your service account email if you have not already.',
    });
  } catch (error) {
    logger.error('Failed to save sheet setting.', { message: error.message });
    response.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/upload-cv', cvUpload.single('cv'), async (request, response) => {
  try {
    if (!request.file) {
      return response.status(400).json({ ok: false, message: 'No file received.' });
    }

    const absolutePath = path.resolve(request.file.path);
    const extractedText = await extractFileText(absolutePath);

    response.json({
      ok: true,
      path: absolutePath,
      filename: request.file.originalname,
      size: request.file.size,
      textLength: extractedText.length,
      hasText: extractedText.length > 100,
    });
  } catch (error) {
    logger.error('CV upload failed.', { message: error.message });
    response.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/upload-job-source', jobSourceUpload.single('job_source'), async (request, response) => {
  try {
    if (!request.file) {
      return response.status(400).json({ ok: false, message: 'No file received.' });
    }

    const absolutePath = path.resolve(request.file.path);
    const ext = path.extname(absolutePath).toLowerCase();
    const extractedText = await extractFileText(absolutePath);
    const inferredJobTitle = inferJobTitleFromText(extractedText);

    response.json({
      ok: true,
      path: absolutePath,
      filename: request.file.originalname,
      size: request.file.size,
      sourceType: ext === '.pdf' ? 'pdf' : 'image',
      textLength: extractedText.length,
      hasText: extractedText.length > 100,
      inferredJobTitle,
    });
  } catch (error) {
    logger.error('Job source upload failed.', { message: error.message });
    response.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/download-template/jobs', (_request, response) => {
  const csv = buildCsvTemplate(JOB_CSV_HEADERS, [
    'Practical Khata', 'hiring@example.com', 'https://example.com',
    '', 'https://example.com/jobs/frontend', 'Frontend Developer',
    'targeted', 'pending', '', 'Optional note for the AI',
    '', '', '', '',
  ]);
  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', 'attachment; filename="job_applications_template.csv"');
  response.send(csv);
});

app.get('/api/download-template/services', (_request, response) => {
  const csv = buildCsvTemplate(SERVICE_CSV_HEADERS, [
    'Acme Studios', 'hello@acme.com', 'Alex', 'SaaS', 'US',
    'https://acme.com', 'Manual cold outreach is slow',
    'Email automation setup', 'cold', 'Optional note',
    'pending', '', '', '', '',
  ]);
  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', 'attachment; filename="service_outreach_template.csv"');
  response.send(csv);
});

app.use((_request, response) => {
  response.sendFile(path.join(publicDir, 'index.html'));
});

const server = app.listen(config.app.port, () => {
  logger.info(`Dashboard running at http://localhost:${config.app.port}`);
});

module.exports = server;
