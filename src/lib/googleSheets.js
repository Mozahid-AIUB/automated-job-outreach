const { google } = require('googleapis');
const { config } = require('../config');

function createSheetsClient() {
  let auth;

  if (config.sheets.serviceAccountKeyFile) {
    auth = new google.auth.GoogleAuth({
      keyFile: config.sheets.serviceAccountKeyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else {
    auth = new google.auth.JWT({
      email: config.sheets.serviceAccountEmail,
      key: config.sheets.privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  return google.sheets({ version: 'v4', auth });
}

function normalizeHeader(value, index) {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  return cleaned || `column_${index + 1}`;
}

function columnToLetter(columnNumber) {
  let number = columnNumber;
  let result = '';

  while (number > 0) {
    const remainder = (number - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }

  return result;
}

async function getSheetRows(sheetName) {
  const sheets = createSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.spreadsheetId,
    range: `${sheetName}!A:Z`,
  });

  const values = response.data.values || [];
  if (values.length === 0) {
    return [];
  }

  const headers = values[0].map(normalizeHeader);

  return values.slice(1).map((row, rowIndex) => {
    const record = headers.reduce((accumulator, header, columnIndex) => {
      accumulator[header] = row[columnIndex] || '';
      return accumulator;
    }, {});

    return {
      rowNumber: rowIndex + 2,
      headers,
      values: row,
      record,
    };
  });
}

async function updateCell(sheetName, rowNumber, headers, headerName, value) {
  const sheets = createSheetsClient();
  const index = headers.indexOf(headerName);

  if (index === -1) {
    throw new Error(`Column "${headerName}" not found in sheet "${sheetName}"`);
  }

  const columnLetter = columnToLetter(index + 1);

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.sheets.spreadsheetId,
    range: `${sheetName}!${columnLetter}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[value]],
    },
  });
}

async function updateStatus(sheetName, row, status, note = '') {
  await updateCell(sheetName, row.rowNumber, row.headers, 'status', status);

  if (row.headers.includes('last_message')) {
    await updateCell(sheetName, row.rowNumber, row.headers, 'last_message', note);
  }

  if (row.headers.includes('last_run_at')) {
    await updateCell(sheetName, row.rowNumber, row.headers, 'last_run_at', new Date().toISOString());
  }
}

async function updateOptionalFields(sheetName, row, updates = {}) {
  const entries = Object.entries(updates).filter(([headerName, value]) => {
    return row.headers.includes(headerName) && value !== undefined && value !== null && value !== '';
  });

  for (const [headerName, value] of entries) {
    await updateCell(sheetName, row.rowNumber, row.headers, headerName, value);
  }
}

async function appendRow(sheetName, headers, valuesByHeader) {
  const sheets = createSheetsClient();
  const rowValues = headers.map((header) => valuesByHeader[header] || '');

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.sheets.spreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [rowValues],
    },
  });
}

module.exports = {
  getSheetRows,
  updateStatus,
  updateOptionalFields,
  appendRow,
};
