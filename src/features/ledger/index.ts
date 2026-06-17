import type { FeatureHandler } from '../../types/feature';
import { lineClient } from '../../services/line-client';
import { db } from '../../services/firestore';
import { Timestamp } from 'firebase-admin/firestore';

interface LedgerEntry {
  userId: string;
  amount: number;
  note: string;
  type: 'income' | 'expense';
  createdAt: Timestamp;
}

export const ledgerHandler: FeatureHandler = {
  name: 'ledger',
  async handle(event, _client) {
    if (!event.replyToken) return;
    if (event.message.type !== 'text') return;

    const text = event.message.text.trim();
    const userId = event.source?.userId ?? 'unknown';

    // 帳單 — 查詢本月紀錄
    if (text === '帳單') {
      await handleSummary(event.replyToken, userId);
      return;
    }

    // 記帳 +100 早餐 or 記帳 -200 午餐
    const match = text.match(/^記帳\s+([+-]\d+)\s+(.+)$/);
    if (!match) {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: '格式：記帳 +100 早餐\n　　　記帳 -200 午餐\n查詢：帳單',
        }],
      });
      return;
    }

    const amount = parseInt(match[1], 10);
    const note = match[2];
    const type: 'income' | 'expense' = amount >= 0 ? 'income' : 'expense';

    const entry: LedgerEntry = {
      userId,
      amount,
      note,
      type,
      createdAt: Timestamp.now(),
    };

    await db.collection('ledger').add(entry);

    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [{
        type: 'text',
        text: `已記錄 ${amount > 0 ? '收入' : '支出'} ${Math.abs(amount)} 元：${note}`,
      }],
    });
  },
};

async function handleSummary(replyToken: string, userId: string): Promise<void> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const snap = await db.collection('ledger')
    .where('userId', '==', userId)
    .where('createdAt', '>=', Timestamp.fromDate(startOfMonth))
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  if (snap.empty) {
    await lineClient.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '本月尚無記帳紀錄' }],
    });
    return;
  }

  const entries = snap.docs.map(d => d.data() as LedgerEntry);
  const income = entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const expense = entries.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0);
  const balance = income + expense;

  const lines = entries.slice(0, 10).map(e =>
    `${e.amount > 0 ? '＋' : '－'}${Math.abs(e.amount)} ${e.note}`
  );

  const summary =
    `📒 本月帳單\n` +
    `收入：+${income}\n` +
    `支出：${expense}\n` +
    `結餘：${balance >= 0 ? '+' : ''}${balance}\n\n` +
    `最近紀錄：\n` +
    lines.join('\n');

  await lineClient.replyMessage({
    replyToken,
    messages: [{ type: 'text', text: summary }],
  });
}
