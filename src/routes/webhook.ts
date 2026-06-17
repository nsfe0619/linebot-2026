import { Router } from 'express';
import { middleware, webhook } from '@line/bot-sdk';
import { channelSecret, lineClient } from '../services/line-client';
import { db } from '../services/firestore';
import type { FeatureHandler } from '../types/feature';
import type { KeywordRule } from '../types/models';
import { echoHandler } from '../features/echo';
import { beautyHandler } from '../features/beauty';
import { cryptoHandler } from '../features/crypto';
import { stockHandler } from '../features/stock';
import { ledgerHandler } from '../features/ledger';

const router = Router();

const featureRegistry = new Map<string, FeatureHandler>([
  ['echo', echoHandler],
  ['beauty', beautyHandler],
  ['crypto', cryptoHandler],
  ['stock', stockHandler],
  ['ledger', ledgerHandler],
]);

const prefixHandlers: Array<{ prefix: string; feature: string }> = [
  { prefix: '幣價', feature: 'crypto' },
  { prefix: '股價', feature: 'stock' },
  { prefix: '股票', feature: 'stock' },
  { prefix: '記帳', feature: 'ledger' },
  { prefix: '帳單', feature: 'ledger' },
];

function matchRule(text: string, rules: KeywordRule[]): KeywordRule | undefined {
  return rules.find(r => {
    if (r.matchType === 'exact') return text === r.keyword;
    if (r.matchType === 'contains') return text.includes(r.keyword);
    return false;
  });
}

async function handleTextMessage(event: webhook.MessageEvent): Promise<void> {
  if (event.message.type !== 'text') return;
  if (!event.replyToken) return;

  const messageText = event.message.text;

  // prefix 比對優先（不需要 Firestore）
  const prefixMatch = prefixHandlers.find(p => messageText.startsWith(p.prefix));
  let featureName = prefixMatch?.feature;

  if (!featureName) {
    let matchedRule: KeywordRule | undefined;
    try {
      const snap = await db
        .collection('keywordRules')
        .where('enabled', '==', true)
        .get();
      const rules = snap.docs.map(d => d.data() as KeywordRule);
      matchedRule = matchRule(messageText, rules);
    } catch (err) {
      console.error('[webhook] Failed to load keywordRules:', err);
    }
    featureName = matchedRule?.feature ?? 'echo';
  }
  const handler = featureRegistry.get(featureName) ?? echoHandler;

  try {
    await handler.handle(event, lineClient);
  } catch (err) {
    console.error(`[webhook] handler '${featureName}' threw:`, err);
    await lineClient
      .replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '出了點問題，請稍後再試 🙏' }],
      })
      .catch(() => {});
  }
}

async function handleEvent(event: webhook.Event): Promise<void> {
  if (event.type !== 'message') return;
  await handleTextMessage(event as webhook.MessageEvent);
}

router.post('/', middleware({ channelSecret }), async (req, res) => {
  const events: webhook.Event[] = req.body.events;
  await Promise.all(events.map(handleEvent));
  res.status(200).send('OK');
});

export default router;
