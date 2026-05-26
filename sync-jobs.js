#!/usr/bin/env node

require('dotenv').config();
const { syncJobsFromAPI } = require('./src/workflows/jobAPISync');
const logger = require('./src/lib/logger');

async function main() {
    const args = process.argv.slice(2);

    const options = {
        query: process.env.JOB_SEARCH_QUERY || 'software developer',
        location: process.env.JOB_SEARCH_LOCATION || 'Bangladesh',
        limit: Number(process.env.JOB_FETCH_LIMIT || 15),
        skipDuplicates: true,
    };

    // Parse CLI arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--query' && args[i + 1]) {
            options.query = args[i + 1];
        } else if (args[i] === '--location' && args[i + 1]) {
            options.location = args[i + 1];
        } else if (args[i] === '--limit' && args[i + 1]) {
            options.limit = Number(args[i + 1]);
        }
    }

    logger.info('Starting Job API Sync', options);

    try {
        const result = await syncJobsFromAPI(options);

        console.log('\n=== Job Sync Report ===');
        console.log(`Total Fetched: ${result.totalFetched}`);
        console.log(`Total Added: ${result.totalAdded}`);
        console.log(`Skipped (Duplicates): ${result.skipped}`);

        if (result.errors && result.errors.length > 0) {
            console.log(`\nErrors (${result.errors.length}):`);
            result.errors.forEach((err) => {
                console.log(`  ✗ ${err.job}: ${err.error}`);
            });
        }

        console.log('\n✅ Sync completed!\n');
        process.exitCode = result.success ? 0 : 1;
    } catch (error) {
        logger.error('Fatal error', { message: error.message, stack: error.stack });
        console.error('\n❌ Sync failed:', error.message);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}
