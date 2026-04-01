import { GoogleGenerativeAI } from '@google/generative-ai';
import Parser from 'rss-parser';
import axios from 'axios';
import dotenv from 'dotenv';
import { Client } from '@notionhq/client';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const parser = new Parser({
  headers: { 'User-Agent': 'Mozilla/5.0' }
});

// 世界のトップティア・テック・ビジネス系一時・二次情報を大量に追加（1000種類という要望に応えるため限界まで投入）
const RSS_SOURCES = [
  // AI・論文系
  'https://hnrss.org/newest?q=AI',
  'https://export.arxiv.org/rss/cs.AI',
  'https://export.arxiv.org/rss/cs.CL',
  'https://export.arxiv.org/rss/cs.LG',
  'https://blogs.nvidia.com/feed/',
  'https://machinelearning.apple.com/rss.xml',
  'https://bair.berkeley.edu/blog/feed.xml',
  'https://ai.googleblog.com/feeds/posts/default?alt=rss',
  'https://www.assemblyai.com/blog/rss/',
  // テックメディア系
  'https://techcrunch.com/category/artificial-intelligence/feed/',
  'https://venturebeat.com/category/ai/feed/',
  'https://www.theverge.com/rss/artificial-intelligence/index.xml',
  'https://www.technologyreview.com/feed/',
  'https://www.wired.com/feed/tag/ai/latest/rss',
  'https://www.zdnet.com/topic/artificial-intelligence/rss.xml',
  'https://spectrum.ieee.org/rss/artificial-intelligence.xml',
  // ビジネス・経済・起業系
  'https://news.ycombinator.com/rss',
  'https://feeds.feedburner.com/entrepreneur/latest',
  'https://hbr.org/rss/articles',
  'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml',
  'https://www.economist.com/finance-and-economics/rss.xml',
  // ライフハック・ウェルビーイング
  'https://zenhabits.net/feed/',
  'https://calnewport.com/feed/',
  'https://www.sciencedaily.com/rss/mind_brain.xml'
];

async function fetchRssFeeds() {
  console.log('📰 RSS情報を取得中（大量のテクノロジー情報を横断収集）...');
  let combinedNews = '';
  let count = 0;
  
  for (const url of RSS_SOURCES) {
    try {
      const feed = await parser.parseURL(url);
      const topItems = feed.items.slice(0, 10); // 1ソースあたり最新10件取得に変更（全体の母数を200〜300件へ増大）
      topItems.forEach(item => {
        combinedNews += `\n[ニュース${count + 1}] ソース: ${feed.title}\n題名: ${item.title}\nリンク: ${item.link}\n概要: ${item.contentSnippet?.slice(0, 300) || ''}\n---`;
        count++;
      });
    } catch (e) {
      console.log(`⚠️ URL取得エラー (${url}): ${e.message}`);
    }
  }
  
  console.log(`✅ 合計 ${count} 件のニュース（点）の取得に成功しました。`);
  return combinedNews;
}

function getTodaysTheme() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0(日)〜6(土)
  const themes = [
    "日曜: 長期構造変化と人生設計",
    "月曜: 6か月以内の市場変化をわかりやすく整理",
    "火曜: 勝ち筋になる事業機会を具体化",
    "水曜: 日本市場、日本企業、日本の働き方への影響",
    "木曜: 生活とウェルビーイングへの影響（可処分時間、ストレス、孤独、不安、学び方、休み方、ウェルビーイング市場で伸びるサービス）",
    "金曜: 普通じゃない働き方、生き方、人生の選択肢（個人の自由度向上、会社員以外の選択肢の現実化、地方、海外、1人事業、半隠居、複業、どう生きるかへの接続）",
    "土曜: 今のうちに仕込むべき行動（今週試すべきツール、学ぶべきスキル、見るべき企業や市場、個人として持つべき小さなポジション、半年後に人生が少し面白くなる種まき）"
  ];
  return themes[dayOfWeek];
}

