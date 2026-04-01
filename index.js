import { GoogleGenerativeAI } from '@google/generative-ai';
import Parser from 'rss-parser';
import axios from 'axios';
import dotenv from 'dotenv';
import { Client } from '@notionhq/client';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const parser = new Parser();

// 毎日ランダム性を持たせるため、情報ソースを複数定義
const RSS_SOURCES = [
  'https://news.google.com/rss/search?q=AI+technology+business&hl=ja&gl=JP&ceid=JP:ja', 
  'https://news.google.com/rss/search?q=Economy+business&hl=ja&gl=JP&ceid=JP:ja', 
  'https://export.arxiv.org/rss/cs.AI', 
  'https://japan.cnet.com/rss/index.rdf',
];

async function fetchRssFeeds() {
  console.log('📰 RSSフィードから最新ニュースを取得中...');
  let combinedNews = '';
  
  for (const url of RSS_SOURCES) {
    try {
      const feed = await parser.parseURL(url);
      const topItems = feed.items.slice(0, 5);
      topItems.forEach(item => {
        combinedNews += `\n題名: ${item.title}\nリンク: ${item.link}\n本文概要: ${item.contentSnippet?.slice(0, 150) || ''}\n---`;
      });
    } catch (e) {
      console.log(`⚠️ URL取得エラー (${url}): ${e.message}`);
    }
  }
  return combinedNews;
}

