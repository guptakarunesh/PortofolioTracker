import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import httpMocks from 'node-mocks-http';
import { buildTestDbPath, loadApp, appRequest } from './test-utils.js';

async function rawRequest(app, { method = 'GET', path, token } = {}) {
  const req = httpMocks.createRequest({
    method,
    url: path,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {})
    }
  });
  const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
  await new Promise((resolve) => {
    res.on('end', resolve);
    app.handle(req, res);
  });
  return res;
}

test('snapshot report download uses worthio filename and returns a PDF payload', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  const register = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'RS',
      mobile: '7777777771',
      email: 'reports@example.com',
      country: 'India',
      firebase_id_token: 'mock:7777777771',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(register.status, 201);
  const token = register.body.token;
  assert.ok(token);

  const createAsset = await appRequest(app, {
    method: 'POST',
    path: '/api/assets',
    token,
    body: {
      category: 'Banking & Deposits',
      name: 'Emergency Fund',
      current_value: 250000,
      invested_amount: 240000,
      relationship_mobile: '9999999999',
      account_ref: 'SB-1234',
      tracking_url: 'https://bank.example.com',
      reach_via: 'Branch'
    }
  });
  assert.equal(createAsset.status, 201);

  const createLiability = await appRequest(app, {
    method: 'POST',
    path: '/api/liabilities',
    token,
    body: {
      loan_type: 'Home Loan',
      lender: 'HDFC Bank',
      holder_type: 'Self',
      outstanding_amount: 1500000,
      relationship_mobile: '9999999999',
      account_ref: 'HL-9876'
    }
  });
  assert.equal(createLiability.status, 201);

  const jsonResponse = await appRequest(app, {
    method: 'GET',
    path: '/api/reports/snapshot?date=2026-03-29',
    token
  });
  assert.equal(jsonResponse.status, 200);
  assert.equal(jsonResponse.body.filename, 'worthio-portfolio-snapshot-2026-03-29.pdf');
  assert.match(String(jsonResponse.body.dataUri || ''), /^data:application\/pdf;base64,/);

  const fileResponse = await rawRequest(app, {
    method: 'GET',
    path: '/api/reports/snapshot/file?date=2026-03-29',
    token
  });
  assert.equal(fileResponse.statusCode, 200);
  assert.equal(fileResponse.getHeader('Content-Type'), 'application/pdf');
  assert.equal(
    fileResponse.getHeader('Content-Disposition'),
    'attachment; filename="worthio-portfolio-snapshot-2026-03-29.pdf"'
  );
  assert.match(fileResponse._getData().toString('utf8', 0, 8), /^%PDF-1\.4/);
  const pdfText = fileResponse._getData().toString('utf8');
  assert.match(pdfText, /Account Initials: RS/);
  assert.doesNotMatch(pdfText, /Account ID:/);
  assert.doesNotMatch(pdfText, /•/);
  assert.match(pdfText, /100\.0%/);
});
