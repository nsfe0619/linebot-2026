import type { FeatureHandler } from '../../types/feature';
import { lineClient } from '../../services/line-client';
import { messagingApi } from '@line/bot-sdk';
import axios from 'axios';

const COIN_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  DOGE: 'dogecoin',
};

interface CoinGeckoPrice {
  [id: string]: { usd: number; usd_24h_change: number; twd: number };
}

function coinMenuMessage(): messagingApi.TextMessage {
  return {
    type: 'text',
    text: '請選擇要查詢的幣種：',
    quickReply: {
      items: Object.keys(COIN_MAP).map(symbol => ({
        type: 'action' as const,
        action: { type: 'message' as const, label: symbol, text: `幣價 ${symbol}` },
      })),
    },
  };
}

function coinFlexMessage(symbol: string, usd: number, twd: number, change: number): messagingApi.FlexMessage {
  const arrow = change >= 0 ? '▲' : '▼';
  const changeColor = change >= 0 ? '#22c55e' : '#ef4444';
  return {
    type: 'flex',
    altText: `${symbol} $${usd.toLocaleString()}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1e293b',
        contents: [{
          type: 'text',
          text: `${symbol} 即時幣價`,
          color: '#f8fafc',
          weight: 'bold',
          size: 'lg',
        }],
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
              { type: 'text', text: '💵 USD', color: '#64748b', size: 'sm', flex: 2 },
              { type: 'text', text: `$${usd.toLocaleString()}`, weight: 'bold', size: 'sm', flex: 3, align: 'end' },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '🇹🇼 TWD', color: '#64748b', size: 'sm', flex: 2 },
              { type: 'text', text: `NT$${twd.toLocaleString()}`, weight: 'bold', size: 'sm', flex: 3, align: 'end' },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '24h 漲跌', color: '#64748b', size: 'sm', flex: 2 },
              { type: 'text', text: `${arrow} ${Math.abs(change).toFixed(2)}%`, color: changeColor, weight: 'bold', size: 'sm', flex: 3, align: 'end' },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'button',
          action: { type: 'message', label: '查詢其他幣種', text: '幣價' },
          style: 'secondary',
          height: 'sm',
        }],
      },
    },
  };
}

export const cryptoHandler: FeatureHandler = {
  name: 'crypto',
  async handle(event, _client) {
    if (!event.replyToken) return;
    if (event.message.type !== 'text') return;

    const parts = event.message.text.trim().split(/\s+/);
    const symbol = parts[1]?.toUpperCase();

    if (!symbol) {
      await lineClient.replyMessage({ replyToken: event.replyToken, messages: [coinMenuMessage()] });
      return;
    }

    const coinId = COIN_MAP[symbol];
    if (!coinId) {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ ...coinMenuMessage(), text: `不支援 ${symbol}，請選擇：` }],
      });
      return;
    }

    try {
      const res = await axios.get<CoinGeckoPrice>(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd,twd&include_24hr_change=true`,
        { timeout: 8000 }
      );
      const data = res.data[coinId];
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [coinFlexMessage(symbol, data.usd, data.twd, data.usd_24h_change)],
      });
    } catch {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '取得幣價失敗，請稍後再試' }],
      });
    }
  },
};
