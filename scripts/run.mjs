import { spawn } from 'node:child_process';

function launch() {
  const child = spawn(process.execPath, ['server.js'], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    if (signal === 'SIGINT' || signal === 'SIGTERM') process.exit(0);
    if (code === 0) process.exit(0);
    console.error(`server exited (${code ?? signal}); restarting in 1s`);
    setTimeout(launch, 1000);
  });
}

launch();
