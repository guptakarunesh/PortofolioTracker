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
  <h2>1. Scope</h2>
  <p>This Privacy Policy explains how Networth Manager ("we", "our", "us") handles personal data when you use the mobile app and connected services. We process personal data in line with applicable Indian law, including the Digital Personal Data Protection Act, 2023.</p>

  <h2>2. Data We Collect</h2>
  <ul>
    <li><strong>Account data:</strong> two-letter initials, mobile number, optional email, country, and consent records.</li>
    <li><strong>Authentication data:</strong> MPIN hash, login/session records, OTP request and verification records, and reset events.</li>
    <li><strong>Financial data you enter:</strong> assets, liabilities, reminders, institution details, masked identifiers, notes for family, and allocation/performance summaries.</li>
    <li><strong>Sensitive fields:</strong> identifiers, relationship/branch contact, and family notes entered in asset/liability forms.</li>
    <li><strong>Family sharing data:</strong> invite logs, role assignments (admin/write/read), and access/audit activity.</li>
    <li><strong>Security telemetry:</strong> device identifier, app/device metadata, timezone/locale, IP address, user agent, and (if available from app context) approximate location coordinates and accuracy.</li>
    <li><strong>Notification data:</strong> push token, in-app notification records, and reminder delivery status.</li>
  </ul>

  <h2>3. Data We Do Not Collect</h2>
  <ul>
    <li>Bank passwords or internet banking credentials.</li>
    <li>Card CVV.</li>
    <li>SMS inbox content.</li>
    <li>Fingerprint or Face ID templates (biometric matching is handled by your device OS).</li>
  </ul>

  <h2>4. Why We Process Data</h2>
  <ul>
    <li>Create and secure your account.</li>
    <li>Show assets/liabilities and family-access workflow.</li>
    <li>Protect sensitive fields using PIN-gated reveal, masking, and audit trails.</li>
    <li>Send reminder and security notifications to the account owner and linked family users.</li>
    <li>Detect unauthorized access, bind trusted devices, and generate security incident reports.</li>
    <li>Generate AI Insights summaries using limited portfolio context.</li>
    <li>Meet legal, compliance, and fraud-prevention obligations.</li>
  </ul>

  <h2>5. Security and Storage Controls</h2>
  <ul>
    <li>Data is protected in transit using TLS.</li>
    <li>Selected sensitive fields are stored encrypted at rest.</li>
    <li>Sensitive details are masked by default and full view requires your security PIN.</li>
    <li>Sensitive-detail access attempts (success/failure) are logged.</li>
    <li>Trusted-device controls are used for login flows.</li>
    <li>When sensitive details are revealed, notifications may be sent to owner and family members in that account.</li>
  </ul>

  <h2>6. Sharing of Data</h2>
  <p>We do not sell personal data. We may share data only as needed for service operation:</p>
  <ul>
    <li>With family members you authorize under your family role settings.</li>
    <li>With service providers that support OTP delivery, push notifications, hosting, and AI response generation.</li>
    <li>With legal/regulatory authorities when required by law.</li>
  </ul>

  <h2>7. AI Insights Data Use</h2>
  <p>For AI Insights, we send limited context such as country code, preferred currency, portfolio totals, and allocation percentages. We do not intentionally send full account identifiers, contact numbers, or raw sensitive notes for this feature.</p>
  <p>AI output may be incomplete or incorrect and is provided for informational awareness only.</p>

  <h2>8. Retention</h2>
  <ul>
    <li>Primary account and portfolio data is retained while your account is active.</li>
    <li>On account deletion request, core account data is deleted from active tables.</li>
    <li>Certain operational/security records (for example deletion logs or fraud/security telemetry) may be retained in minimized or de-identified form where required or permitted by law.</li>
  </ul>

  <h2>9. Your Controls and Rights</h2>
  <ul>
    <li>Export your data from the app.</li>
    <li>Edit or delete assets/liabilities/reminders.</li>
    <li>Reset MPIN and Security PIN via OTP verification flows.</li>
    <li>View and revoke trusted devices.</li>
    <li>Delete your account.</li>
  </ul>

  <h2>10. Cross-Border Processing</h2>
  <p>Some service providers used for notifications, analytics/security, or AI processing may operate from multiple regions. By using the app, you consent to such processing subject to applicable law and contractual safeguards.</p>

  <h2>11. Children</h2>
  <p>The app is not intended for children under 18.</p>

  <h2>12. Grievance Contact</h2>
  <p>For privacy/security requests: <strong>grievance@networthmanager.app</strong>. We target response within 15 working days.</p>

  <h2>13. Updates to This Policy</h2>
  <p>We may revise this Privacy Policy as features or legal requirements evolve. Updated versions are published in-app, and continued use after update means acceptance of the revised policy.</p>`;

  res.type('html').send(htmlPage('Privacy Policy', body));
});

router.get('/terms', (_req, res) => {
  const body = `
  <h1>Terms of Service</h1>
  <div class="meta">Version ${TERMS_VERSION} | Effective ${LEGAL_EFFECTIVE_DATE}</div>
  <h2>1. Service Description</h2>
  <p>Networth Manager is a record-keeping and planning application for personal finance data, including assets, liabilities, reminders, family-sharing workflows, and AI-generated informational insights.</p>

  <h2>2. What the Service Is Not</h2>
  <ul>
    <li>Not investment, tax, legal, or insurance advice.</li>
    <li>Not a broker, bank, or portfolio manager.</li>
    <li>Not a guarantee of return, safety, or suitability of any financial decision.</li>
  </ul>

  <h2>3. Eligibility and Account Use</h2>
  <ul>
    <li>You must provide accurate registration and consent information.</li>
    <li>You are responsible for all activity under your account and linked family access.</li>
    <li>You must keep your MPIN, OTP access, and device security controls confidential.</li>
  </ul>

  <h2>4. Security Features and Your Obligations</h2>
  <ul>
    <li>Login may require trusted-device checks and/or OTP verification.</li>
    <li>Sensitive fields are masked; full reveal requires Security PIN.</li>
    <li>You must immediately revoke unknown devices and update credentials if compromise is suspected.</li>
  </ul>

  <h2>5. Family Sharing Terms</h2>
  <ul>
    <li>Family access is controlled by account owner/admin roles.</li>
    <li>Admin/write/read permissions define what each member can view or change.</li>
    <li>You are responsible for inviting only trusted people and maintaining role hygiene.</li>
    <li>Security and sensitive-access notifications may be sent to owner and family members in the account group.</li>
  </ul>

  <h2>6. Reminders and Notifications</h2>
  <p>Reminder alerts and security notifications are best-effort and may be delayed or unavailable due to network, device, OS, or third-party provider limitations. You remain responsible for deadlines and actions.</p>

  <h2>7. AI Insights Terms</h2>
  <ul>
    <li>AI Insights are automated summaries for awareness only.</li>
    <li>They may contain errors, omissions, stale data, or source limitations.</li>
    <li>You must independently verify facts before taking action.</li>
  </ul>

  <h2>8. Data Entry Responsibility</h2>
  <p>You are solely responsible for correctness, completeness, and lawful use of all data entered by you or your invited family users.</p>

  <h2>9. Acceptable Use</h2>
  <p>You agree not to misuse the service, attempt unauthorized access, reverse engineer security controls, abuse OTP/push channels, or use the app for unlawful purposes.</p>

  <h2>10. Subscription and Features</h2>
  <p>Certain features (including premium modules) may require an active paid subscription. Feature availability, plans, and pricing may change over time and will be shown in-app.</p>

  <h2>11. Suspension and Termination</h2>
  <p>We may suspend, restrict, or terminate access for suspected abuse, legal violations, fraud risk, or security risk. You may delete your account at any time from supported account controls.</p>

  <h2>12. Limitation of Liability</h2>
  <p>To the maximum extent permitted by law, we are not liable for indirect, incidental, special, or consequential damages, including financial loss arising from user decisions, incorrect data entry, delayed notifications, or third-party outages.</p>

  <h2>13. Governing Law</h2>
  <p>These Terms are governed by the laws of India. Courts with competent jurisdiction in India will have jurisdiction over disputes, subject to applicable law.</p>

  <h2>14. Changes to Terms</h2>
  <p>We may update these Terms as the product and legal requirements evolve. Continued use after publication of updated Terms constitutes acceptance.</p>`;

  res.type('html').send(htmlPage('Terms of Service', body));
});

export default router;
