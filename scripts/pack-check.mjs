import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

const cache = mkdtempSync(`${tmpdir()}/ezzy-api-pack-cache-`);
let tarball;
try {
    const result = JSON.parse(
        execFileSync('npm', ['pack', '--json', '--ignore-scripts'], {
            encoding: 'utf8',
            env: { ...process.env, npm_config_cache: cache },
        }),
    );
    tarball = resolve(result[0].filename);
    execFileSync(process.execPath, [new URL('./smoke-package.mjs', import.meta.url).pathname, tarball], {
        stdio: 'inherit',
    });
} finally {
    if (tarball) {
        rmSync(tarball, { force: true });
    }
    rmSync(cache, { recursive: true, force: true });
}
