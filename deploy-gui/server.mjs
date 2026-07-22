#!/usr/bin/env node
/**
 * 本地一键部署小服务（零依赖）。
 * - GET  /            返回部署界面 (public/index.html)
 * - POST /deploy      接收 {message}，跑 scripts/deploy.mjs，用 SSE 实时回传进度
 * - POST /shutdown     退出服务
 *
 * 启动后自动在 macOS 打开浏览器到界面。仅监听 127.0.0.1，外部不可访问。
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, ".."); // 项目根目录
const PUBLIC = join(__dirname, "public");
const PORT_FILE = join(__dirname, ".port");
const PORT = process.env.PORT || 0; // 0 = 系统自动分配空闲端口

const LIVE_URL = "https://gemosdodo.art/";

const server = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];

  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    try {
      const html = await readFile(join(PUBLIC, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("界面文件缺失");
    }
    return;
  }

  if (req.method === "POST" && url === "/deploy") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => handleDeploy(res, body));
    return;
  }

  if (req.method === "POST" && url === "/shutdown") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("bye");
    setTimeout(() => process.exit(0), 200);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

// 根据 deploy.mjs 的输出行映射到进度与状态（顺序很重要，避免误匹配"新提交"等）
function mapLine(line) {
  if (line.includes("已推送"))
    return { progress: 80, status: "已推送，等待服务器自动部署…" };
  if (line.includes("暂存")) return { progress: 25, status: "暂存改动…" };
  if (line.includes("正在提交") || line.includes("提交到") || line.includes("已提交"))
    return { progress: 45, status: "提交到本地仓库…" };
  if (line.includes("推送") || line.includes("push"))
    return { progress: 65, status: "推送到 GitHub…" };
  return null;
}

async function handleDeploy(res, body) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let message = "update";
  try {
    const m = JSON.parse(body).message;
    if (typeof m === "string" && m.trim()) message = m.trim().slice(0, 200);
  } catch {}

  sse(res, { progress: 10, status: "准备中…", log: "开始部署" });

  const child = spawn(
    "node",
    ["scripts/deploy.mjs", message],
    { cwd: ROOT, env: process.env }
  );

  child.stdout.on("data", (d) => {
    for (const line of d.toString().split("\n")) {
      const t = line.trim();
      if (!t) continue;
      if (t.includes("pre-push") || t.includes("/bin/ps")) continue; // 过滤沙箱噪音
      const m = mapLine(t);
      if (m) sse(res, { ...m, log: t });
      else sse(res, { log: t });
    }
  });
  child.stderr.on("data", (d) => {
    for (const line of d.toString().split("\n")) {
      const t = line.trim();
      if (!t || t.includes("pre-push") || t.includes("/bin/ps")) continue;
      sse(res, { log: t });
    }
  });

  child.on("close", (code) => {
    if (code !== 0) {
      sse(res, { progress: 100, status: "❌ 部署失败，请检查日志", done: true });
      return res.end();
    }
    // 推送成功，轮询线上站点确认自动部署生效
    sse(res, { progress: 85, status: "已推送，服务器自动部署中…" });
    verifyLive(res);
  });
}

async function verifyLive(res) {
  const deadline = Date.now() + 120000; // 最多等 2 分钟
  const tick = async () => {
    if (Date.now() > deadline) {
      sse(res, {
        progress: 100,
        status: "⚠️ 推送成功，但未能自动确认上线（可能仍在部署，稍后访问网站确认）",
        done: true,
      });
      return res.end();
    }
    let ok = false;
    try {
      const r = await fetch(LIVE_URL, { method: "GET", redirect: "manual" });
      ok = r.status >= 200 && r.status < 400;
    } catch {
      ok = false;
    }
    if (ok) {
      sse(res, {
        progress: 100,
        status: "✅ 网站已更新上线！",
        url: LIVE_URL,
        done: true,
      });
      return res.end();
    }
    sse(res, { progress: 90, status: "自动部署中，正在确认网站上线…" });
    setTimeout(tick, 10000);
  };
  setTimeout(tick, 15000); // 先等 15s 让服务器轮询守护进程反应
}

server.listen(PORT, "127.0.0.1", () => {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;
  console.log(`部署小服务已启动：${url}`);
  writeFile(PORT_FILE, String(port)).catch(() => {});
  // macOS 自动打开浏览器
  try {
    execSync(`open ${url}`);
  } catch {
    /* 无 GUI 环境（如沙箱）静默忽略 */
  }
});

async function shutdown() {
  await rm(PORT_FILE, { force: true });
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
