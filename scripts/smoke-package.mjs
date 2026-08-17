import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

const [, , tarballArgument] = process.argv;
if (!tarballArgument) {
    throw new Error('usage: node scripts/smoke-package.mjs <package.tgz>');
}
const tarball = resolve(tarballArgument);
const listing = execFileSync('tar', ['-tf', tarball], { encoding: 'utf8' }).trim().split('\n');
const required = [
    'package/package.json',
    'package/README.md',
    'package/LICENSE',
    'package/CHANGELOG.md',
    'package/docs/usage.md',
];

for (const file of required) {
    if (!listing.includes(file)) {
        throw new Error(`${file} is missing from ${basename(tarball)}`);
    }
}

const forbidden = listing.filter(
    (file) =>
        file.startsWith('package/src/') ||
        file.startsWith('package/examples/') ||
        file.includes('.spec.') ||
        /package\/(?:tsconfig|oxlint|oxfmt|compose|Dockerfile|Makefile|\.env)/u.test(file),
);
if (forbidden.length) {
    throw new Error(`unexpected files in package:\n${forbidden.join('\n')}`);
}

const project = mkdtempSync(`${tmpdir()}/ezzy-api-smoke-`);
try {
    writeFileSync(new URL('package.json', `file://${project}/`), '{"type":"module","private":true}');
    execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], {
        cwd: project,
        env: { ...process.env, npm_config_cache: resolve(project, '.npm-cache') },
        stdio: 'inherit',
    });
    writeFileSync(
        new URL('smoke.mjs', `file://${project}/`),
        "import { createApi, createApiClient, defineApi } from '@wutwind/ezzy-api';\n" +
            "for (const value of [createApi, createApiClient, defineApi]) if (typeof value !== 'function') throw new Error('missing runtime export');\n",
    );
    writeFileSync(
        new URL('smoke.ts', `file://${project}/`),
        "import { defineApi } from '@wutwind/ezzy-api';\n" +
            "const schema = { '~standard': { version: 1 as const, vendor: 'smoke', validate: (value: unknown) => ({ value }) } };\n" +
            "defineApi({ health: { method: 'GET', path: '/health', response: schema } });\n",
    );
    writeFileSync(
        new URL('tsconfig.json', `file://${project}/`),
        '{"compilerOptions":{"strict":true,"noEmit":true,"module":"NodeNext","moduleResolution":"NodeNext"},"files":["smoke.ts"]}',
    );
    execFileSync(process.execPath, ['smoke.mjs'], { cwd: project, stdio: 'inherit' });
    execFileSync(resolve('node_modules/.bin/tsc'), ['--project', 'tsconfig.json'], {
        cwd: project,
        stdio: 'inherit',
    });
} finally {
    rmSync(project, { recursive: true, force: true });
}

process.stdout.write(`Consumer smoke test passed for ${basename(tarball)}\n`);
