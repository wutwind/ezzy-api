import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';

const run = (command, args, options = {}) =>
    execFileSync(command, args, { encoding: 'utf8', stdio: 'inherit', ...options });
const output = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = `v${version}`;

if (output('git', ['status', '--porcelain'])) {
    throw new Error('working tree is not clean');
}
if (output('git', ['branch', '--show-current']) !== 'main') {
    throw new Error('releases must be tagged on main');
}

run(process.execPath, [new URL('./validate-release.mjs', import.meta.url).pathname]);

if (output('git', ['tag', '--list', tag])) {
    throw new Error(`local tag ${tag} already exists`);
}
const remoteTag = output('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]);
if (remoteTag) {
    throw new Error(`remote tag ${tag} already exists`);
}

run('npm', ['run', 'check']);
run('npm', ['run', 'build']);
run('npm', ['run', 'pack:check']);
run('git', ['tag', '-a', tag, '-m', `Release ${version}`]);

process.stdout.write(`Created ${tag}. Review it with: git show ${tag}\n`);
process.stdout.write(`Publish it with: git push origin ${tag}\n`);
