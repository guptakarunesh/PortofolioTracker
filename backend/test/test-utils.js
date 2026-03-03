import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import httpMocks from 'node-mocks-http';

export async function loadApp() {
  const { default: app } = await import('../src/app.js');
  return app;
}

export function buildTestDbPath() {
  return `/tmp/portfolio-test-${randomUUID()}.db`;
}

export async function appRequest(app, { method = 'GET', path, body, token, headers = {} } = {}) {
  const req = httpMocks.createRequest({
    method,
    url: path,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body || undefined
  });

  const res = httpMocks.createResponse({ eventEmitter: EventEmitter });

  await new Promise((resolve) => {
    res.on('end', resolve);
    app.handle(req, res);
  });

  const status = res.statusCode;
  let payload = null;
  try {
    payload = res._getJSONData();
  } catch {
    payload = res._getData();
  }

  return { status, body: payload };
}
