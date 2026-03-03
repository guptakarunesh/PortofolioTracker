import { Router } from 'express';
import { db } from '../lib/db.js';
import { hashToken } from '../lib/auth.js';
import { decryptString } from '../lib/crypto.js';
import { resolveAccountContext } from '../lib/family.js';

const router = Router();

function esc(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildSimplePdf(lines) {
  const lineHeight = 14;
  let y = 800;
  let stream = 'BT\n/F1 11 Tf\n';
  lines.slice(0, 52).forEach((line, idx) => {
    if (idx === 0) {
      stream += `50 ${y} Td\n(${esc(line)}) Tj\n`;
    } else {
      stream += `0 -${lineHeight} Td\n(${esc(line)}) Tj\n`;
    }
  });
  stream += 'ET';

  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n'
  );
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  objects.push(`5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`);

  let pdf = '%PDF-1.4\n';
  const xrefOffsets = [0];
  objects.forEach((obj) => {
    xrefOffsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  });
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(xrefOffsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function resolveAccountUserId(req) {
  const authHeader = req.headers.authorization || '';
  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length).trim();
  } else if (req.query?.token) {
    token = String(req.query.token).trim();
  }
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(tokenHash);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;
  const context = resolveAccountContext(session.user_id);
  if (!context.isOwner && !context.premiumActive) {
    return { error: 'premium_required' };
  }
  return { userId: context.accountUserId };
}

router.get('/snapshot', (req, res) => {
  const resolved = resolveAccountUserId(req);
  if (!resolved) return res.status(401).json({ error: 'Authorization required' });
  if (resolved.error === 'premium_required') {
    return res
      .status(403)
      .json({ error: 'premium_required', message: 'Premium subscription required', feature: 'family' });
  }
  const userId = resolved.userId;

  const reportDate = String(req.query.date || '').trim() || new Date().toISOString().slice(0, 10);

  const assets = db
    .prepare(`
      SELECT category, name, account_ref, tracking_url, current_value, invested_amount
      FROM assets
      WHERE user_id = ?
      ORDER BY category ASC, name ASC
    `)
    .all(userId)
    .map((row) => ({
      ...row,
      account_ref: decryptString(row.account_ref)
    }));

  const liabilities = db
    .prepare(`
      SELECT loan_type, lender, account_ref, outstanding_amount
      FROM liabilities
      WHERE user_id = ?
      ORDER BY loan_type ASC, lender ASC
    `)
    .all(userId)
    .map((row) => ({
      ...row,
      account_ref: decryptString(row.account_ref)
    }));

  const totalAssets = assets.reduce((sum, row) => sum + Number(row.current_value || 0), 0);
  const totalLiabilities = liabilities.reduce((sum, row) => sum + Number(row.outstanding_amount || 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  const lines = [
    `Portfolio Snapshot Report (${reportDate})`,
    `User ID: ${userId}`,
    '',
    `Assets Count: ${assets.length}`,
    `Liabilities Count: ${liabilities.length}`,
    `Total Assets: INR ${totalAssets.toFixed(2)}`,
    `Total Liabilities: INR ${totalLiabilities.toFixed(2)}`,
    `Net Worth: INR ${netWorth.toFixed(2)}`,
    '',
    'Assets:'
  ];

  assets.forEach((row, idx) => {
    lines.push(
      `${idx + 1}. ${row.category} | ${row.name} | Ref: ${row.account_ref || '-'} | Site: ${row.tracking_url || '-'} | Current: INR ${Number(row.current_value || 0).toFixed(2)}`
    );
  });

  lines.push('');
  lines.push('Liabilities:');
  liabilities.forEach((row, idx) => {
    lines.push(
      `${idx + 1}. ${row.loan_type} | ${row.lender} | Ref: ${row.account_ref || '-'} | Outstanding: INR ${Number(row.outstanding_amount || 0).toFixed(2)}`
    );
  });

  const pdf = buildSimplePdf(lines);
  const filename = `portfolio-snapshot-${reportDate}.pdf`;
  const dataUri = `data:application/pdf;base64,${pdf.toString('base64')}`;

  return res.json({
    filename,
    dataUri
  });
});

router.get('/snapshot/file', (req, res) => {
  const resolved = resolveAccountUserId(req);
  if (!resolved) return res.status(401).json({ error: 'Authorization required' });
  if (resolved.error === 'premium_required') {
    return res
      .status(403)
      .json({ error: 'premium_required', message: 'Premium subscription required', feature: 'family' });
  }
  const userId = resolved.userId;

  const reportDate = String(req.query.date || '').trim() || new Date().toISOString().slice(0, 10);

  const assets = db
    .prepare(`
      SELECT category, name, account_ref, tracking_url, current_value
      FROM assets
      WHERE user_id = ?
      ORDER BY category ASC, name ASC
    `)
    .all(userId)
    .map((row) => ({
      ...row,
      account_ref: decryptString(row.account_ref)
    }));

  const liabilities = db
    .prepare(`
      SELECT loan_type, lender, account_ref, outstanding_amount
      FROM liabilities
      WHERE user_id = ?
      ORDER BY loan_type ASC, lender ASC
    `)
    .all(userId)
    .map((row) => ({
      ...row,
      account_ref: decryptString(row.account_ref)
    }));

  const totalAssets = assets.reduce((sum, row) => sum + Number(row.current_value || 0), 0);
  const totalLiabilities = liabilities.reduce((sum, row) => sum + Number(row.outstanding_amount || 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  const lines = [
    `Portfolio Snapshot Report (${reportDate})`,
    `User ID: ${userId}`,
    '',
    `Assets Count: ${assets.length}`,
    `Liabilities Count: ${liabilities.length}`,
    `Total Assets: ${totalAssets.toFixed(2)}`,
    `Total Liabilities: ${totalLiabilities.toFixed(2)}`,
    `Net Worth: ${netWorth.toFixed(2)}`,
    '',
    'Assets:'
  ];

  assets.forEach((row, idx) => {
    lines.push(
      `${idx + 1}. ${row.category} | ${row.name} | Ref: ${row.account_ref || '-'} | Site: ${row.tracking_url || '-'} | Current: ${Number(row.current_value || 0).toFixed(2)}`
    );
  });

  lines.push('');
  lines.push('Liabilities:');
  liabilities.forEach((row, idx) => {
    lines.push(
      `${idx + 1}. ${row.loan_type} | ${row.lender} | Ref: ${row.account_ref || '-'} | Outstanding: ${Number(row.outstanding_amount || 0).toFixed(2)}`
    );
  });

  const pdf = buildSimplePdf(lines);
  const filename = `portfolio-snapshot-${reportDate}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(pdf);
});

export default router;
