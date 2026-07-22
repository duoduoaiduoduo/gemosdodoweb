import { spawn } from 'child_process';

console.log('正在同时启动后端数据服务器与前端开发环境...');

const server = spawn('npm', ['run', 'server'], { stdio: 'inherit', shell: true });
const frontend = spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true });

const cleanup = () => {
  console.log('关闭服务...');
  if (server) server.kill('SIGINT');
  if (frontend) frontend.kill('SIGINT');
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
