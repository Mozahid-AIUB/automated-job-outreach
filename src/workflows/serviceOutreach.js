const { config } = require('../config');
const logger = require('../lib/logger');
const { getSheetRows, updateStatus, updateOptionalFields } = require('../lib/googleSheets');
const { sendMail } = require('../lib/mailer');
const { buildServiceEmail } = require('../lib/templates');
const { scanCompanyWebsite } = require('../lib/jobScanner');

function isPending(row) {
  return (row.record.status || '').trim().toLowerCase() === 'pending';
}

function hasRequiredFields(row) {
  return row.record.service_offer && (row.record.recipient_email || row.record.website);
}

function guessBusinessName(record, scanResult) {
  if (record.business_name) {
    return record.business_name;
  }

  const fromWebsite = scanResult?.website || record.website || '';
  const fromEmail = record.recipient_email || '';
  const rawValue = fromWebsite || fromEmail;

  if (!rawValue) {
    return 'your team';
  }

  try {
    const hostname = fromWebsite
      ? new URL(fromWebsite.startsWith('http') ? fromWebsite : `https://${fromWebsite}`).hostname
      : fromEmail.split('@')[1];
    const core = hostname.replace(/^www\./i, '').split('.')[0] || 'your team';
    return core
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  } catch (_error) {
    return 'your team';
  }
}

async function enrichServiceRecord(record) {
  if (!record.website) {
    return {
      enrichedRecord: {
        ...record,
        business_name: guessBusinessName(record, null),
        outreach_type: record.outreach_type || 'cold',
      },
      scanResult: null,
    };
  }

  const scanResult = await scanCompanyWebsite(record.website);
  return {
    enrichedRecord: {
      ...record,
      business_name: guessBusinessName(record, scanResult),
      recipient_email: record.recipient_email || scanResult?.emails?.[0] || '',
      source_page: scanResult?.contactPages?.[0] || scanResult?.website || record.website,
      company_context: scanResult?.homepageSummary || '',
      outreach_type: record.outreach_type || 'cold',
    },
    scanResult,
  };
}

async function processServiceOutreach() {
  const rows = await getSheetRows(config.sheets.serviceSheetName);
  const pendingRows = rows.filter(isPending);

  logger.info(`Service workflow found ${pendingRows.length} pending row(s).`);

  for (const row of pendingRows) {
    const email = row.record.recipient_email;
    const businessName = row.record.business_name || row.record.website || row.record.recipient_email;

    try {
      if (!hasRequiredFields(row)) {
        await updateStatus(config.sheets.serviceSheetName, row, 'skipped', 'Missing required fields');
        logger.warn('Skipped service row due to missing required fields.', { rowNumber: row.rowNumber });
        continue;
      }

      const { enrichedRecord, scanResult } = await enrichServiceRecord(row.record);
      const resolvedEmail = enrichedRecord.recipient_email;

      if (!resolvedEmail) {
        await updateStatus(config.sheets.serviceSheetName, row, 'skipped', 'No recipient email found');
        logger.warn('Skipped service row because no recipient email was found.', {
          rowNumber: row.rowNumber,
          businessName,
          website: row.record.website || '',
        });
        continue;
      }

      const mail = await buildServiceEmail(enrichedRecord);
      await updateOptionalFields(config.sheets.serviceSheetName, row, {
        found_email: resolvedEmail,
        source_page: enrichedRecord.source_page,
      });

      if (config.app.runMode !== 'send') {
        logger.info(`Preview only for service email to ${resolvedEmail}`, {
          rowNumber: row.rowNumber,
          businessName,
          subject: mail.subject,
          body: mail.text,
          scanResult,
        });
        continue;
      }

      await sendMail('service', {
        from: config.gmail.service.user,
        to: resolvedEmail,
        subject: mail.subject,
        text: mail.text,
      });

      await updateStatus(config.sheets.serviceSheetName, row, 'sent', 'Email sent successfully');
      logger.info(`Service email sent to ${resolvedEmail}`, { rowNumber: row.rowNumber, businessName });
    } catch (error) {
      await updateStatus(config.sheets.serviceSheetName, row, 'failed', error.message);
      logger.error(`Service workflow failed for ${email}`, {
        rowNumber: row.rowNumber,
        message: error.message,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, config.app.defaultWaitMs));
  }
}

module.exports = { processServiceOutreach, enrichServiceRecord };
