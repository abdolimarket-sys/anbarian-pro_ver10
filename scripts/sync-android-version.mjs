import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const gradlePath = new URL('../android/app/build.gradle', import.meta.url);
let gradle = readFileSync(gradlePath, 'utf8');
if (!/versionCode\s+\d+/.test(gradle) || !/versionName\s+['"][^'"]+['"]/.test(gradle)) {
  throw new Error('Android app/build.gradle does not contain versionCode and versionName fields.');
}
gradle = gradle
  .replace(/versionCode\s+\d+/, 'versionCode 37')
  .replace(/versionName\s+['"][^'"]+['"]/, `versionName "${pkg.version}"`);
writeFileSync(gradlePath, gradle);
process.stdout.write(`Android version synchronized: ${pkg.version} (code 37)\\n`);