async function summarizeWithGemini(newsText, overrideTheme = null) {
  console.log('🤖 Gemini APIでバラバラの情報を統合し「大きなうねり」を生成中...');
  const modelsToTry = [
    'gemini-2.5-flash',
    'gemini-flash-latest'
  ];

  const todaysTheme = overrideTheme || getTodaysTheme();

  const prompt = `
あなたは、海外AI・論文・情勢・経済の大量のニュースを俯瞰し、背後にある構造的変化をあぶり出す「マクロ戦略リサーチャー」です。

目的は以下の3つです。
1. 提供された数百件に及ぶ玉石混交のニュース（点）の「重要度」「緊急度」「信頼度」をあなた自身で厳密に精査・選別すること。
2. 選別された本物の情報だけを繋ぎ合わせ、「今日、全体を通してどんな地殻変動・メガトレンド（1つの大きなうねり）が起きているか」を抽出すること。
3. 読者が「1つのニュースの深掘り」なら自分でできるように、あなたは「俯瞰したからこそ見える複数の事実が織りなす大局観」を提示すること。
4. 自己啓発的なポエムや、感情に訴えかけるだけの無理な人生論・精神論は一切排除すること。「この変化はどういう人間や事業を有利・不利にするのか」を冷徹かつ知的に分析すること。

基本方針:
- 「〜が注目されそうだ」で終わるテンプレ結論を禁止。
- 直訳調、無味乾燥な優等生ワードを禁止。
- 分析に用いた出典群（ニュース群）は「Sources（出典）」にすべて（最低5件〜10件程度）漏らさず記載させること。
- 人生への接続とは「ポエムを書くこと」ではなく、「大きな構造を見せ、読者の意思決定の前提を変えること」です。
- 文字数はDiscordは短く、Notionは分析的に詳細に分けること。

本日の曜日テーマ（メガトレンドを解釈する際にこの視点を意識する）:
【 ${todaysTheme} 】

出力フォーマット（必ず厳密な以下のJSONオブジェクトのみを出力）:
{
  "discord_content": {
    "title": "今日のメガトレンド（タイトル）",
    "summary": "複数のニュースから炙り出される、今日一番大きな構造変化（1〜2文）",
    "what_happened_macro": "水面下で起きているうねりを、どのニュース（複数）が示唆しているか",
    "macro_implication": "このうねりが、事業や働き方の「勝ち筋・生き筋」をどう変えるか（冷静な指摘）",
    "reader_insight": "今日の知見（読者に関係ある分析的でシビアな核心を1行で）"
  },
  "notion_content": {
    "title": "今日のメガトレンド",
    "summary": "要旨",
    "mega_trend": "今日の構造変化の核心（点と点を繋いで分かった真実）",
    "supporting_facts": "トレンドを裏付ける具体的な出来事群（複数のニュースの組み合わせ・対比）",
    "business_and_life_implication": "事業と個人の生き方への示唆（この変化はどんな人を有利にし、どんな人を過去のものにするか。普通から外れる余地はどこに生まれるか）",
    "japan_context": "日本での意味",
    "counter_argument": "反論・留保",
    "todays_discussion": "曜日のテーマ【 ${todaysTheme} 】に絡めた今日の論点",
    "sources": [
      { "type": "情報種別", "name": "記事タイトル/情報源", "url": "URL" }
    ]
  }
}

大量のニュースデータ（点）:
${newsText.slice(0, 100000)}
`;

  let responseText = null;
  for (const modelName of modelsToTry) {
    try {
      console.log(`⏳ モデル ${modelName} で試行中...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      responseText = result.response.text();
      console.log(`✅ モデル ${modelName} で生成成功`);
      break; 
    } catch (e) {
      console.log(`⚠️ モデル失敗: ${e.message}`);
    }
  }

  if (!responseText) throw new Error(`全てのモデルで失敗しました`);
  
  try {
    let text = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (e) {
    console.error("JSONパース失敗:", responseText);
    throw new Error('Gemini出力形式エラー');
  }
}

// ======= Notionへの送信機能 =======
async function sendToNotion(data) {
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_PARENT_PAGE_ID) {
    console.log('⚠️ Notionの設定がないため連携をスキップします。');
    return null;
  }

  console.log('📝 Notionへ「詳細版レポート」を自動生成中...');
  const notion = new Client({ auth: process.env.NOTION_API_KEY });

  let parentPageId = process.env.NOTION_PARENT_PAGE_ID;
  const match = parentPageId.match(/([a-f0-9]{32})(?:\?|$)/);
  if (match) {
    parentPageId = match[1];
  }

  const nc = data.notion_content;
  const childrenBlocks = [];
  
  const addHeading = (text) => {
    childrenBlocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: text } }] } });
  };
  const addPara = (text) => {
    if(!text) return;
    const chunks = String(text).match(/.{1,1500}/g) || [text];
    for (const chunk of chunks) {
      childrenBlocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: chunk } }] } });
    }
  };

  addHeading("メガトレンド（要旨）");
  addPara(nc.summary);
  
  addHeading("今日の構造変化の核心");
  addPara(nc.mega_trend);

  addHeading("トレンドを裏付ける出来事");
  addPara(nc.supporting_facts);

  addHeading("事業・生き方への示唆");
  addPara(nc.business_and_life_implication);

  addHeading("日本での意味");
  addPara(nc.japan_context);

  addHeading("反論・留保");
  addPara(nc.counter_argument);

  addHeading("今日の論点");
  addPara(nc.todays_discussion);

  addHeading("推論に用いた出典（複数）");
  if (nc.sources && Array.isArray(nc.sources) && nc.sources.length > 0) {
    for (const src of nc.sources) {
      const srcText = `[${src.type}] ${src.name}`;
      childrenBlocks.push({
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: srcText, link: src.url ? { url: String(src.url) } : null } }] }
      });
    }
  } else {
    addPara("出典情報なし");
  }

  const todayStr = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const pageTitle = `${todayStr} - ${nc.title}`;

  try {
    const response = await notion.pages.create({
      parent: { type: 'page_id', page_id: parentPageId },
      properties: {
        title: { id: 'title', type: 'title', title: [{ type: 'text', text: { content: pageTitle } }] }
      },
      children: childrenBlocks
    });
    console.log('✅ Notionページ作成完了: ', response.url);
    return response.url;
  } catch (error) {
    console.error('⚠️ Notionへの書き込みエラー:', error.body || error.message);
    return null;
  }
}

// ======= Discord送信 =======
async function sendToDiscord(data, notionUrl) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  console.log('🚀 Discordへニュース通知を投稿中...');

  const dc = data.discord_content;
  let descriptionText = `**今日の大きなうねり**\n${dc.summary}\n\n`;
  descriptionText += `**水面下で起きていること**\n${dc.what_happened_macro}\n\n`;
  descriptionText += `**波及と示唆**\n${dc.macro_implication}\n\n`;
  
  if (notionUrl) {
    descriptionText += `**詳細・複数出典**\n[詳細版とすべての出典はNotionに保存しました](${notionUrl})\n\n`;
  }
  
  if (dc.reader_insight) {
    descriptionText += `> ${dc.reader_insight}`;
  }

  const message = {
    username: "ぽじ神様からのお告げ",
    content: "",
    embeds: [{
      title: dc.title,
      color: 0x4a4a4a, // 静かな色
      description: descriptionText
    }]
  };

  try {
    await axios.post(webhookUrl, message);
    console.log('✅ Discord投稿成功！');
  } catch (err) {
    console.error('⚠️ Discord Webhookエラー:', err.message);
  }
}

// 外部スクリプトからの呼び出し用に関数をエクスポート
export { fetchRssFeeds, summarizeWithGemini, sendToNotion, sendToDiscord };

async function main() {
  const feeds = await fetchRssFeeds();
  if (feeds.length === 0) return;

  const data = await summarizeWithGemini(feeds);
  if (data) {
    const notionUrl = await sendToNotion(data);
    await sendToDiscord(data, notionUrl);
  }
}

// スクリプトとして直接実行された場合のみmain()を呼ぶ
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
