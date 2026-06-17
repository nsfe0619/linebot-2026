import type { FeatureHandler } from '../../types/feature';
import { lineClient } from '../../services/line-client';
import { messagingApi } from '@line/bot-sdk';
import { db } from '../../services/firestore';
import { Timestamp } from 'firebase-admin/firestore';

interface LedgerEntry {
  userId: string;
  amount: number;
  note: string;
  type: 'income' | 'expense';
  createdAt: Timestamp;
}

const QUICK_EXPENSES = [
  { label: '早餐 -60', text: '記帳 -60 早餐' },
  { label: '午餐 -120', text: '記帳 -120 午餐' },
  { label: '晚餐 -150', text: '記帳 -150 晚餐' },
  { label: '交通 -50', text: '記帳 -50 交通' },
  { label: '娛樂 -200', text: '記帳 -200 娛樂' },
  { label: '查帳單', text: '帳單' },
];

function ledgerMenuMessage(): messagingApi.TextMessage {
  return {
    type: 'text',
    text: '記帳快捷，或輸入：記帳 -100 午餐 / 記帳 +500 薪水',
    quickReply: {
      items: QUICK_EXPENSES.map(e => ({
        type: 'action' as const,
        action: { type: 'message' as const, label: e.label, text: e.text },
      })),
    },
  };
}

function summaryFlexMessage(income: number, expense: number, entries: LedgerEntry[]): messagingApi.FlexMessage {
  const balance = income + expense;
  const balanceColor = balance >= 0 ? '#22c55e' : '#ef4444';
  const recentLines = entries.slice(0, 8).map(e => ({
    type: 'box' as const,
    layout: 'horizontal' as const,
    contents: [
      { type: 'text' as const, text: e.note, size: 'xs' as const, color: '#475569', flex: 3 },
      {
        type: 'text' as const,
        text: `${e.amount > 0 ? '+' : ''}${e.amount}`,
        size: 'xs' as const,
        color: e.amount > 0 ? '#22c55e' : '#ef4444',
        align: 'end' as const,
        flex: 2,
      },
    ],
  }));

  return {
    type: 'flex',
    altText: `本月結餘 ${balance >= 0 ? '+' : ''}${balance}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1e293b',
        contents: [{ type: 'text', text: '📒 本月帳單', color: '#f8fafc', weight: 'bold', size: 'lg' }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '收入', color: '#64748b', size: 'sm', flex: 2 },
              { type: 'text', text: `+${income}`, color: '#22c55e', weight: 'bold', size: 'sm', flex: 3, align: 'end' },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '支出', color: '#64748b', size: 'sm', flex: 2 },
              { type: 'text', text: `${expense}`, color: '#ef4444', weight: 'bold', size: 'sm', flex: 3, align: 'end' },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '結餘', color: '#64748b', size: 'sm', flex: 2 },
              { type: 'text', text: `${balance >= 0 ? '+' : ''}${balance}`, color: balanceColor, weight: 'bold', size: 'md', flex: 3, align: 'end' },
            ],
          },
          { type: 'separator' },
          { type: 'text', text: '最近紀錄', color: '#94a3b8', size: 'xs' },
          ...recentLines,
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'button',
          action: { type: 'message', label: '新增記帳', text: '記帳' },
          style: 'secondary',
          height: 'sm',
        }],
      },
    },
  };
}

export const ledgerHandler: FeatureHandler = {
  name: 'ledger',
  async handle(event, _client) {
    if (!event.replyToken) return;
    if (event.message.type !== 'text') return;

    const text = event.message.text.trim();
    const userId = event.source?.userId ?? 'unknown';

    if (text === '帳單') {
      await handleSummary(event.replyToken, userId);
      return;
    }

    if (text === '記帳') {
      await lineClient.replyMessage({ replyToken: event.replyToken, messages: [ledgerMenuMessage()] });
      return;
    }

    const match = /^記帳\s+([+-]\d+)\s+(.+)$/.exec(text);
    if (!match) {
      await lineClient.replyMessage({ replyToken: event.replyToken, messages: [ledgerMenuMessage()] });
      return;
    }

    const amount = Number.parseInt(match[1], 10);
    const note = match[2];
    const entry: LedgerEntry = {
      userId,
      amount,
      note,
      type: amount >= 0 ? 'income' : 'expense',
      createdAt: Timestamp.now(),
    };

    await db.collection('ledger').add(entry);

    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [{
        type: 'text',
        text: `已記錄 ${amount > 0 ? '收入' : '支出'} ${Math.abs(amount)} 元：${note}`,
        quickReply: {
          items: [
            { type: 'action', action: { type: 'message', label: '繼續記帳', text: '記帳' } },
            { type: 'action', action: { type: 'message', label: '查帳單', text: '帳單' } },
          ],
        },
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
      messages: [{
        type: 'text',
        text: '本月尚無記帳紀錄',
        quickReply: {
          items: [{ type: 'action', action: { type: 'message', label: '開始記帳', text: '記帳' } }],
        },
      }],
    });
    return;
  }

  const entries = snap.docs.map(d => d.data() as LedgerEntry);
  const income = entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const expense = entries.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0);

  await lineClient.replyMessage({
    replyToken,
    messages: [summaryFlexMessage(income, expense, entries)],
  });
}
