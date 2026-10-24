import { spawn } from 'node:child_process';

let child = null;
let shuttingDown = false;

function launch() {
  child = spawn(process.execPath, ['server.js'], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    child = null;
    if (shuttingDown) {
      process.exit(0);
      return;
    }
    if (signal === 'SIGINT' || signal === 'SIGTERM') process.exit(0);
    if (code === 0) process.exit(0);
    console.error(`server exited (${code ?? signal}); restarting in 1s`);
    setTimeout(launch, 1000);
  });
}

function forward(signal) {
  shuttingDown = true;
  if (child && child.exitCode == null) {
    try {
      child.kill(signal);
    } catch {
      process.exit(0);
    }
    setTimeout(() => process.exit(0), 4000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));

launch();
