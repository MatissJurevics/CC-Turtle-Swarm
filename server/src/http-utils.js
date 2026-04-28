export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

export function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
    ...headers
  });
  res.end(body);
}

export function notFound(res) {
  sendJson(res, 404, { ok: false, reason: 'not_found' });
}

export function parseUrl(req) {
  return new URL(req.url, 'http://localhost');
}
