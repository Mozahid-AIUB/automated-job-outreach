const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

function getEnv(name, fallback = '') {
  return (process.env[name] || fallback).trim();
}

function normalizePrivateKey(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\n/g, '\n');
  }

  return trimmed.replace(/\\n/g, '\n');
}

function resolveOptionalPath(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  return path.isAbsolute(trimmed) ? trimmed : path.resolve(__dirname, '..', trimmed);
}

function detectServiceAccountKeyFile() {
  const rootDir = path.resolve(__dirname, '..');
  const candidates = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(rootDir, entry.name));

  return candidates[0] || '';
}

function requiredEnv(name) {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config = {
  app: {
    rootDir: path.resolve(__dirname, '..'),
    runMode: getEnv('RUN_MODE', 'preview').toLowerCase(),
    defaultWaitMs: Number(getEnv('DEFAULT_WAIT_MS', '2000')),
    logDir: path.resolve(__dirname, '..', 'logs'),
    port: Number(getEnv('PORT', '3030')),
  },
  sheets: {
    spreadsheetId: getEnv('GOOGLE_SHEETS_ID'),
    serviceAccountKeyFile:
      resolveOptionalPath(getEnv('GOOGLE_SERVICE_ACCOUNT_KEY_FILE')) || detectServiceAccountKeyFile(),
    serviceAccountEmail: getEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    privateKey: getEnv('GOOGLE_PRIVATE_KEY')
      ? normalizePrivateKey(requiredEnv('GOOGLE_PRIVATE_KEY'))
      : '',
    jobSheetName: getEnv('JOB_SHEET_NAME', 'job_applications'),
    serviceSheetName: getEnv('SERVICE_SHEET_NAME', 'service_outreach'),
    jobBoardSheetName: getEnv('JOB_BOARD_SHEET_NAME', 'Job Board'),
  },
  senderProfile: {
    name: requiredEnv('YOUR_NAME'),
    phone: getEnv('YOUR_PHONE'),
    portfolioUrl: getEnv('YOUR_PORTFOLIO_URL'),
    linkedInUrl: getEnv('YOUR_LINKEDIN_URL'),
    githubUrl: getEnv('YOUR_GITHUB_URL'),
    cvSummary: requiredEnv('YOUR_CV_SUMMARY'),
    services: getEnv('YOUR_SERVICES'),
    cvFilePath: resolveOptionalPath(getEnv('YOUR_CV_FILE_PATH')),
  },
  gmail: {
    job: {
      user: requiredEnv('JOB_GMAIL_USER'),
      appPassword: requiredEnv('JOB_GMAIL_APP_PASSWORD'),
    },
    service: {
      user: requiredEnv('SERVICE_GMAIL_USER'),
      appPassword: requiredEnv('SERVICE_GMAIL_APP_PASSWORD'),
    },
  },
  ai: {
    huggingFaceApiKey: getEnv('HUGGING_FACE_API_KEY'),
  },
  automation: {
    allowDuplicateSends: getEnv('ALLOW_DUPLICATE_SENDS', 'false').toLowerCase() === 'true',
  },
};

module.exports = { config };
