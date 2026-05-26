const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const logger = require('../lib/logger');
const { getSheetRows, updateStatus, updateOptionalFields } = require('../lib/googleSheets');
const { sendMail, normalizeAttachments } = require('../lib/mailer');
const { buildJobEmail } = require('../lib/templates');
const { scanCompanyWebsite, fetchPageContext } = require('../lib/jobScanner');
const { extractTextFromFile, inferJobTitleFromText } = require('../lib/documentParser');

async function extractSourceText(filePath) {
  if (!filePath) return '';
  try {
    return await extractTextFromFile(filePath);
  } catch (error) {
    logger.warn('Source text extraction failed.', { message: error.message, filePath });
    return '';
  }
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function guessCompanyName(record) {
  const explicit = String(record.company_name || '').trim();
  if (explicit) return explicit;

  const rawValue = String(record.website || record.recipient_email || record.job_post || '').trim();
  if (!rawValue) return 'Target Company';

  try {
    if (rawValue.includes('@') && !rawValue.startsWith('http')) {
      const domain = rawValue.split('@')[1] || '';
      const core = domain.replace(/^www\./i, '').split('.')[0] || 'Target Company';
      return core
        .split(/[-_]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }

    if (isHttpUrl(rawValue) || rawValue.includes('.')) {
      const hostname = new URL(isHttpUrl(rawValue) ? rawValue : `https://${rawValue}`).hostname;
      const core = hostname.replace(/^www\./i, '').split('.')[0] || 'Target Company';
      return core
        .split(/[-_]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }
  } catch (_error) {
    return 'Target Company';
  }

  const filename = path.basename(rawValue, path.extname(rawValue));
  return filename || 'Target Company';
}

async function getJobPostContext(jobPost) {
  if (!jobPost) return null;

  if (isHttpUrl(jobPost)) {
    try {
      return await fetchPageContext(jobPost);
    } catch (_error) {
      return null;
    }
  }

  try {
    const absPath = path.isAbsolute(jobPost) ? jobPost : path.resolve(jobPost);
    if (!fs.existsSync(absPath)) return null;

    const text = await extractSourceText(absPath);
    const inferredTitle = inferJobTitleFromText(text);

    return {
      url: absPath,
      title: inferredTitle || path.basename(absPath),
      headings: [],
      text: text.slice(0, 2200),
    };
  } catch (_error) {
    return null;
  }
}

function isPending(row) {
  return (row.record.status || '').trim().toLowerCase() === 'pending';
}

function hasRequiredFields(row) {
  return !!(row.record.job_post || row.record.website || row.record.recipient_email);
}

function shouldSkipDuplicate(row) {
  return !config.automation.allowDuplicateSends && ['sent'].includes((row.record.status || '').trim().toLowerCase());
}

async function enrichJobRecord(record) {
  const website = record.website || '';
  const careerPage = record.career_page || '';
  const jobPost = record.job_post || '';
  const resumePath = record.resume_path || config.senderProfile.cvFilePath || '';

  const jobPostContext = await getJobPostContext(jobPost);
  let careerPageContext = null;
  const cvText = await extractSourceText(resumePath);

  if (careerPage) {
    try {
      careerPageContext = await fetchPageContext(careerPage);
    } catch (error) {
      careerPageContext = null;
    }
  }

  if (!record.website) {
    return {
      enrichedRecord: {
        ...record,
        company_name: guessCompanyName(record),
        job_title: record.job_title || 'Open Position',
        source_page: jobPost || careerPage || '',
        job_post_context: jobPostContext?.text || '',
        career_page_context: careerPageContext?.text || '',
        cv_text: cvText,
        application_mode: record.application_mode || (jobPost || careerPage ? 'targeted' : 'general'),
      },
      scanResult: null,
    };
  }

  const scanResult = await scanCompanyWebsite(website, record.job_title);
  const matchedOpening = scanResult?.matchedOpening;

  return {
      enrichedRecord: {
        ...record,
        company_name: guessCompanyName(record),
        recipient_email: record.recipient_email || scanResult?.emails?.[0] || '',
        job_title: record.job_title || jobPostContext?.title || matchedOpening?.title || 'Open Position',
        job_link: record.job_link || jobPost || matchedOpening?.url || careerPage || '',
        website: scanResult?.website || website,
        source_page:
          jobPost ||
          matchedOpening?.url ||
          careerPage ||
          scanResult?.careerPages?.[0] ||
          scanResult?.contactPages?.[0] ||
          '',
        company_context: scanResult?.homepageSummary || '',
        career_page_context: careerPageContext?.text || '',
        job_post_context: jobPostContext?.text || '',
        cv_text: cvText,
        application_mode: record.application_mode || (jobPost || careerPage ? 'targeted' : 'general'),
      },
      scanResult,
    };
  }

async function processJobApplications() {
  const rows = await getSheetRows(config.sheets.jobSheetName);
  const pendingRows = rows.filter(isPending);

  logger.info(`Job workflow found ${pendingRows.length} pending row(s).`);

  for (const row of pendingRows) {
    const email = row.record.recipient_email;
    const companyName = row.record.company_name;

    try {
      if (shouldSkipDuplicate(row)) {
        logger.warn('Skipped duplicate job row.', { rowNumber: row.rowNumber, companyName });
        continue;
      }

      if (!hasRequiredFields(row)) {
        await updateStatus(config.sheets.jobSheetName, row, 'skipped', 'Missing required fields');
        logger.warn('Skipped job row due to missing required fields.', { rowNumber: row.rowNumber });
        continue;
      }

      const { enrichedRecord, scanResult } = await enrichJobRecord(row.record);
      const resolvedEmail = enrichedRecord.recipient_email;

      if (!resolvedEmail) {
        await updateStatus(config.sheets.jobSheetName, row, 'skipped', 'No recipient email found');
        logger.warn('Skipped job row because no recipient email was found.', {
          rowNumber: row.rowNumber,
          companyName,
          website: row.record.website || '',
        });
        continue;
      }

      const mail = await buildJobEmail(enrichedRecord);
      const attachments = normalizeAttachments([
        enrichedRecord.resume_path,
        !enrichedRecord.resume_path && config.senderProfile.cvFilePath ? config.senderProfile.cvFilePath : null,
      ]);

      await updateOptionalFields(config.sheets.jobSheetName, row, {
        found_email: resolvedEmail,
        source_page: enrichedRecord.source_page,
      });

      if (config.app.runMode !== 'send') {
        logger.info(`Preview only for job email to ${resolvedEmail}`, {
          rowNumber: row.rowNumber,
          companyName,
          subject: mail.subject,
          body: mail.text,
          attachments,
          scanResult,
        });
        continue;
      }

      await sendMail('job', {
        from: config.gmail.job.user,
        to: resolvedEmail,
        subject: mail.subject,
        text: mail.text,
        attachments,
      });

      await updateStatus(config.sheets.jobSheetName, row, 'sent', 'Email sent successfully');
      logger.info(`Job email sent to ${resolvedEmail}`, {
        rowNumber: row.rowNumber,
        companyName,
        scanResult,
      });
    } catch (error) {
      await updateStatus(config.sheets.jobSheetName, row, 'failed', error.message);
      logger.error(`Job workflow failed for ${email || companyName}`, {
        rowNumber: row.rowNumber,
        message: error.message,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, config.app.defaultWaitMs));
  }
}

module.exports = { processJobApplications, enrichJobRecord };
