import axios from 'axios';
import * as cheerio from 'cheerio';

const PTT_BASE = 'https://www.ptt.cc';
const BOARD_URL = `${PTT_BASE}/bbs/Beauty/index.html`;
const OVER18_COOKIE = 'over18=1';
const IMGUR_REGEX = /https?:\/\/i\.imgur\.com\/\S+\.(?:jpg|jpeg|png|gif)/gi;

let lastRequestTime = 0;

async function throttledGet(url: string): Promise<string> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1000) {
    await new Promise(r => setTimeout(r, 1000 - elapsed));
  }
  lastRequestTime = Date.now();
  const res = await axios.get<string>(url, {
    headers: {
      Cookie: OVER18_COOKIE,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      'Referer': 'https://www.ptt.cc/bbs/Beauty/index.html',
    },
    timeout: 10000,
  });
  return res.data;
}

async function getBeautyPosts(): Promise<string[]> {
  const html = await throttledGet(BOARD_URL);
  const $ = cheerio.load(html);
  const links: string[] = [];
  $('div.r-ent').each((_i, el) => {
    const href = $(el).find('div.title a').attr('href');
    if (href) links.push(`${PTT_BASE}${href}`);
  });
  return links;
}

async function getImagesFromPost(url: string): Promise<string[]> {
  const html = await throttledGet(url);
  const matches = html.match(IMGUR_REGEX);
  return matches ? [...new Set(matches)] : [];
}

export interface BeautyResult {
  imageUrl: string;
  postUrl: string;
}

export async function findBeauty(): Promise<BeautyResult | null> {
  const posts = await getBeautyPosts();
  if (posts.length === 0) return null;

  const shuffled = [...posts].sort(() => Math.random() - 0.5);

  for (const postUrl of shuffled) {
    const images = await getImagesFromPost(postUrl);
    if (images.length > 0) {
      const imageUrl = images[Math.floor(Math.random() * images.length)];
      return { imageUrl, postUrl };
    }
  }

  return null;
}
