import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const root = resolve(import.meta.dirname, '..');
const isWindows = process.platform === 'win32';

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: isWindows,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const wrapper = resolve(root, 'android', isWindows ? 'gradlew.bat' : 'gradlew');
if (!existsSync(wrapper)) {
  process.stderr.write('Android Gradle Wrapper is missing.\n');
  process.exit(1);
}

process.stdout.write('1/3 Building the web application and synchronizing Capacitor Android...\n');
run('npm', ['run', 'cap:sync']);

if (!isWindows) {
  run('chmod', ['+x', wrapper]);
}

process.stdout.write('2/3 Building the installable Android debug APK...\n');
run(wrapper, ['assembleDebug', '--no-daemon'], resolve(root, 'android'));

const apk = resolve(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
if (!existsSync(apk)) {
  process.stderr.write('Gradle completed but the expected APK was not found.\n');
  process.exit(1);
}
process.stdout.write(`3/3 APK created: ${apk}\n`);
