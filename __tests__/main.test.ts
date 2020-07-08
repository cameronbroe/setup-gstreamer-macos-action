import * as process from 'process';
import * as cp from 'child_process';
import * as path from 'path';

// shows how the runner will run a javascript action with env / stdout protocol
test('test runs', () => {
  process.env['RUNNER_TEMP'] = '/tmp/gstreamer-action';
  process.env['INPUT_VERSION'] = '1.16.2';
  const ip = path.join(__dirname, '..', 'dist', 'index.js');
  console.log(ip);
  const options: cp.ExecSyncOptions = {
    env: process.env
  };
  console.log(cp.execSync(`node ${ip}`, options).toString());
});
