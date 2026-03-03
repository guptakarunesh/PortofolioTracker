import { Router } from 'express';
import { LEGAL_EFFECTIVE_DATE, PRIVACY_POLICY_VERSION, TERMS_VERSION } from '../lib/legal.js';

const router = Router();

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; line-height: 1.5; color: #1f2937; }
    h1 { margin-bottom: 6px; }
    .meta { color: #6b7280; margin-bottom: 16px; }
    h2 { margin-top: 18px; }
    ul { margin-top: 6px; }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}

router.get('/versions', (_req, res) => {
  res.json({
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    termsVersion: TERMS_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE
  });
});

router.get('/privacy', (_req, res) => {
  const body = `
  <h1>Privacy Policy</h1>
  <div class="meta">Version ${PRIVACY_POLICY_VERSION} | Effective ${LEGAL_EFFECTIVE_DATE}</div>
  <h2>1. Introduction</h2>
  <p>This Privacy Policy describes how [Your Company Name] ("Company", "we", "our", "us") collects, uses, stores, and protects personal data through our mobile application ("App").</p>
  <p>We comply with the Digital Personal Data Protection Act, 2023 and applicable provisions of the Information Technology Act, 2000.</p>
  <h2>2. Personal Data We Collect</h2>
  <p>We collect the following:</p>
  <ul>
    <li>Mobile number (for registration and authentication)</li>
    <li>Financial information voluntarily entered by users:
      <ul>
        <li>Assets</li>
        <li>Liabilities</li>
        <li>Bank account numbers</li>
      </ul>
    </li>
    <li>Device information (device type, OS version, app logs if applicable)</li>
  </ul>
  <p>We do not collect:</p>
  <ul>
    <li>Bank passwords</li>
    <li>Banking OTPs</li>
    <li>Transaction data from banks</li>
    <li>SMS data</li>
  </ul>
  <h2>3. Purpose of Processing</h2>
  <p>We process personal data to:</p>
  <ul>
    <li>Provide personal financial tracking services</li>
    <li>Enable asset consolidation view</li>
    <li>Authenticate users</li>
    <li>Improve app performance</li>
    <li>Respond to user support requests</li>
  </ul>
  <h2>4. Legal Basis</h2>
  <p>We process personal data based on user consent provided at registration.</p>
  <p>Users may withdraw consent at any time by deleting their account.</p>
  <h2>5. Data Storage and Security</h2>
  <ul>
    <li>Data is encrypted in transit using TLS.</li>
    <li>Sensitive data such as bank account numbers are encrypted at rest.</li>
    <li>Access to user data is restricted using role-based access controls.</li>
    <li>We implement reasonable security safeguards as required by Indian law.</li>
  </ul>
  <h2>6. Data Retention</h2>
  <p>Personal data is retained:</p>
  <ul>
    <li>Until the user deletes their account; or</li>
    <li>As required under applicable law.</li>
  </ul>
  <p>Upon deletion request, data is permanently removed within 30 days.</p>
  <h2>7. User Rights</h2>
  <p>Users have the right to:</p>
  <ul>
    <li>Access their data</li>
    <li>Correct inaccurate data</li>
    <li>Delete their account</li>
    <li>Withdraw consent</li>
  </ul>
  <p>Requests may be sent to the Grievance Officer listed below.</p>
  <h2>8. Data Breach Notification</h2>
  <p>In case of a data breach, affected users and relevant authorities will be notified as required by law.</p>
  <h2>9. Grievance Officer</h2>
  <p>Name/Designation: Grievance Officer<br/>Email: grievance@[yourdomain].com<br/>Response time: Within 15 working days</p>
  <h2>10. Changes to Policy</h2>
  <p>We may update this policy from time to time. Continued use of the App constitutes acceptance.</p>`;

  res.type('html').send(htmlPage('Privacy Policy', body));
});

router.get('/terms', (_req, res) => {
  const body = `
  <h1>Terms of Service</h1>
  <div class="meta">Version ${TERMS_VERSION} | Effective ${LEGAL_EFFECTIVE_DATE}</div>
  <h2>1. Nature of Service</h2>
  <p>The App is a personal financial tracking tool that allows users to manually record assets and liabilities.</p>
  <p>We do not:</p>
  <ul>
    <li>Provide investment advice</li>
    <li>Provide tax advice</li>
    <li>Provide financial planning services</li>
    <li>Access bank accounts</li>
  </ul>
  <h2>2. No Financial Advice</h2>
  <p>The App does not provide financial, investment, legal, or tax advice. Users are solely responsible for decisions made based on data entered.</p>
  <h2>3. User Responsibility</h2>
  <p>Users are responsible for:</p>
  <ul>
    <li>Accuracy of information entered</li>
    <li>Keeping their mobile device secure</li>
    <li>Protecting OTP access</li>
  </ul>
  <h2>4. Limitation of Liability</h2>
  <p>The Company shall not be liable for:</p>
  <ul>
    <li>Financial losses</li>
    <li>Incorrect data entered by users</li>
    <li>Unauthorized access caused by user negligence</li>
  </ul>
  <h2>5. Data Protection</h2>
  <p>We implement reasonable security safeguards as required under Indian law.</p>
  <h2>6. Governing Law</h2>
  <p>These Terms shall be governed by the laws of India.</p>`;

  res.type('html').send(htmlPage('Terms of Service', body));
});

export default router;
