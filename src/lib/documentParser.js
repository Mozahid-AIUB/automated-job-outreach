const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const Tesseract = require('tesseract.js');

function normalizeText(value, maxLength = 4000) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

async function extractPdfText(filePath) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return normalizeText(result.text);
  } finally {
    await parser.destroy();
  }
}

async function extractImageText(filePath) {
  const result = await Tesseract.recognize(filePath, 'eng');
  return normalizeText(result?.data?.text);
}

async function extractTextFromFile(filePath) {
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  if (!fs.existsSync(absPath)) return '';

  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.pdf') {
    return extractPdfText(absPath);
  }

  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    return extractImageText(absPath);
  }

  return '';
}

function inferJobTitleFromText(text) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const candidates = lines.filter((line) =>
    /(engineer|developer|designer|manager|executive|specialist|analyst|intern|officer|teacher|marketer|coordinator)/i.test(line)
  );

  return candidates[0] || '';
}

module.exports = {
  extractTextFromFile,
  inferJobTitleFromText,
  normalizeText,
};
