import { spawn } from 'node:child_process';

const commands = [
  { name: 'server', args: ['--prefix', 'server', 'run', 'dev'] },
  { name: 'client', args: ['--prefix', 'client', 'run', 'dev'] },
];

const children = commands.map(({ name, args }) => {
  const child = spawn('npm', args, {
    cwd: process.cwd(),
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  const prefix = `[${name}]`;
  child.stdout.on('data', (data) => process.stdout.write(`${prefix} ${data}`));
  child.stderr.on('data', (data) => process.stderr.write(`${prefix} ${data}`));
  child.on('exit', (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
    }
  });

  return child;
});

const shutdown = () => {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
