import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const { version } = packageJson;
const expectedTag = `v${version}`;
const tag = process.env.RELEASE_TAG ?? process.argv[2];

if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(version)) {
    throw new Error(`package.json contains an unsupported semantic version: ${version}`);
}

if (packageLock.version !== version || packageLock.packages?.['']?.version !== version) {
    throw new Error('package.json and package-lock.json versions do not match');
}

const escapedVersion = version.replaceAll('.', '\\.');
if (!new RegExp(`^## \\[${escapedVersion}\\](?: - \\d{4}-\\d{2}-\\d{2})?\\s*$`, 'mu').test(changelog)) {
    throw new Error(`CHANGELOG.md has no section for ${version}`);
}

if (tag && tag !== expectedTag) {
    throw new Error(`release tag ${tag} does not match package version ${expectedTag}`);
}

if (process.env.GITHUB_EVENT_NAME === 'push') {
    const exactTag = execFileSync('git', ['tag', '--points-at', 'HEAD'], { encoding: 'utf8' })
        .split('\n')
        .includes(expectedTag);
    if (!exactTag) {
        throw new Error(`${expectedTag} does not point at the checked-out commit`);
    }
}

process.stdout.write(`Release metadata is valid for ${expectedTag}\n`);
