import { Router } from 'express';
import { db } from '../lib/db.js';
import { hashToken } from '../lib/auth.js';
import { decryptString } from '../lib/crypto.js';
import { resolveAccountContext } from '../lib/family.js';

const router = Router();

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const PAGE_MARGIN_X = 44;
const PAGE_TOP_Y = 792;
const PAGE_BOTTOM_Y = 52;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN_X * 2;
const FONT_REGULAR = 'F1';
const FONT_BOLD = 'F2';

function escPdf(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r?\n/g, ' ');
}

function normalizeText(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function formatInr(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '-');
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function colorToRgb(color) {
  const hex = String(color || '').replace('#', '');
  if (hex.length !== 6) return '0 0 0';
  const parts = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  return parts.map((value) => value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') || '0').join(' ');
}

function wrapText(text, { fontSize = 11, maxWidth = CONTENT_WIDTH, font = FONT_REGULAR } = {}) {
  const cleaned = normalizeText(text, '');
  if (!cleaned) return [''];
  const widthFactor = font === FONT_BOLD ? 0.56 : 0.52;
  const maxChars = Math.max(18, Math.floor(maxWidth / (fontSize * widthFactor)));
  const words = cleaned.split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }
    const candidate = `${current} ${word}`;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function createPage() {
  return { commands: [], y: PAGE_TOP_Y };
}

function ensurePage(pages, requiredHeight = 18) {
  let page = pages[pages.length - 1];
  if (page.y - requiredHeight < PAGE_BOTTOM_Y) {
    page = createPage();
    pages.push(page);
  }
  return page;
}

function pushText(pages, text, options = {}) {
  const {
    font = FONT_REGULAR,
    fontSize = 11,
    color = '#0F172A',
    leading = fontSize + 5,
    indent = 0,
    maxWidth = CONTENT_WIDTH - indent
  } = options;
  const lines = wrapText(text, { fontSize, maxWidth, font });
  lines.forEach((line) => {
    const page = ensurePage(pages, leading);
    page.commands.push(
      `BT /${font} ${fontSize} Tf ${colorToRgb(color)} rg ${PAGE_MARGIN_X + indent} ${page.y} Td (${escPdf(line)}) Tj ET`
    );
    page.y -= leading;
  });
}

function pushSpacer(pages, amount = 8) {
  const page = ensurePage(pages, amount);
  page.y -= amount;
}

function pushDivider(pages, color = '#D9E2EF') {
  const page = ensurePage(pages, 16);
  page.commands.push(
    `q ${colorToRgb(color)} RG 1 w ${PAGE_MARGIN_X} ${page.y} m ${PAGE_WIDTH - PAGE_MARGIN_X} ${page.y} l S Q`
  );
  page.y -= 14;
}

function buildPdfDocument(pages) {
  const objects = [];
  const pageObjectNumbers = [];
  const contentObjectNumbers = [];
  let objectNumber = 3;

  pages.forEach(() => {
    pageObjectNumbers.push(objectNumber);
    objectNumber += 1;
  });
  pages.forEach(() => {
    contentObjectNumbers.push(objectNumber);
    objectNumber += 1;
  });

  const regularFontObject = objectNumber;
  const boldFontObject = objectNumber + 1;

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${pageObjectNumbers.map((num) => `${num} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((_page, index) => {
    objects.push(
      `${pageObjectNumbers[index]} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontObject} 0 R /F2 ${boldFontObject} 0 R >> >> /Contents ${contentObjectNumbers[index]} 0 R >>\nendobj\n`
    );
  });

  pages.forEach((page, index) => {
    const stream = page.commands.join('\n');
    objects.push(
      `${contentObjectNumbers[index]} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`
    );
  });

  objects.push(`${regularFontObject} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
  objects.push(`${boldFontObject} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  });

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function buildSnapshotPdf(report) {
  const pages = [createPage()];
  const groupedAssets = Array.from(
    report.assets.reduce((map, row) => {
      const key = normalizeText(row.category, 'Other');
      const current = map.get(key) || { category: key, count: 0, currentValue: 0 };
      current.count += 1;
      current.currentValue += Number(row.current_value || 0);
      map.set(key, current);
      return map;
    }, new Map()).values()
  ).sort((a, b) => Number(b.currentValue || 0) - Number(a.currentValue || 0));

  pushText(pages, 'Worthio Portfolio Snapshot', { font: FONT_BOLD, fontSize: 20, color: '#0B1F3A', leading: 24 });
  pushText(pages, `Report date: ${report.reportDate}`, { color: '#334155', leading: 16 });
  pushText(pages, `Generated: ${formatDateTime(report.generatedAt)}`, { color: '#334155', leading: 16 });
  pushText(pages, `Account ID: ${report.userId}`, { color: '#64748B', leading: 16 });
  pushSpacer(pages, 4);
  pushDivider(pages, '#CBD5E1');

  pushText(pages, 'Summary', { font: FONT_BOLD, fontSize: 14, color: '#155EAF', leading: 18 });
  pushText(pages, `Assets tracked: ${report.assets.length}`, { color: '#0F172A' });
  pushText(pages, `Liabilities tracked: ${report.liabilities.length}`, { color: '#0F172A' });
  pushText(pages, `Total assets: ${formatInr(report.totalAssets)}`, { color: '#0F172A' });
  pushText(pages, `Total liabilities: ${formatInr(report.totalLiabilities)}`, { color: '#0F172A' });
  pushText(pages, `Net worth: ${formatInr(report.netWorth)}`, { font: FONT_BOLD, color: '#0B1F3A', leading: 18 });

  pushSpacer(pages, 6);
  pushDivider(pages);

  pushText(pages, 'Asset Allocation Summary', { font: FONT_BOLD, fontSize: 14, color: '#155EAF', leading: 18 });
  if (groupedAssets.length) {
    groupedAssets.forEach((row) => {
      pushText(pages, `${row.category}: ${row.count} item(s) • ${formatInr(row.currentValue)}`, { color: '#0F172A' });
    });
  } else {
    pushText(pages, 'No assets recorded yet.', { color: '#64748B' });
  }

  pushSpacer(pages, 6);
  pushDivider(pages);

  pushText(pages, 'Asset Details', { font: FONT_BOLD, fontSize: 14, color: '#155EAF', leading: 18 });
  if (report.assets.length) {
    report.assets.forEach((row, index) => {
      pushText(pages, `${index + 1}. ${normalizeText(row.name, 'Unnamed asset')}`, {
        font: FONT_BOLD,
        fontSize: 12,
        color: '#0F172A',
        leading: 16
      });
      pushText(pages, `Category: ${normalizeText(row.category)}`, { color: '#334155', indent: 14 });
      pushText(pages, `Current value: ${formatInr(row.current_value)} • Invested value: ${formatInr(row.invested_amount)}`, {
        color: '#334155',
        indent: 14
      });
      pushText(pages, `Reference: ${normalizeText(row.account_ref)}`, { color: '#334155', indent: 14 });
      pushText(pages, `Website: ${normalizeText(row.tracking_url)}`, { color: '#334155', indent: 14 });
      pushSpacer(pages, 6);
    });
  } else {
    pushText(pages, 'No assets recorded yet.', { color: '#64748B' });
  }

  pushDivider(pages);

  pushText(pages, 'Liability Details', { font: FONT_BOLD, fontSize: 14, color: '#155EAF', leading: 18 });
  if (report.liabilities.length) {
    report.liabilities.forEach((row, index) => {
      pushText(pages, `${index + 1}. ${normalizeText(row.lender, 'Unnamed liability')}`, {
        font: FONT_BOLD,
        fontSize: 12,
        color: '#0F172A',
        leading: 16
      });
      pushText(pages, `Type: ${normalizeText(row.loan_type)}`, { color: '#334155', indent: 14 });
      pushText(pages, `Outstanding amount: ${formatInr(row.outstanding_amount)}`, { color: '#334155', indent: 14 });
      pushText(pages, `Reference: ${normalizeText(row.account_ref)}`, { color: '#334155', indent: 14 });
      pushSpacer(pages, 6);
    });
  } else {
    pushText(pages, 'No liabilities recorded yet.', { color: '#64748B' });
  }

  pushDivider(pages);
  pushText(pages, 'Prepared for secure offline review and sharing from Worthio.', {
    color: '#64748B',
    fontSize: 10,
    leading: 14
  });

  return buildPdfDocument(pages);
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

function buildSnapshotReport(userId, reportDate) {
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

  return {
    userId,
    reportDate,
    generatedAt: new Date().toISOString(),
    assets,
    liabilities,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities
  };
}

function sendPremiumRequired(res) {
  return res
    .status(403)
    .json({ error: 'premium_required', message: 'Premium subscription required', feature: 'family' });
}

router.get('/snapshot', (req, res) => {
  const resolved = resolveAccountUserId(req);
  if (!resolved) return res.status(401).json({ error: 'Authorization required' });
  if (resolved.error === 'premium_required') return sendPremiumRequired(res);

  const reportDate = String(req.query.date || '').trim() || new Date().toISOString().slice(0, 10);
  const report = buildSnapshotReport(resolved.userId, reportDate);
  const pdf = buildSnapshotPdf(report);
  const filename = `worthio-portfolio-snapshot-${reportDate}.pdf`;

  return res.json({
    filename,
    dataUri: `data:application/pdf;base64,${pdf.toString('base64')}`
  });
});

router.get('/snapshot/file', (req, res) => {
  const resolved = resolveAccountUserId(req);
  if (!resolved) return res.status(401).json({ error: 'Authorization required' });
  if (resolved.error === 'premium_required') return sendPremiumRequired(res);

  const reportDate = String(req.query.date || '').trim() || new Date().toISOString().slice(0, 10);
  const report = buildSnapshotReport(resolved.userId, reportDate);
  const pdf = buildSnapshotPdf(report);
  const filename = `worthio-portfolio-snapshot-${reportDate}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(pdf);
});

export default router;
