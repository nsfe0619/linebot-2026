import type { FeatureHandler } from '../../types/feature';
import { lineClient } from '../../services/line-client';
import axios from 'axios';

const COIN_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  ADA: 'cardano',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  MATIC: 'matic-network',
};

interface CoinGeckoPrice {
  [id: string]: {
    usd: number;
    usd_24h_change: number;
    twd: number;
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
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '請輸入幣種，例如：幣價 BTC' }],
      });
      return;
    }

    const coinId = COIN_MAP[symbol];
    if (!coinId) {
      const supported = Object.keys(COIN_MAP).join('、');
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `不支援 ${symbol}，目前支援：${supported}` }],
      });
      return;
    }

    try {
      const res = await axios.get<CoinGeckoPrice>(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd,twd&include_24hr_change=true`,
        { timeout: 8000 }
      );
      const data = res.data[coinId];
      const change = data.usd_24h_change.toFixed(2);
      const arrow = data.usd_24h_change >= 0 ? '▲' : '▼';
      const text =
        `${symbol} 即時幣價\n` +
        `💵 USD：$${data.usd.toLocaleString()}\n` +
        `🇹🇼 TWD：NT$${data.twd.toLocaleString()}\n` +
        `24h：${arrow} ${change}%`;

      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text }],
      });
    } catch {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '取得幣價失敗，請稍後再試' }],
      });
    }
  },
};
