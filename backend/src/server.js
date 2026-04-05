import 'dotenv/config';
import app from './app.js';
import { startSharedCuratedNewsBootstrap } from './lib/newsPipeline.js';
import { startReminderNotifier } from './lib/reminderNotifier.js';

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Backend running on http://${HOST}:${PORT}`);
  startReminderNotifier();
  startSharedCuratedNewsBootstrap();
});
