const { config } = require('../config');
const { generateOpeningLine, generateStructuredEmail } = require('./ai');

function clean(value, fallback = '') {
  return String(value || fallback).trim();
}

function buildSignature() {
  const lines = [config.senderProfile.name];

  if (config.senderProfile.phone) {
    lines.push(`Phone: ${config.senderProfile.phone}`);
  }

  lines.push(`Email: ${config.gmail.job.user}`);

  if (config.senderProfile.githubUrl) {
    lines.push(`GitHub: ${config.senderProfile.githubUrl}`);
  }

  if (config.senderProfile.linkedInUrl) {
    lines.push(`LinkedIn: ${config.senderProfile.linkedInUrl}`);
  }

  if (config.senderProfile.portfolioUrl) {
    lines.push(`Portfolio: ${config.senderProfile.portfolioUrl}`);
  }

  return lines;
}

async function buildJobEmail(record) {
  const companyName = clean(record.company_name);
  const jobTitle = clean(record.job_title, 'Open Position');
  const recipientName = clean(record.recipient_name, 'Hiring Team');
  const customNote = clean(record.custom_note);
  const location = clean(record.location);
  const resumeLink = clean(record.resume_link);
  const jobLink = clean(record.job_link);
  const website = clean(record.website);
  const sourcePage = clean(record.source_page);
  const companyContext = clean(record.company_context);
  const jobPostContext = clean(record.job_post_context);
  const careerPageContext = clean(record.career_page_context);
  const applicationMode = clean(record.application_mode, jobPostContext || careerPageContext ? 'targeted' : 'general');

  const cvText = clean(record.cv_text);
  const cvSection = cvText
    ? cvText.slice(0, 4500)
    : config.senderProfile.cvSummary;

  const aiPrompt = `Write one short professional opening sentence for a job application email to ${companyName} for the ${jobTitle} role. Candidate summary: ${config.senderProfile.cvSummary}`;
  const openingLine =
    (await generateOpeningLine(aiPrompt)) ||
    `I am reaching out to express my interest in the ${jobTitle} role at ${companyName}.`;

  const premiumPrompt = `
Write a concise, human, premium-quality job application email that is PERSONALIZED by cross-matching the candidate's actual CV with the specific job posting.

Cross-match instructions:
- Read the candidate's CV carefully.
- Read the job post and company context carefully.
- Identify 2 or 3 concrete skills, projects, or experiences from the CV that directly match what the job is asking for.
- Reference those concrete items naturally in the email body (without listing them bullet-style).
- Do NOT invent skills or experiences not present in the CV.
- Do NOT copy CV phrasing verbatim — rewrite each match in a natural sentence.

Style rules:
- 170 to 260 words.
- Sound natural, confident, professional. Not generic. Not robotic.
- 3 short paragraphs plus a closing line.
- No placeholders. No headings. No lists.

Candidate name: ${config.senderProfile.name}
Candidate CV (full or summary):
${cvSection}

Application mode: ${applicationMode}
Target company: ${companyName}
Target job title: ${jobTitle}
Known website: ${website}
Company context: ${companyContext}
Career page context: ${careerPageContext}
Job post context: ${jobPostContext}
Additional note from candidate: ${customNote}
Opening sentence to reuse if helpful: ${openingLine}

Return only the email body, starting with "Dear ${recipientName}," and ending before the signature.
`;

  const premiumBody = await generateStructuredEmail(premiumPrompt);

  if (premiumBody) {
    const cleanedPremiumBody = premiumBody
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const lines = [cleanedPremiumBody];

    if (resumeLink) {
      lines.push('', `My resume can also be reviewed here: ${resumeLink}`);
    } else if (config.senderProfile.cvFilePath) {
      lines.push('', 'I have attached my resume for your review.');
    }

    lines.push('', 'Sincerely,', ...buildSignature());

    return {
      subject: `Application for ${jobTitle} at ${companyName}`,
      text: lines.join('\n'),
    };
  }

  const lines = [
    `Dear ${recipientName},`,
    '',
    openingLine,
    `My name is ${config.senderProfile.name}, and I am a Computer Science graduate with hands-on experience in full-stack development, automation, and database-driven applications.`,
    `My background includes ${config.senderProfile.cvSummary}. I enjoy building reliable software, learning quickly, and contributing to teams that care about product quality.`,
  ];

  if (location) {
    lines.push(`I would be glad to contribute to your team in ${location}.`);
  }

  if (customNote) {
    lines.push(customNote);
  }

  if (jobLink) {
    lines.push(`I reviewed the opportunity here: ${jobLink}`);
  }

  if (website && !jobLink) {
    lines.push(`I reviewed your company website here: ${website}`);
  }

  if (sourcePage && sourcePage !== jobLink && sourcePage !== website) {
    lines.push(`I also reviewed this page while researching the opportunity: ${sourcePage}`);
  }

  if (resumeLink) {
    lines.push(`My resume can be reviewed here: ${resumeLink}`);
  } else if (config.senderProfile.cvFilePath) {
    lines.push('I have attached my resume for your review.');
  }

  lines.push('');
  lines.push('I would appreciate the opportunity to discuss how I can contribute to your team.');
  lines.push('');
  lines.push('Thank you for your time and consideration.');
  lines.push('');
  lines.push('Sincerely,');
  lines.push(...buildSignature());

  return {
    subject: `Application for ${jobTitle} at ${companyName}`,
    text: lines.join('\n'),
  };
}

