const axios = require('axios');
const logger = require('./logger');

/**
 * Fetch jobs from RapidAPI JSearch
 * Free tier: 100 requests/month
 * Docs: https://rapidapi.com/laimoon-laimoon-default/api/jsearch
 */
async function fetchJobsFromJSearch(params = {}) {
    const {
        query = 'software developer',
        location = 'Bangladesh',
        limit = 10,
    } = params;

    const apiKey = process.env.JSEARCH_API_KEY;
    if (!apiKey) {
        logger.warn('JSearch API key not configured. Skipping job fetch.');
        return [];
    }

    const options = {
        method: 'GET',
        url: 'https://jsearch.p.rapidapi.com/search',
        params: {
            query: query,
            page: '1',
            num_pages: '1',
            date_posted: 'month',
            employment_type: 'FULLTIME,PARTTIME,CONTRACT',
            location: location,
        },
        headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
    };

    try {
        logger.info('Fetching jobs from JSearch API', { query, location, limit, apiKeyExists: !!apiKey });
        const response = await axios.request(options);

        if (!response.data || !response.data.data) {
            logger.warn('No job data received from JSearch', { statusCode: response.status, responseData: response.data });
            return [];
        }

        const jobs = response.data.data.slice(0, limit).map((job) => ({
            company_name: job.employer_name || 'Unknown',
            job_title: job.job_title || 'Position',
            location: job.job_location || job.job_country || 'Remote',
            job_type: job.job_employment_type || 'Full-time',
            job_post: job.job_apply_link || job.job_job_title || '',
            website: job.employer_website || '',
            career_page: '',
            recipient_email: '',
            custom_note: (job.job_description || '').substring(0, 500),
            job_tags: (job.job_required_skills || []).join(','),
            posted_days_ago: job.job_posted_at_datetime_utc ? formatPostedDate(job.job_posted_at_datetime_utc) : 'unknown',
            status: 'pending',
            source_page: 'JSearch API',
            application_mode: 'targeted',
        }));

        logger.info('Successfully fetched jobs from JSearch', { count: jobs.length });
        return jobs;
    } catch (error) {
        logger.error('Error fetching jobs from JSearch API', {
            message: error.message,
            statusCode: error.response?.status,
            statusText: error.response?.statusText,
            errorData: error.response?.data,
            apiKeyExists: !!apiKey,
            endpoint: options.url,
        });
        return [];
    }
}

/**
 * Fetch jobs from Stack Overflow
 * Free tier: Unlimited
 */
async function fetchJobsFromStackOverflow(params = {}) {
    const {
        location = 'Bangladesh',
        limit = 10,
    } = params;

    try {
        logger.info('Fetching jobs from Stack Overflow', { location, limit });

        // Stack Overflow has a public API but no job search endpoint
        // We would need to use web scraping or a third-party API
        // For now, returning empty array
        logger.info('Stack Overflow API integration requires web scraping. Use JSearch instead.');
        return [];
    } catch (error) {
        logger.error('Error fetching jobs from Stack Overflow', {
            message: error.message,
        });
        return [];
    }
}

/**
 * Format posted date to human-readable format
 */
function formatPostedDate(isoDate) {
    if (!isoDate) return 'unknown';

    const postedDate = new Date(isoDate);
    const now = new Date();
    const diffMs = now - postedDate;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return '1d ago';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}m ago`;
}

/**
 * Remove duplicate jobs based on job_title and company_name
 */
function deduplicateJobs(jobs) {
    const seen = new Set();
    return jobs.filter((job) => {
        const key = `${job.company_name}|${job.job_title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

module.exports = {
    fetchJobsFromJSearch,
    fetchJobsFromStackOverflow,
    deduplicateJobs,
    formatPostedDate,
};
