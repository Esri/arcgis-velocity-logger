/**
 * Copyright 2026 Esri
 *
 * Licensed under the Apache License Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const os = require('os');
const path = require('path');
const { parseCommandLineArgs, formatCliStartupErrorOutput } = require('./cli-options');
const { runHeadlessSession, EXIT_CODES } = require('./headless-runner');
const { resolveAppLogFile } = require('./app-log-path');
const { RunLogger } = require('./run-logger');

async function runCli(parsed) {
  const home = os.homedir();
  const appData = process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support')
    : process.platform === 'win32' ? process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
      : process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  const logFile = resolveAppLogFile({
    explicitLogFile: parsed.logFile,
    appSlug: 'arcgis-velocity-logger',
    filePrefix: 'velocity-logger',
    isPackaged: path.basename(path.dirname(__dirname)) === 'app.asar',
    homePath: home,
    userDataPath: path.join(appData, 'arcgis-velocity-logger'),
  });
  const logger = new RunLogger({ logLevel: parsed.logLevel, logFile, stdout: false });
  const write = logger.write.bind(logger);
  logger.write = (level, message) => {
    write(level, message);
    if (logger.shouldLog(level)) process.stderr.write(`${logger.format(level, message)}\n`);
  };
  if (parsed.mode === 'help') {
    process.stdout.write(`${parsed.helpText}\n`);
    logger.info('[Startup] Command-line help displayed');
    return EXIT_CODES.success;
  }
  if (parsed.mode === 'error') {
    logger.error(`[Startup] ${formatCliStartupErrorOutput(parsed)}`);
    return EXIT_CODES.configurationError;
  }
  if (parsed.mode !== 'headless') {
    logger.error('[Startup] This entry requires runMode=headless; use the application launcher for the GUI');
    return EXIT_CODES.configurationError;
  }
  logger.info(`[Startup] Log file: ${logFile}`);
  for (const warning of parsed.warnings) logger.warn(`[Startup] CLI warning: ${warning}`);
  if (parsed.explainText) logger.info(`[Startup] ${parsed.explainText}`);

  const controller = new AbortController();
  let interrupted = null;
  const stop = signal => {
    if (interrupted) return;
    interrupted = signal;
    logger.info(`[Shutdown] Received ${signal}; finishing capture`);
    controller.abort(signal);
  };
  const interrupt = () => stop('SIGINT');
  const terminate = () => stop('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    const code = await runHeadlessSession(parsed.headless, { logger, signal: controller.signal });
    return interrupted === 'SIGINT' ? 130 : interrupted === 'SIGTERM' ? 143 : code;
  } catch (error) {
    logger.error(`[Headless] ${error.stack || error.message}`);
    return EXIT_CODES.runtimeError;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
}

if (require.main === module) {
  runCli(parseCommandLineArgs(process.argv)).then(code => { process.exitCode = code; })
    .catch(error => { console.error(`[Headless] ${error.stack || error.message}`); process.exitCode = EXIT_CODES.runtimeError; });
}

module.exports = { runCli };
