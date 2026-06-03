import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Settings } from '../types/models';

const app = getApps().length === 0 ? initializeApp() : getApp();
export const db = getFirestore(app);

export const DEFAULT_SETTINGS: Settings = {
  defaultReply: '我聽不懂 QQ',
  ttlEnabled: false,
  ttlDays: 90,
};

export async function seedSettings(): Promise<void> {
  const ref = db.collection('settings').doc('global');
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(DEFAULT_SETTINGS);
    console.log('[firestore] /settings/global seeded with defaults');
  }
}

export async function seedKeywordRule(rule: {
  keyword: string;
  matchType: 'exact' | 'contains';
  feature: string;
  enabled: boolean;
}): Promise<void> {
  const snap = await db
    .collection('keywordRules')
    .where('keyword', '==', rule.keyword)
    .limit(1)
    .get();
  if (snap.empty) {
    await db.collection('keywordRules').add({
      ...rule,
      createdAt: new Date(),
    });
    console.log(`[firestore] seeded keywordRule: ${rule.keyword}`);
  }
}
