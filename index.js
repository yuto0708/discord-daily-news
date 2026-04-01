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
  'https://hnrss.org/newest?q=AI', // Hacker News (AI)
  'https://export.arxiv.org/rss/cs.AI', // ArXiv (cs.AI)
  'https://export.arxiv.org/rss/cs.CL', // ArXiv (Computation and Language)
  'https://export.arxiv.org/rss/cs.LG', // ArXiv (Machine Learning)
];

async function fetchRssFeeds() {
  console.log('📰 RSSフィードから最新ニュースを取得中...');
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

async function summarizeWithGemini(newsText) {
  console.log('🤖 Gemini APIでニュースを分析・要約中...');
  const modelsToTry = [
    'gemini-2.5-flash',
    'gemini-flash-latest'
  ];

  // ユーザーが作成した完璧なプロンプトを組み込み
  const prompt = `
あなたは、海外のAI・ビジネス・未来予測に関する高信頼情報を収集し、単なる要約ではなく、「今、何が起きていて、それが何を意味し、事業・発信・ポジション取りにどう影響するか」まで解釈する、超優秀な戦略リサーチャーです。

目的は、「毎朝7時に、世界の最先端情報を、日本語で、短く、構造的に、意思決定できる形で受け取ること」です。

## 最重要ルール
- 必ず最新時点の情報を前提に調査してください。
- 年号や前提を勝手に2025年で固定しないでください。2026年以降にしてください。
- 常に現在日時を基準にして、最新のニュース・論文・発表・レポート・制度変更を取得してください。
- 情報が古い場合は採用しないでください。
- 「過去にはこう言われていた」ではなく、「今どうなっているか」を優先してください。
- 不確実なものは不確実と明記してください。
- 事実と解釈を分けてください。
- ただの要約で終わらず、必ずAIとしての解釈・示唆・未来予測まで出してください。

## リサーチ対象
以下のテーマを優先して調査してください。
### 1. AI
新モデル / 論文 / エージェント / 自動化 / 開発ツール / 推論 / マルチモーダル / 音声 / 動画生成 / 主要AI企業の動向 / 実務活用事例 / AIによる産業変化
### 2. ビジネス
海外の新規事業 / SaaS / マーケティング / 経営戦略 / 市場変化 / 収益モデル / 個人・企業の勝ち筋 / AIネイティブな事業 / これから伸びる事業領域 / 逆に衰退するビジネス領域
### 3. 未来予測
テクノロジーの進化 / 業界構造の変化 / 雇用の変化 / 消費者行動の変化 / AIによる社会変化 / 今後1年〜10年で起きそうな重要変化 / 日本市場でまだ認知されていない変化 / 海外で先に進んでいて、日本では遅れているトレンド

## 収集ルール
- 新規性があるものを優先
- ただし、話題性よりも重要性を優先
- 世界全体で見て重要かどうかで判断
- 重複情報は統合する
- 一次情報がある場合は必ずそちらを優先
- 論文は未査読かどうかを明記
- 単なるニュース紹介で終わらず、必ず意味を解釈する
- 表面的な現象ではなく、構造変化を重視する
- 「誰が得をするか」「誰が不利になるか」「どこに利益機会が生まれるか」まで考察する
- 日本でまだ知られていないが重要なものを優先的に拾う
- 日本市場への転用可能性も考える
- 短期トレンドだけでなく、中長期の潮目も拾う

## AIとしての解釈ルール
ここが非常に重要です。あなたは単にニュースを並べるのではなく、その情報から一段上の抽象度で意味を取り出してください。
- 「この情報が出たということは、市場は次にどこへ向かうのか」
- 「この流れはSNS発信にどう影響するのか」
- 「今から仕込むならどのテーマが良いのか」
- 「今後数年で価値が落ちるスキル・事業は何か」
- 「まだ日本では認識されていない先行トレンドは何か」
ただし、根拠のない断定は禁止。妄想は禁止。必ず事実ベースで推論し、推論である部分は推論と分かるように書く。

## 文章ルール
- 日本語で書く
- 短く、無駄なく、構造的に
- 抽象論で終わらない
- 経営判断・発信判断・事業判断に使える粒度にする
- 誇張しない
- 重要なものだけ出す
- 面白さより、重要性・再現性・先回り価値を優先する

## 出力形式
毎回、重要度の高いものだけを **3〜7件** に絞り、必ず以下のJSONフォーマットで出力してください。
Markdownの \`\`\`json などの記号は一切含めず、純粋なJSONオブジェクトのみを出力してください。

{
  "articles": [
    {
      "category": "AI / ビジネス / 未来予測 / 政策 / 市場 のいずれか",
      "title": "要点（惹きつけられるタイトル）",
      "what_happened": "何が起きたか",
      "info_type": "一次情報 / 準一次情報 / 二次情報のいずれか",
      "reliability": "高 / 中 / 低 のいずれか",
      "why_important": "なぜ重要か",
      "future_changes": "今後起きうる変化",
      "ai_interpretation": "AIとしての解釈",
      "business_implication": "事業への示唆",
      "sns_implication": "SNS発信への示唆",
      "japan_context": "日本市場での意味",
      "growing_area": "伸びる可能性がある領域",
      "declining_area": "衰退リスクがある領域",
      "watch_points": "今のうちに見るべき点",
      "source_name": "情報源",
      "link": "URL"
    }
  ],
  "summary": {
    "most_important": "今日いちばん重要な変化",
    "structural_change": "今日の情報から見える構造変化",
    "themes_to_watch": "今後ウォッチすべきテーマ",
    "sns_themes": "今、SNSで発信するなら有望なテーマ",
    "business_opportunities": "今、事業として張るなら有望な領域",
    "declining_risks": "今後数年で弱くなる可能性がある領域",
    "info_gap": "日本ではまだ情報格差になっているテーマ"
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

// ======= Notionへの送信機能 =======
async function sendToNotion(data) {
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_PARENT_PAGE_ID) {
    console.log('⚠️ Notionの設定がないため連携をスキップします。');
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
  
  // 1. 本日の総括 (Summary)
  childrenBlocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: "🎯 本日の総括" } }] } });
  
  const addSummaryPoint = (title, content, emoji) => {
    childrenBlocks.push({
      object: 'block',
      type: 'callout',
      callout: { icon: { type: "emoji", emoji }, rich_text: [{ type: 'text', text: { content: `【${title}】\n${content}` } }] }
    });
  };
  addSummaryPoint("今日いちばん重要な変化", data.summary.most_important, "🔥");
  addSummaryPoint("今日から見える構造変化", data.summary.structural_change, "🏗️");
  addSummaryPoint("今後ウォッチすべきテーマ", data.summary.themes_to_watch, "👀");
  addSummaryPoint("SNS発信で有望なテーマ", data.summary.sns_themes, "📱");
  addSummaryPoint("事業として張るなら", data.summary.business_opportunities, "💼");
  addSummaryPoint("今後数年で弱くなる領域", data.summary.declining_risks, "📉");
  addSummaryPoint("日本での情報格差テーマ", data.summary.info_gap, "🤫");
  childrenBlocks.push({ object: 'block', type: 'divider', divider: {} });

  // 2. 各記事の詳細 (Articles)
  for (const article of data.articles) {
    childrenBlocks.push({
      object: 'block', type: 'heading_2',
      heading_2: { rich_text: [{ type: 'text', text: { content: `【${article.category}】 ${article.title}`, link: article.link ? { url: String(article.link) } : null } }] }
    });
    
    // 基本スペック
    childrenBlocks.push({
      object: 'block', type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: `情報源: ${article.source_name} | 情報の種類: ${article.info_type} | 信頼度: ${article.reliability}` }, annotations: { color: "gray" } }] }
    });

    const addArticlePoint = (title, content, emoji) => {
      childrenBlocks.push({
        object: 'block', type: 'callout',
        callout: { icon: { type: "emoji", emoji }, rich_text: [{ type: 'text', text: { content: `${title}:\n${content}` } }] }
      });
    };
    addArticlePoint("何が起きたか", article.what_happened, "📰");
    addArticlePoint("なぜ重要か", article.why_important, "⚡");
    addArticlePoint("今後起きうる変化", article.future_changes, "🔮");
    addArticlePoint("AIとしての解釈", article.ai_interpretation, "🤖");
    addArticlePoint("事業への示唆", article.business_implication, "🏢");
    addArticlePoint("SNS発信への示唆", article.sns_implication, "✍️");
    addArticlePoint("日本市場での意味", article.japan_context, "🇯🇵");
    
    // リスト型
    childrenBlocks.push({
      object: 'block', type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: [{ type: 'text', text: { content: `📈 伸びる領域: ${article.growing_area}` } }] }
    });
    childrenBlocks.push({
      object: 'block', type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: [{ type: 'text', text: { content: `📉 衰退リスク領域: ${article.declining_area}` } }] }
    });
    childrenBlocks.push({
      object: 'block', type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: [{ type: 'text', text: { content: `👀 今のうちに見るべき点: ${article.watch_points}` } }] }
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

// ======= Discord送信 =======
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
    content: "🌅 おはようございます！世界の一次情報に基づく最先端情報の戦略的解釈をお届けします📰",
    embeds: [{
      title: "🚀 世界の最先端ニュースと構造変化",
      color: 0xffd700,
      description: descriptionText,
      footer: { text: "Strategic AI Researcher Bot" }
    }]
  };

  try {
    await axios.post(webhookUrl, message);
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
