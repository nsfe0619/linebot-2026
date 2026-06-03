import express from 'express';
import dotenv from 'dotenv';
import { seedSettings, seedKeywordRule } from './services/firestore';
import webhookRouter from './routes/webhook';

dotenv.config();

const app = express();

app.get('/', (_req, res) => res.send('LINE Bot (TypeScript) is running'));
app.use('/webhook', webhookRouter);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Listening on ${port}`);
  seedSettings().catch(err => console.error('[firestore] seedSettings failed:', err));
  seedKeywordRule({ keyword: '看妹子', matchType: 'exact', feature: 'beauty', enabled: true })
    .catch(err => console.error('[firestore] seedKeywordRule failed:', err));
});
