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

// 世界のトップティアが追う一次情報・大元に近いソースに厳選
const RSS_SOURCES = [
  'https://hnrss.org/newest?q=AI',
  'https://export.arxiv.org/rss/cs.AI',
  'https://export.arxiv.org/rss/cs.CL',
  'https://export.arxiv.org/rss/cs.LG',
];

async function fetchRssFeeds() {
  console.log('📰 RSS情報を取得中...');
  let combinedNews = '';
  
  for (const url of RSS_SOURCES) {
    try {
      const feed = await parser.parseURL(url);
      const topItems = feed.items.slice(0, 5);
      topItems.forEach(item => {
        combinedNews += `\nソース: ${feed.title}\n題名: ${item.title}\nリンク: ${item.link}\n本文概要: ${item.contentSnippet?.slice(0, 300) || ''}\n---`;
      });
    } catch (e) {
      console.log(`⚠️ URL取得エラー (${url}): ${e.message}`);
    }
  }
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
  console.log('🤖 Gemini APIで静かで知的な編集者のブリーフを生成中...');
  const modelsToTry = [
    'gemini-2.5-flash',
    'gemini-flash-latest'
  ];

  const todaysTheme = overrideTheme || getTodaysTheme();

  const prompt = `
あなたは、海外AI・論文・情勢・経済を毎日収集し、朝に読むための「知的で静かなブリーフを作る編集者」です。

目的は3つです。
1. 毎朝、短時間で世界の重要変化を把握できること
2. 単なるニュース要約ではなく「この変化が人の生き方をどう変えるか」まで踏み込むこと
3. ウェルビーイングと「普通と違った面白い人生」に資する視点を必ず提示すること

基本方針:
- 正しいだけの優等生な文章を禁じます。読者の「欲望・不安・希望」に接続してください。
- 読後に「これ、自分にも関係あるな」「今日を少し変えたくなる」という感覚を残すこと。
- Discord（短文）とNotion（長文）は文章を使い分け、同じ意味の繰り返しを避けてください。
- 「注目されそうだ」「重要になりそうだ」で終わる雑なテンプレ予測を徹底排除。
- 絵文字は一切使わないでください。
- 煽りすぎず、ポエムすぎず、冷静で知的であるが、人間の血が通った「核心を突いてくる」温度感にしてください。

重要度の判断基準・観点（"人生の解像度が上がる" 視点として以下を常に問うこと）:
- このトピックは、結局どんな人間を有利にし、どんな働き方を古くするか？
- この変化で、普通の人生から少し外れる余地（自由、一人事業、半隠居）がどこに生まれるか？
- お金だけでなく、時間、孤独、安心、好奇心にどう影響するか？

本日の曜日テーマ（これに必ず沿って重点を置くこと）:
【 ${todaysTheme} 】

出力フォーマット（必ず厳密な以下のJSONオブジェクトのみを出力）:
{
  "discord_content": {
    "title": "タイトル",
    "summary": "一言で要点",
    "what_happened": "何が起きたか（短く事実のみ）",
    "why_important": "なぜ重要か（意味を簡潔に）",
    "implication": "事業や生活への波及",
    "reader_insight": "今日の読みどころ（この変化は結局どういう人生を可能にし、誰を有利・不利にするのか。読者に関係ある核心を1〜2行で静かに突く）"
  },
  "notion_content": {
    "title": "タイトル",
    "summary": "要旨",
    "what_happened": "何が起きたか",
    "background": "背景",
    "why_important": "なぜ重要か",
    "business_implication": "事業・市場への示唆",
    "life_implication": "人生への示唆（どんな人に追い風か、どんな人を置いていくか。自由度、可処分時間、働き方、幸福度、普通ではない選択肢への波及。読者が主体者になる一節を入れること）",
    "japan_context": "日本での意味",
    "counter_argument": "反論・留保",
    "todays_discussion": "今日の論点（今日の【 ${todaysTheme} 】テーマに必ず絡めて、深く静かな考察を記載）",
    "sources": [
      { "type": "一次情報", "name": "情報源名", "url": "URL" }
    ]
  }
}

ニュースデータ:
${newsText.slice(0, 15000)}
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

  addHeading("要旨");
  addPara(nc.summary);
  
  addHeading("何が起きたか");
  addPara(nc.what_happened);

  addHeading("背景");
  addPara(nc.background);

  addHeading("なぜ重要か");
  addPara(nc.why_important);

  addHeading("事業・市場への示唆");
  addPara(nc.business_implication);

  addHeading("人生への示唆");
  addPara(nc.life_implication);

  addHeading("日本での意味");
  addPara(nc.japan_context);

  addHeading("反論・留保");
  addPara(nc.counter_argument);

  addHeading("今日の論点");
  addPara(nc.todays_discussion);

  addHeading("出典");
  if (nc.sources && nc.sources.length > 0) {
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
  let descriptionText = `**要点**\n${dc.summary}\n\n`;
  descriptionText += `**何が起きたか**\n${dc.what_happened}\n\n`;
  descriptionText += `**なぜ重要か**\n${dc.why_important}\n\n`;
  descriptionText += `**波及**\n${dc.implication}\n\n`;
  
  if (notionUrl) {
    descriptionText += `**詳細**\n[詳細版と出典はNotionに保存しました](${notionUrl})\n\n`;
  }
  
  // 今日の読みどころ（核心）をメッセージの最後に配置してスパイスを効かせる
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
