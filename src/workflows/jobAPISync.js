const { config } = require('../config');
const logger = require('../lib/logger');
const { appendRow, getSheetRows } = require('../lib/googleSheets');
const { fetchJobsFromJSearch, deduplicateJobs } = require('../lib/jobAPIFetcher');

const JOB_HEADERS = [
    'company_name',
    'recipient_email',
    'website',
    'career_page',
    'job_post',
    'job_title',
    'application_mode',
    'status',
    'resume_path',
    'custom_note',
    'last_message',
    'last_run_at',
    'found_email',
    'source_page',
    'job_type',
    'location',
    'job_tags',
    'posted_days_ago',
];

/**
 * Sync jobs from API to Google Sheets
 */
async function syncJobsFromAPI(options = {}) {
    const {
        query = process.env.JOB_SEARCH_QUERY || 'software developer',
        location = process.env.JOB_SEARCH_LOCATION || 'Bangladesh',
        limit = Number(process.env.JOB_FETCH_LIMIT || 10),
        skipDuplicates = true,
    } = options;

    try {
        logger.info('Starting job API sync', { query, location, limit });

        // Fetch jobs from API
        const apiJobs = await fetchJobsFromJSearch({
            query,
            location,
            limit,
        });

        if (!apiJobs.length) {
            logger.warn('No jobs fetched from API. Sync completed with 0 new jobs.');
            return {
                success: true,
                totalFetched: 0,
                totalAdded: 0,
                skipped: 0,
            };
        }

        // Get existing jobs to avoid duplicates
        let existingJobs = [];
        if (skipDuplicates) {
            try {
                const existingRows = await getSheetRows(config.sheets.jobBoardSheetName);
                existingJobs = existingRows.map((row) => `${row.record.company_name}|${row.record.job_title}`);
            } catch (error) {
                logger.warn('Could not fetch existing jobs for deduplication', { message: error.message });
            }
        }

        // Deduplicate
        const uniqueJobs = deduplicateJobs(apiJobs).filter((job) => {
            const key = `${job.company_name}|${job.job_title}`;
            return !existingJobs.includes(key);
        });

        logger.info('Deduplicated jobs', { totalFetched: apiJobs.length, afterDedup: uniqueJobs.length });

        // Add jobs to Google Sheets
        let addedCount = 0;
        const errors = [];

        for (const job of uniqueJobs) {
            try {
                const jobRecord = {
                    company_name: job.company_name,
                    recipient_email: job.recipient_email || '',
                    website: job.website || '',
                    career_page: job.career_page || '',
                    job_post: job.job_post || '',
                    job_title: job.job_title,
                    application_mode: job.application_mode || 'targeted',
                    status: job.status || 'pending',
                    resume_path: '',
                    custom_note: job.custom_note || '',
                    last_message: '',
                    last_run_at: new Date().toISOString(),
                    found_email: '',
                    source_page: job.source_page || 'JSearch API',
                    job_type: job.job_type || 'Full-time',
                    location: job.location || 'Remote',
                    job_tags: job.job_tags || '',
                    posted_days_ago: job.posted_days_ago || 'unknown',
                };

                await appendRow(config.sheets.jobBoardSheetName, JOB_HEADERS, jobRecord);
                addedCount++;
            } catch (error) {
                logger.error('Failed to add job to sheet', {
                    company: job.company_name,
                    title: job.job_title,
                    message: error.message,
                });
                errors.push({
                    job: `${job.company_name} - ${job.job_title}`,
                    error: error.message,
                });
            }
        }

        logger.info('Job API sync completed', {
            totalFetched: apiJobs.length,
            totalAdded: addedCount,
            skipped: uniqueJobs.length - addedCount,
            errors: errors.length,
        });

        return {
            success: true,
            totalFetched: apiJobs.length,
            totalAdded: addedCount,
            skipped: uniqueJobs.length - addedCount,
            errors: errors,
        };
    } catch (error) {
        logger.error('Job API sync failed', {
            message: error.message,
            stack: error.stack,
        });

        return {
            success: false,
            message: error.message,
            totalFetched: 0,
            totalAdded: 0,
        };
    }
}

module.exports = { syncJobsFromAPI };
