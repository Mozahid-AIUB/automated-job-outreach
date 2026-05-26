const { config } = require('./config');
const logger = require('./lib/logger');
const { processJobApplications } = require('./workflows/jobApplications');
const { processServiceOutreach } = require('./workflows/serviceOutreach');

async function runAutomation(runMode = config.app.runMode) {
  const previousMode = config.app.runMode;
  config.app.runMode = runMode;

  logger.info(`Automation started in ${config.app.runMode} mode.`);
  await processJobApplications();
  await processServiceOutreach();
  logger.info('Automation finished.');
  config.app.runMode = previousMode;
}

async function main() {
  await runAutomation(config.app.runMode);
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('Fatal error while running automation.', {
      message: error.message,
      stack: error.stack,
    });
    process.exitCode = 1;
  });
}

module.exports = { runAutomation };
