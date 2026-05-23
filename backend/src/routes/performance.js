import { Router } from 'express';
import { fetchPerformanceSnapshots } from '../lib/performanceSnapshots.js';

const router = Router();

function sendLastTwelve(req, res) {
  const rows = fetchPerformanceSnapshots(req.accountUserId, { limit: 12 });
  return res.json({
    capturePolicy: 'monthly-cron-first-day-2am',
    maxMonths: 12,
    seededSampleData: false,
    snapshots: rows
  });
}

router.get('/last-twelve', sendLastTwelve);
router.get('/last-six', sendLastTwelve);

export default router;
