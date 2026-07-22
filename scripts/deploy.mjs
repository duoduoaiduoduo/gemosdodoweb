#!/usr/bin/env node
/**
 * 本地一键部署：把当前改动提交并推送到 GitHub main。
 * 服务器上的 autodeploy 守护进程会检测到新提交并自动跑 deploy.sh。
 *
 * 用法：
 *   npm run deploy                 # 交互式输入提交说明
 *   npm run deploy "修复首页样式"   # 直接带上提交说明
 */
import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const ROOT = new URL("..", import.meta.url).pathname;

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, stdio: "inherit", ...opts });
}

function status() {
  // 列出未提交的改动（含未跟踪文件），用于判断是否需要提交
  const out = execSync("git status --porcelain", { cwd: ROOT })
    .toString()
    .trim();
  return out;
}

function ask() {
  const rl = createInterface({ input: stdin, output: stdout });
  return rl.question("请输入本次更新的说明（commit message）：").then((a) => {
    rl.close();
    return a.trim();
  });
}

async function main() {
  const argMsg = process.argv[2]?.trim();

  const dirty = status();
  if (!dirty) {
    console.log("✅ 本地没有需要提交的改动。");
    // 仍然确保远端最新（例如别人改了），做一次 push 无害
  }

  let message = argMsg;
  if (!message) {
    message = await ask();
    if (!message) {
      message = `update ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
      console.log(`（未输入说明，使用默认：${message}）`);
    }
  }

  console.log("\n📦 正在暂存改动…");
  run("git add -A");

  console.log("💬 正在提交…");
  try {
    run(`git commit -m ${JSON.stringify(message)}`);
  } catch {
    console.log("⚠️  没有可提交的内容（或许改动已全部提交）。");
  }

  console.log("🚀 正在推送到 GitHub (main)…");
  run("git push origin main");

  console.log("\n✅ 已推送。服务器上的 autodeploy 守护进程会在约 60 秒内");
  console.log("   检测到新提交并自动执行 deploy.sh（备份 + 构建 + 重启）。");
  console.log("   稍后访问 https://gemosdodo.art/ 查看效果。\n");
}

main().catch((err) => {
  console.error("❌ 部署失败：", err.message || err);
  process.exit(1);
});
