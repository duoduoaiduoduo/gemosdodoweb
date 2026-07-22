const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const host = '127.0.0.1';
const port = 8080;
const rootDir = __dirname;
const defaultPage = 'veiw.html';

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.wasm': 'application/wasm',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.ply': 'application/octet-stream',
    '.splat': 'application/octet-stream',
    '.ksplat': 'application/octet-stream',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function sendError(res, statusCode, message) {
    res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(message);
}

function setCommonHeaders(res, filePath, stats) {
    res.setHeader('Content-Type', mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function resolveRequestPath(urlPath) {
    const decodedPath = decodeURIComponent(urlPath.split('?')[0]);
    const requestedPath = decodedPath === '/' ? `/${defaultPage}` : decodedPath;
    const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.[\\/])+/, '');
    return path.join(rootDir, normalizedPath);
}

function handleFileRequest(req, res, filePath) {
    fs.stat(filePath, (statErr, stats) => {
        if (statErr || !stats.isFile()) {
            sendError(res, 404, 'Not Found');
            return;
        }

        setCommonHeaders(res, filePath, stats);

        if (req.method === 'HEAD') {
            res.writeHead(200);
            res.end();
            return;
        }

        const rangeHeader = req.headers.range;
        if (!rangeHeader) {
            res.writeHead(200);
            fs.createReadStream(filePath).pipe(res);
            return;
        }

        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
        if (!match) {
            sendError(res, 416, 'Invalid Range');
            return;
        }

        let start = match[1] ? Number(match[1]) : 0;
        let end = match[2] ? Number(match[2]) : stats.size - 1;

        if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stats.size) {
            res.setHeader('Content-Range', `bytes */${stats.size}`);
            sendError(res, 416, 'Range Not Satisfiable');
            return;
        }

        end = Math.min(end, stats.size - 1);
        const chunkSize = end - start + 1;

        res.writeHead(206, {
            'Content-Length': chunkSize,
            'Content-Range': `bytes ${start}-${end}/${stats.size}`
        });

        fs.createReadStream(filePath, { start, end }).pipe(res);
    });
}

const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendError(res, 405, 'Method Not Allowed');
        return;
    }

    const filePath = resolveRequestPath(req.url || '/');
    const relativePath = path.relative(rootDir, filePath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        sendError(res, 403, 'Forbidden');
        return;
    }

    handleFileRequest(req, res, filePath);
});

server.listen(port, host, () => {
    const url = `http://${host}:${port}/`;
    console.log(`Server running at ${url}`);
    console.log(`Serving files from ${rootDir}`);
    openBrowser(url);
});

server.on('error', (err) => {
    console.error('Server failed to start:', err.message);
});

function openBrowser(url) {
    try {
        const child = spawn('cmd', ['/c', 'start', '', url], {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();
    } catch (err) {
        console.warn(`Browser auto-open skipped: ${err.message}`);
    }
}
