import type { FeatureHandler } from '../../types/feature';
import { lineClient } from '../../services/line-client';
import { messagingApi } from '@line/bot-sdk';

const PERSONAL_FEATURES = [
  { label: '幣價', text: '幣價', desc: '查加密貨幣價格' },
  { label: '股票', text: '股票', desc: '查台股行情' },
  { label: '記帳', text: '記帳', desc: '記錄收支' },
  { label: '帳單', text: '帳單', desc: '查本月帳單' },
];

const GROUP_FEATURES = [
  { label: '幣價 BTC', text: '幣價 BTC', desc: '查比特幣' },
  { label: '幣價 ETH', text: '幣價 ETH', desc: '查以太幣' },
  { label: '股價 2330', text: '股價 2330', desc: '查台積電' },
  { label: '記帳 -100 午餐', text: '記帳 -100 午餐', desc: '記支出' },
  { label: '帳單', text: '帳單', desc: '查帳單' },
];

function personalHelpMessage(): messagingApi.FlexMessage {
  return {
    type: 'flex',
    altText: '我會做這些事',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1e293b',
        contents: [
          { type: 'text', text: '我會做這些事 👋', color: '#f8fafc', weight: 'bold', size: 'lg' },
          { type: 'text', text: '點按鈕直接使用', color: '#94a3b8', size: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: PERSONAL_FEATURES.map(f => ({
          type: 'box' as const,
          layout: 'horizontal' as const,
          contents: [
            { type: 'text' as const, text: f.desc, color: '#475569', size: 'sm' as const, flex: 3 },
            {
              type: 'button' as const,
              action: { type: 'message' as const, label: f.label, text: f.text },
              style: 'secondary' as const,
              height: 'sm' as const,
              flex: 2,
            },
          ],
        })),
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: '💬 個人聊天模式', color: '#94a3b8', size: 'xs', align: 'center' }],
      },
    },
  };
}

function groupHelpMessage(): messagingApi.FlexMessage {
  return {
    type: 'flex',
    altText: '我會做這些事',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1e293b',
        contents: [
          { type: 'text', text: '我會做這些事 👋', color: '#f8fafc', weight: 'bold', size: 'lg' },
          { type: 'text', text: '群組中請輸入完整指令', color: '#94a3b8', size: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          ...GROUP_FEATURES.map(f => ({
            type: 'box' as const,
            layout: 'horizontal' as const,
            contents: [
              { type: 'text' as const, text: f.desc, color: '#475569', size: 'sm' as const, flex: 3 },
              { type: 'text' as const, text: f.text, color: '#0f172a', size: 'sm' as const, weight: 'bold' as const, flex: 3, align: 'end' as const },
            ],
          })),
          { type: 'separator' as const },
          {
            type: 'text' as const,
            text: '範例：幣價 BTC、股價 2454、記帳 -200 晚餐',
            color: '#94a3b8',
            size: 'xs' as const,
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: '👥 群組模式（Quick Reply 不支援）', color: '#94a3b8', size: 'xs', align: 'center' }],
      },
    },
  };
}

export const helpHandler: FeatureHandler = {
  name: 'help',
  async handle(event, _client) {
    if (!event.replyToken) return;

    const sourceType = event.source?.type;
    const isGroup = sourceType === 'group' || sourceType === 'room';

    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [isGroup ? groupHelpMessage() : personalHelpMessage()],
    });
  },
};
