import { fetchRssFeeds, summarizeWithGemini, sendToNotion, sendToDiscord } from './index.js';

const themes = [
    "月曜: 6か月以内の市場変化をわかりやすく整理",
    "火曜: 勝ち筋になる事業機会を具体化",
    "水曜: 日本市場、日本企業、日本の働き方への影響",
    "木曜: 生活とウェルビーイングへの影響（可処分時間、ストレス、孤独、不安、学び方、休み方、ウェルビーイング市場で伸びるサービス）",
    "金曜: 普通じゃない働き方、生き方、人生の選択肢（個人の自由度向上、会社員以外の選択肢の現実化、地方、海外、1人事業、半隠居、複業、どう生きるかへの接続）",
    "土曜: 今のうちに仕込むべき行動（今週試すべきツール、学ぶべきスキル、見るべき企業や市場、個人として持つべき小さなポジション、半年後に人生が少し面白くなる種まき）",
    "日曜: 長期構造変化と人生設計"
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runWeeklyTest() {
  console.log('📰 共通のRSSフィードを1回だけ取得します...');
  const feeds = await fetchRssFeeds();
  if (feeds.length === 0) {
    console.log('ニュースが取得できませんでした。');
    return;
  }

  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i];
    console.log("\n=========================================");
    console.log(`■ テスト実行: ${theme} のテーマで生成`);
    console.log("=========================================");
    
    try {
      const data = await summarizeWithGemini(feeds, theme);
      if (data) {
        const notionUrl = await sendToNotion(data);
        await sendToDiscord(data, notionUrl);
      }
      // レートリミット回避のために60秒待機
      console.log('⏳ 次の曜日の生成まで60秒待機します...');
      await sleep(60000);
    } catch (e) {
      console.error(`⚠️ ${theme} の処理中にエラー発生: `, e.message);
    }
  }
  
  console.log('\n✅ 1週間分のテスト生成すべて完了しました！');
}

runWeeklyTest().catch(console.error);