async function buildServiceEmail(record) {
  const businessName = clean(record.business_name, 'your team');
  const recipientName = clean(record.recipient_name);
  const painPoint = clean(record.pain_point);
  const serviceOffer = clean(record.service_offer, config.senderProfile.services);
  const website = clean(record.website);
  const customNote = clean(record.custom_note);
  const industry = clean(record.industry);
  const country = clean(record.country);
  const sourcePage = clean(record.source_page);
  const companyContext = clean(record.company_context);
  const outreachType = clean(record.outreach_type, 'cold');
  const greeting = recipientName
    ? `Hi ${recipientName},`
    : businessName && businessName !== 'your team'
      ? `Dear ${businessName} Team,`
      : 'Hello,';

  const opening = `I help businesses${industry ? ` in ${industry}` : ''} improve their digital workflow with practical software solutions, automation, and clean execution.`;

  const premiumPrompt = `
Write a short premium ${outreachType} outreach email that feels human and professional.

Rules:
- 120 to 190 words.
- Keep it concise and respectful.
- Mention the business naturally.
- Suggest practical help, not hype.
- Do not invent facts.

Sender background: ${config.senderProfile.cvSummary}
Services offered: ${config.senderProfile.services}
Business name: ${businessName}
Website: ${website}
Business context: ${companyContext}
Outreach type: ${outreachType}
Requested offer/service: ${serviceOffer}
Pain point: ${painPoint}
Additional note: ${customNote}

Return only the email body, starting with "${greeting}" and ending before the signature.
`;

  const premiumBody = await generateStructuredEmail(premiumPrompt);

  if (premiumBody) {
    return {
      subject: `${businessName}: quick idea for your business`,
      text: [premiumBody.trim(), '', 'Best regards,', ...buildSignature()].join('\n'),
    };
  }

  const lines = [
    greeting,
    '',
    `I came across ${businessName}${website ? ` (${website})` : ''} and wanted to reach out with a quick idea.`,
    opening,
    `I focus on work that is practical, lightweight to maintain, and directly useful for growth or operations.`,
  ];

  if (painPoint) {
    lines.push(`A likely area I could help with is: ${painPoint}.`);
  }

  lines.push(`I can support with ${serviceOffer}, depending on what would be most useful for your current stage.`);

  if (country) {
    lines.push(`I am open to working with teams in ${country} and across time zones.`);
  }

  if (customNote) {
    lines.push(customNote);
  }

  if (sourcePage && sourcePage !== website) {
    lines.push(`I found your business through: ${sourcePage}`);
  }

  if (config.senderProfile.portfolioUrl) {
    lines.push(`You can review some of my work here: ${config.senderProfile.portfolioUrl}`);
  }

  lines.push('');
  lines.push('If this is relevant, I would be happy to share a few tailored ideas or a simple action plan for your business.');
  lines.push('');
  lines.push('Best regards,');
  lines.push(...buildSignature());

  return {
    subject: `${businessName}: quick idea for your business`,
    text: lines.join('\n'),
  };
}

module.exports = {
  buildJobEmail,
  buildServiceEmail,
};
