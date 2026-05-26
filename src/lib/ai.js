const axios = require('axios');
const { config } = require('../config');

function extractModelText(responseData) {
  if (!responseData) {
    return '';
  }

  if (Array.isArray(responseData) && responseData[0]?.generated_text) {
    return responseData[0].generated_text;
  }

  if (typeof responseData.generated_text === 'string') {
    return responseData.generated_text;
  }

  return '';
}

async function generateOpeningLine(prompt) {
  if (!config.ai.huggingFaceApiKey) {
    return '';
  }

  try {
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.1',
      { inputs: prompt },
      {
        headers: {
          Authorization: `Bearer ${config.ai.huggingFaceApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const text = extractModelText(response.data);
    return text.replace(prompt, '').trim().split('\n')[0].slice(0, 220);
  } catch (error) {
    return '';
  }
}

async function generateStructuredEmail(prompt) {
  if (!config.ai.huggingFaceApiKey) {
    return '';
  }

  try {
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.1',
      { inputs: prompt },
      {
        headers: {
          Authorization: `Bearer ${config.ai.huggingFaceApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 90000,
      }
    );

    return extractModelText(response.data).replace(prompt, '').trim();
  } catch (error) {
    return '';
  }
}

module.exports = { generateOpeningLine, generateStructuredEmail };