async function summarizeWithGemini(newsText) {
  console.log('🤖 Gemini APIでニュースを分析・要約中...');
  const modelsToTry = [
    'gemini-2.5-flash',
    'gemini-flash-latest'
  ];

  const prompt = `
あなたは、海外のAI・ビジネス・未来予測に関する高信頼情報を収集し、単なる要約ではなく、
「今、何が起きていて、それが何を意味し、事業・発信・ポジション取りにどう影響するか」まで解釈する、超優秀な戦略リサーチャーです。

目的は、「世界の最先端情報を、日本語で、短く、構造的に整理すること」です。

## 最重要ルール
- 常に現在日時を基準にして最新の情報を取得してください。
- 出力フォーマットは必ず以下のJSON形式にしてください。Markdownの\`\`\`json等の記号は不要で、JSONオブジェクトのみを出力してください。

{
  "articles": [
    {
      "category": "カテゴリ",
      "title": "惹きつけられるタイトル",
      "what_happened": "何が起きたか",
      "info_type": "一次情報 / 二次情報",
      "reliability": "高 / 中 / 低",
      "why_important": "なぜ重要か",
      "future_changes": "今後起きうる変化",
      "ai_interpretation": "AIとしての解釈",
      "business_implication": "事業への示唆",
      "sns_implication": "SNS発信への示唆",
      "japan_context": "日本市場での意味",
      "growing_area": "伸びる領域",
      "declining_area": "衰退リスク領域",
      "watch_points": "見るべき点",
      "source_name": "情報源",
      "link": "URL"
    }
  ],
  "summary": {
    "most_important": "今日いちばん重要な変化",
    "structural_change": "今日の情報から見える構造変化",
    "themes_to_watch": "今後ウォッチすべきテーマ",
    "sns_themes": "SNSで有望なテーマ",
    "business_opportunities": "有望な事業領域",
    "declining_risks": "弱くなる領域",
    "info_gap": "日本での情報格差"
  }
}

ニュースデータ:
${newsText.slice(0, 25000)}
`;

  let responseText = null;
  for (const modelName of modelsToTry) {
    try {
      console.log(`⏳ モデル ${modelName} で試行中...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      responseText = result.response.text();
      console.log(`✅ モデル ${modelName} で生成成功！`);
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
    throw new Error('Gemini出力エラー');
  }
}

// ======= Notionへの送信機能（ユーザー負担極限カット版：ページ追記型） =======
async function sendToNotion(data) {
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_PARENT_PAGE_ID) {
    console.log('⚠️ Notionの設定（URL等）がまだ無いので、Notion連携をスキップします。');
    return null;
  }

  console.log('📝 Notionへ「本日の美しいレポートページ」を自動生成中...');
  const notion = new Client({ auth: process.env.NOTION_API_KEY });

  let parentPageId = process.env.NOTION_PARENT_PAGE_ID;
  const match = parentPageId.match(/([a-f0-9]{32})(?:\?|$)/);
  if (match) {
    parentPageId = match[1];
  }

  const childrenBlocks = [];
  
  childrenBlocks.push({
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: "💡 本日の戦略的サマリー" } }] }
  });
  childrenBlocks.push({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: data.summary.most_important + '\\n' + data.summary.structural_change } }] }
  });
  childrenBlocks.push({ object: 'block', type: 'divider', divider: {} });

  for (const article of data.articles) {
    childrenBlocks.push({
      object: 'block',
      type: 'heading_3',
      heading_3: { rich_text: [{ type: 'text', text: { content: `【${article.category}】 ${article.title}`, link: article.link ? { url: String(article.link) } : null } }] }
    });
    
    childrenBlocks.push({
      object: 'block',
      type: 'callout',
      callout: { icon: { type: "emoji", emoji: "📰" }, rich_text: [{ type: 'text', text: { content: "何が起きたか:\\n" + article.what_happened } }] }
    });
    childrenBlocks.push({
      object: 'block',
      type: 'callout',
      callout: { icon: { type: "emoji", emoji: "🔥" }, rich_text: [{ type: 'text', text: { content: "なぜ重要か（構造変化）:\\n" + article.why_important } }] }
    });
    childrenBlocks.push({
      object: 'block',
      type: 'callout',
      callout: { icon: { type: "emoji", emoji: "💼" }, rich_text: [{ type: 'text', text: { content: "事業・SNS・ポジションへの示唆:\\n" + article.business_implication + '\\n' + article.sns_implication } }] }
    });
    childrenBlocks.push({ object: 'block', type: 'divider', divider: {} });
  }

  const todayStr = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const pageTitle = `🚀 戦略レポート: ${todayStr}`;

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
    console.error('⚠️ Notionの書き込みに失敗しました:', error.body || error.message);
    return null;
  }
}

// ======= Discord送信（シンプル最新版: サマリー＋Notionリンク） =======
async function sendToDiscord(data, notionUrl) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  console.log('🚀 Discordへサマリー通知を投稿中...');

  let descriptionText = `**💡 今日いちばん重要な変化**\\n${data.summary.most_important}\\n\\n`;
  descriptionText += `**📰 ピックアップニュース (${data.articles.length}件)**\\n`;
  for (const a of data.articles) {
    descriptionText += `・ [${a.title}](${a.link || 'https://news.google.com'})\\n`;
  }
  
  if (notionUrl) {
    descriptionText += `\\n\\n📖 **[👉 リサーチの全編（詳細な考察とSNSネタ）をNotionで読む！](${notionUrl})**`;
  } else {
    descriptionText += `\\n\\n⚠️ *Notionの全編レポートは設定不足のためお休みです*`;
  }

  const message = {
    username: "戦略リサーチャーAI",
    content: "🌅 おはようございます！本日の最先端情報の戦略的解釈をお届けします📰",
    embeds: [{
      title: "🚀 世界の最先端ニュースと構造変化",
      color: 0xffd700,
      description: descriptionText,
      footer: { text: "Strategic AI Researcher Bot" }
    }]
  };

  try {
    const res = await axios.post(webhookUrl, message);
    console.log('✅ Discord投稿成功！');
  } catch (err) {
    console.error('⚠️ Discord Webhookエラー:', err.message);
  }
}

async function main() {
  const feeds = await fetchRssFeeds();
  if (feeds.length === 0) return;

  const data = await summarizeWithGemini(feeds);
  if (data) {
    const notionUrl = await sendToNotion(data);
    await sendToDiscord(data, notionUrl);
  }
}

main().catch(console.error);
