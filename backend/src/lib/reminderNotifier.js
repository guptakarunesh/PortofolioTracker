import { db, nowIso } from './db.js';
import { decryptString } from './crypto.js';

const LOOP_MS = 60 * 1000;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

let timer = null;
let running = false;

function todayLocalYmd() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function shiftYmd(dateValue, deltaDays) {
  const raw = String(dateValue || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0));
  return dt.toISOString().slice(0, 10);
}

function recipientUserIds(ownerUserId) {
  const rows = db
    .prepare(
      `
      SELECT member_user_id AS user_id FROM family_members WHERE owner_user_id = ?
      UNION
      SELECT ? AS user_id
    `
    )
    .all(ownerUserId, ownerUserId);
  return [...new Set(rows.map((r) => Number(r.user_id)).filter((id) => id > 0))];
}

function buildReminderNotification(reminder, phase) {
  const description = String(decryptString(reminder.description) || 'Reminder').trim() || 'Reminder';
  if (phase === 'due') {
    return {
      title: 'Reminder Due Today',
      body: description,
      description
    };
  }
  return {
    title: 'Upcoming Reminder',
    body: `${description} due on ${String(reminder.due_date || '')}`,
    description
  };
}

async function sendExpoPush(messages) {
  if (!messages.length) return;
  const chunkSize = 100;
  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(chunk.map((item) => item.message))
      });
      const json = await response.json().catch(() => ({}));
      const resultRows = Array.isArray(json?.data) ? json.data : [];
      resultRows.forEach((row, idx) => {
        if (row?.status !== 'error') return;
        const code = String(row?.details?.error || '');
        if (code === 'DeviceNotRegistered') {
          const token = chunk[idx]?.token;
          if (token) {
            db.prepare('DELETE FROM device_push_tokens WHERE token = ?').run(token);
          }
        }
      });
    } catch (_e) {
      // Ignore push transport errors; next cycle retries naturally for unsent reminders.
    }
  }
}

async function processReminder(reminder, phase, notifyDate) {
  const recipients = recipientUserIds(reminder.user_id);
  if (!recipients.length) return;

  const now = nowIso();
  const { title, body, description } = buildReminderNotification(reminder, phase);
  const insertLog = db.prepare(`
    INSERT OR IGNORE INTO reminder_notification_log (
      reminder_id, recipient_user_id, notify_date, phase, created_at
    ) VALUES (?, ?, ?, ?, ?)
  `);
  const insertNotification = db.prepare(`
    INSERT INTO app_notifications (user_id, type, title, body, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const selectTokens = db.prepare('SELECT token FROM device_push_tokens WHERE user_id = ?');

  const outbound = [];
  recipients.forEach((recipientUserId) => {
    const logResult = insertLog.run(reminder.id, recipientUserId, notifyDate, phase, now);
    if (!logResult.changes) return;

    const payloadObj = {
      type: 'reminder_due',
      reminderId: Number(reminder.id),
      dueDate: String(reminder.due_date || ''),
      description,
      phase,
      at: now
    };
    const payload = JSON.stringify(payloadObj);
    insertNotification.run(recipientUserId, 'reminder_due', title, body, payload, now);

    const tokenRows = selectTokens.all(recipientUserId);
    tokenRows.forEach((row) => {
      const token = String(row?.token || '').trim();
      if (!token) return;
      outbound.push({
        token,
        message: {
          to: token,
          sound: 'default',
          priority: 'high',
          title,
          body,
          data: payloadObj
        }
      });
    });
  });

  await sendExpoPush(outbound);
}

async function runCycle() {
  if (running) return;
  running = true;
  try {
    const today = todayLocalYmd();
    const reminders = db
      .prepare(
        `
        SELECT id, user_id, due_date, description, status, alert_days_before
        FROM reminders
        WHERE status <> 'Completed'
      `
      )
      .all();

    for (const reminder of reminders) {
      const dueDate = String(reminder.due_date || '');
      if (!dueDate) continue;

      if (dueDate === today) {
        await processReminder(reminder, 'due', today);
      }

      const alertDays = Math.max(0, Number(reminder.alert_days_before || 0));
      if (alertDays > 0) {
        const alertDate = shiftYmd(dueDate, -alertDays);
        if (alertDate === today) {
          await processReminder(reminder, 'alert', today);
        }
      }
    }
  } finally {
    running = false;
  }
}

export function startReminderNotifier() {
  if (timer) return;
  runCycle().catch(() => {});
  timer = setInterval(() => {
    runCycle().catch(() => {});
  }, LOOP_MS);
}

