import type { FeatureHandler } from '../../types/feature';
import { lineClient } from '../../services/line-client';
import { messagingApi } from '@line/bot-sdk';
import axios from 'axios';

const HOT_STOCKS = [
  { id: '2330', name: '台積電' },
  { id: '2317', name: '鴻海' },
  { id: '2454', name: '聯發科' },
  { id: '2308', name: '台達電' },
  { id: '0050', name: '元大台50' },
  { id: '2412', name: '中華電' },
];

interface TWSEResponse {
  stat: string;
  data: string[][];
  title: string;
}

function stockMenuMessage(): messagingApi.TextMessage {
  return {
    type: 'text',
    text: '請選擇或輸入股票代號（例：股價 2330）',
    quickReply: {
      items: HOT_STOCKS.map(s => ({
        type: 'action' as const,
        action: { type: 'message' as const, label: `${s.id} ${s.name}`, text: `股價 ${s.id}` },
      })),
    },
  };
}

function stockFlexMessage(id: string, name: string, date: string, close: string, change: string, open: string, high: string, low: string): messagingApi.FlexMessage {
  const isUp = !change.startsWith('-');
  const arrow = isUp ? '▲' : '▼';
  const changeColor = isUp ? '#22c55e' : '#ef4444';
  return {
    type: 'flex',
    altText: `${id} ${name} ${close}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1e293b',
        contents: [
          { type: 'text', text: `${id} ${name}`, color: '#f8fafc', weight: 'bold', size: 'lg' },
          { type: 'text', text: date, color: '#94a3b8', size: 'xs' },
        ],
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
              { type: 'text', text: '收盤價', color: '#64748b', size: 'sm', flex: 2 },
              { type: 'text', text: close, weight: 'bold', size: 'lg', flex: 3, align: 'end' },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '漲跌', color: '#64748b', size: 'sm', flex: 2 },
              { type: 'text', text: `${arrow} ${change.replace('-', '')}`, color: changeColor, weight: 'bold', size: 'sm', flex: 3, align: 'end' },
            ],
          },
          { type: 'separator' },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: `開 ${open}`, color: '#64748b', size: 'xs', flex: 1 },
              { type: 'text', text: `高 ${high}`, color: '#22c55e', size: 'xs', flex: 1, align: 'center' },
              { type: 'text', text: `低 ${low}`, color: '#ef4444', size: 'xs', flex: 1, align: 'end' },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'button',
          action: { type: 'message', label: '查詢其他股票', text: '股票' },
          style: 'secondary',
          height: 'sm',
        }],
      },
    },
  };
}

export const stockHandler: FeatureHandler = {
  name: 'stock',
  async handle(event, _client) {
    if (!event.replyToken) return;
    if (event.message.type !== 'text') return;

    const parts = event.message.text.trim().split(/\s+/);
    const stockId = parts[1];

    if (!stockId) {
      await lineClient.replyMessage({ replyToken: event.replyToken, messages: [stockMenuMessage()] });
      return;
    }

    try {
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const res = await axios.get<TWSEResponse>(
        `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${stockId}`,
        { timeout: 8000 }
      );

      if (res.data.stat !== 'OK' || !res.data.data?.length) {
        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: [{ ...stockMenuMessage(), text: `查無 ${stockId}，請重新選擇：` }],
        });
        return;
      }

      const latest = res.data.data[res.data.data.length - 1];
      const titleMatch = res.data.title.match(/\s(\S+)\s/);
      const name = titleMatch?.[1] ?? stockId;

      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [stockFlexMessage(stockId, name, latest[0], latest[6], latest[7], latest[3], latest[4], latest[5])],
      });
    } catch {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '取得股價失敗，請稍後再試' }],
      });
    }
  },
};
