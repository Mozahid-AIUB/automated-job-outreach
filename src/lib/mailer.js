const nodemailer = require('nodemailer');
const { config } = require('../config');

function createTransport(workflow) {
  const account = workflow === 'job' ? config.gmail.job : config.gmail.service;

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: account.user,
      pass: account.appPassword,
    },
  });
}

async function sendMail(workflow, message) {
  const transport = createTransport(workflow);
  return transport.sendMail(message);
}

function normalizeAttachments(attachments = []) {
  return attachments
    .filter(Boolean)
    .map((attachment) => {
      if (typeof attachment === 'string') {
        return { path: attachment };
      }

      return attachment;
    });
}

module.exports = { sendMail, normalizeAttachments };
