const assert = require('assert');
const path = require('path');
const {
  formatLogTimestamp,
  resolveAppLogFile,
  resolveDefaultLogDirectory,
} = require('../src/app-log-path.js');

(function testDevelopmentUsesWorkingDirectory() {
  assert.strictEqual(
    resolveDefaultLogDirectory({
      appSlug: 'arcgis-velocity-logger',
      isPackaged: false,
      cwd: path.join(path.sep, 'workspace'),
      homePath: path.join(path.sep, 'Users', 'test'),
      userDataPath: path.join(path.sep, 'user-data'),
    }),
    path.join(path.sep, 'workspace', 'logs')
  );
})();

(function testPackagedMacUsesUserLibraryLogs() {
  assert.strictEqual(
    resolveDefaultLogDirectory({
      appSlug: 'arcgis-velocity-logger',
      isPackaged: true,
      platform: 'darwin',
      homePath: path.join(path.sep, 'Users', 'test'),
      userDataPath: path.join(path.sep, 'user-data'),
    }),
    path.join(path.sep, 'Users', 'test', 'Library', 'Logs', 'arcgis-velocity-logger')
  );
})();

(function testPackagedWindowsAndLinuxUseUserData() {
  for (const platform of ['win32', 'linux']) {
    assert.strictEqual(
      resolveDefaultLogDirectory({
        appSlug: 'arcgis-velocity-logger',
        isPackaged: true,
        platform,
        homePath: path.join(path.sep, 'home', 'test'),
        userDataPath: path.join(path.sep, 'user-data'),
      }),
      path.join(path.sep, 'user-data', 'logs')
    );
  }
})();

(function testExplicitLogFileIsPreserved() {
  const explicitLogFile = path.join(path.sep, 'custom', 'logger.log');
  assert.strictEqual(
    resolveAppLogFile({
      explicitLogFile,
      appSlug: 'arcgis-velocity-logger',
      filePrefix: 'velocity-logger',
      isPackaged: true,
      platform: 'darwin',
      homePath: path.join(path.sep, 'Users', 'test'),
      userDataPath: path.join(path.sep, 'user-data'),
    }),
    explicitLogFile
  );
})();

(function testDefaultFilenameUsesStableTimestamp() {
  const date = new Date('2026-09-22T21:45:00.123Z');
  assert.strictEqual(formatLogTimestamp(date), '20260922T214500');
  assert.strictEqual(
    resolveAppLogFile({
      appSlug: 'arcgis-velocity-logger',
      filePrefix: 'velocity-logger',
      isPackaged: true,
      platform: 'darwin',
      homePath: path.join(path.sep, 'Users', 'test'),
      userDataPath: path.join(path.sep, 'user-data'),
      date,
    }),
    path.join(
      path.sep,
      'Users',
      'test',
      'Library',
      'Logs',
      'arcgis-velocity-logger',
      'velocity-logger-20260922T214500.log'
    )
  );
})();

console.log('app-log-path tests passed');
