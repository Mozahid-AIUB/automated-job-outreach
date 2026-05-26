const axios = require('axios');
const cheerio = require('cheerio');

const CAREER_KEYWORDS = [
  'career',
  'careers',
  'job',
  'jobs',
  'opening',
  'openings',
  'vacancy',
  'vacancies',
  'work with us',
  'join our team',
];

const CONTACT_KEYWORDS = ['contact', 'about', 'support', 'team', 'company', 'reach-us', 'reach us'];

function ensureUrl(url) {
  if (!url) {
    return '';
  }

  const trimmed = String(url).trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function sameHost(baseUrl, candidateUrl) {
  try {
    return new URL(baseUrl).host === new URL(candidateUrl).host;
  } catch (error) {
    return false;
  }
}

function extractEmails(text) {
  return Array.from(
    new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((email) => email.trim()))
  );
}

async function fetchPage(url) {
  const response = await axios.get(url, {
    timeout: 30000,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    },
  });

  return response.data;
}

function summarizeText(text, maxLength = 1600) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function getCareerCandidates($, baseUrl) {
  const candidates = new Set();

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    const label = $(element).text().trim().toLowerCase();
    if (!href) {
      return;
    }

    const fullUrl = new URL(href, baseUrl).toString();
    const normalizedHref = href.toLowerCase();
    const matchesKeyword = CAREER_KEYWORDS.some(
      (keyword) => normalizedHref.includes(keyword) || label.includes(keyword)
    );

    if (matchesKeyword && sameHost(baseUrl, fullUrl)) {
      candidates.add(fullUrl);
    }
  });

  ['/careers', '/career', '/jobs', '/job', '/join-us'].forEach((path) => {
    candidates.add(new URL(path, baseUrl).toString());
  });

  return Array.from(candidates).slice(0, 6);
}

function getContactCandidates($, baseUrl) {
  const candidates = new Set();

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    const label = $(element).text().trim().toLowerCase();
    if (!href) {
      return;
    }

    const fullUrl = new URL(href, baseUrl).toString();
    const normalizedHref = href.toLowerCase();
    const matchesKeyword = CONTACT_KEYWORDS.some(
      (keyword) => normalizedHref.includes(keyword) || label.includes(keyword)
    );

    if (matchesKeyword && sameHost(baseUrl, fullUrl)) {
      candidates.add(fullUrl);
    }
  });

  ['/contact', '/contact-us', '/about', '/about-us', '/support'].forEach((path) => {
    candidates.add(new URL(path, baseUrl).toString());
  });

  return Array.from(candidates).slice(0, 8);
}

function getJobOpenings($, pageUrl) {
  const openings = [];

  $('a[href]').each((_, element) => {
    const title = $(element).text().replace(/\s+/g, ' ').trim();
    const href = $(element).attr('href');
    if (!title || !href) {
      return;
    }

    const lowTitle = title.toLowerCase();
    const absoluteUrl = new URL(href, pageUrl).toString();
    const looksLikeJob =
      CAREER_KEYWORDS.some((keyword) => lowTitle.includes(keyword)) ||
      /(engineer|developer|designer|manager|executive|specialist|analyst|intern)/i.test(title);

    if (looksLikeJob) {
      openings.push({ title, url: absoluteUrl });
    }
  });

  return Array.from(
    new Map(openings.map((opening) => [`${opening.title}-${opening.url}`, opening])).values()
  ).slice(0, 8);
}

function pickRelevantOpening(openings, preferredTitle) {
  if (openings.length === 0) {
    return null;
  }

  if (!preferredTitle) {
    return openings[0];
  }

  const lowerPreferred = preferredTitle.toLowerCase();
  return (
    openings.find((opening) => opening.title.toLowerCase().includes(lowerPreferred)) || openings[0]
  );
}

async function scanCompanyWebsite(website, preferredTitle = '') {
  const baseUrl = ensureUrl(website);
  if (!baseUrl) {
    return null;
  }

  const homeHtml = await fetchPage(baseUrl);
  const $home = cheerio.load(homeHtml);
  const homepageText = $home.text();
  const mailtoEmails = [];

  $home('a[href^="mailto:"]').each((_, element) => {
    const href = $home(element).attr('href') || '';
    const email = href.replace(/^mailto:/i, '').split('?')[0].trim();
    if (email) {
      mailtoEmails.push(email);
    }
  });

  const emails = Array.from(new Set([...mailtoEmails, ...extractEmails(homepageText)])).slice(0, 5);
  const candidatePages = getCareerCandidates($home, baseUrl);
  const contactPages = getContactCandidates($home, baseUrl);

  const openings = [];
  const discoveredEmails = new Set(emails);

  for (const pageUrl of candidatePages) {
    try {
      const pageHtml = await fetchPage(pageUrl);
      const $page = cheerio.load(pageHtml);
      openings.push(...getJobOpenings($page, pageUrl));
      extractEmails($page.text()).forEach((email) => discoveredEmails.add(email));
    } catch (error) {
      continue;
    }
  }

  for (const pageUrl of contactPages) {
    try {
      const pageHtml = await fetchPage(pageUrl);
      const $page = cheerio.load(pageHtml);
      $page('a[href^="mailto:"]').each((_, element) => {
        const href = $page(element).attr('href') || '';
        const email = href.replace(/^mailto:/i, '').split('?')[0].trim();
        if (email) {
          discoveredEmails.add(email);
        }
      });
      extractEmails($page.text()).forEach((email) => discoveredEmails.add(email));
    } catch (error) {
      continue;
    }
  }

  const uniqueOpenings = Array.from(
    new Map(openings.map((opening) => [`${opening.title}-${opening.url}`, opening])).values()
  );

  return {
    website: baseUrl,
    emails: Array.from(discoveredEmails).slice(0, 8),
    careerPages: candidatePages,
    contactPages,
    openings: uniqueOpenings,
    matchedOpening: pickRelevantOpening(uniqueOpenings, preferredTitle),
    homepageSummary: summarizeText(homepageText),
  };
}

async function fetchPageContext(url) {
  const normalizedUrl = ensureUrl(url);
  if (!normalizedUrl) {
    return null;
  }

  const html = await fetchPage(normalizedUrl);
  const $page = cheerio.load(html);
  const text = summarizeText($page.text(), 2200);
  const title = $page('title').first().text().trim();
  const headings = Array.from($page('h1, h2').slice(0, 8)).map((element) =>
    $page(element).text().replace(/\s+/g, ' ').trim()
  );

  return {
    url: normalizedUrl,
    title,
    headings,
    text,
  };
}

module.exports = { scanCompanyWebsite, fetchPageContext };
