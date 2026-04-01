import { GoogleGenerativeAI } from '@google/generative-ai';
import Parser from 'rss-parser';
import axios from 'axios';
import dotenv from 'dotenv';

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
      // 各ソースから最新5件を抽出
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
    'gemini-3.1-flash-live-preview',
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-flash-latest'
  ];

  const prompt = `
あなたは、海外のAI・ビジネス・未来予測に関する高信頼情報を収集し、単なる要約ではなく、
「今、何が起きていて、それが何を意味し、事業・発信・ポジション取りにどう影響するか」まで解釈する、超優秀な戦略リサーチャーです。

目的は、「毎朝7時に、世界の最先端情報を、日本語で、短く、構造的に、意思決定できる形で受け取ること」です。

## 最重要ルール
- 常に現在日時を基準にして最新の情報を取得し、古い情報は採用しないでください。
- 「過去にはこう言われていた」ではなく、「今どうなっているか」を優先してください。
- 不確実なものは明記し、事実と推論（解釈）を分けてください。
- ただの要約で終わらず、必ずAIとしての解釈・示唆・未来予測まで出してください。
- 出力は今回取得した情報の中から、重要度の高いものだけを3〜7件に絞ってください。

## リサーチ対象
1. AI (新モデル、論文、エージェント、自動化、実務活用事例等)
2. ビジネス (新規事業、SaaS、経営戦略、市場変化等)
3. 未来予測 (テクノロジー進化、業界構造、社会変化等)

## 情報源の解釈ルール
- 日本でまだ知られていないが重要なもの、日本市場への転用可能性を重視してください。
- この流れで得をする人は誰か、新しく生まれる市場は何か、潰れる市場は何かを考察してください。

出力フォーマットは必ず以下のJSON形式にしてください。Markdownの\`\`\`json等の記号は不要で、JSONオブジェクトのみを出力してください。

{
  "articles": [
    {
      "category": "AI / ビジネス / 未来予測 / 政策 / 市場",
      "title": "惹きつけられるタイトル",
      "what_happened": "何が起きたか",
      "info_type": "一次情報 / 準一次情報 / 二次情報",
      "reliability": "高 / 中 / 低",
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
${newsText.slice(0, 25000)}
`;

  let responseText = null;
  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`⏳ モデル ${modelName} で試行中...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      responseText = result.response.text();
      console.log(`✅ モデル ${modelName} で要約生成に成功しました！`);
      break; 
    } catch (e) {
      console.log(`⚠️ モデル ${modelName} は失敗しました: ${e.message}`);
      lastError = e;
    }
  }

  if (!responseText) {
    throw new Error(`すべてのモデルでの生成に失敗しました。最後のエラー: ${lastError.message}`);
  }
  
  // JSONパースの安全な処理
  try {
    let text = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (e) {
    console.error("GeminiからのJSONパースに失敗しました。生テキスト:", responseText);
    throw new Error('Geminiの出力形式エラー');
  }
}

async function sendToDiscord(data) {
  console.log('🚀 Discordへ投稿中...');
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('DISCORD_WEBHOOK_URL が設定されていません。');

  const truncate = (str, max) => {
    if (str === null || str === undefined) return "-";
    const s = String(str).trim();
    if (s === "") return "-";
    return s.length > max ? s.slice(0, max - 3) + '...' : s;
  };

  const embeds = (data.articles || []).slice(0, 9).map(article => ({
    color: 0x2b2d31,
    title: truncate(`【${article.category}】${article.title}`, 250),
    url: article.link && String(article.link).startsWith('http') ? article.link : null,
    description: truncate(`**📝 何が起きたか**\n${article.what_happened}\n\n**💡 なぜ重要か**\n${article.why_important}\n\n**🤖 AIとしての解釈・未来予測**\n${article.ai_interpretation}\n${article.future_changes}`, 3000),
    fields: [
      { name: "🏢 事業への示唆", value: truncate(article.business_implication, 1000), inline: true },
      { name: "📱 SNS発信への示唆", value: truncate(article.sns_implication, 1000), inline: true },
      { name: "🇯🇵 日本市場での意味", value: truncate(article.japan_context, 1000), inline: false },
      { name: "📈 伸びる領域", value: truncate(article.growing_area, 1000), inline: true },
      { name: "📉 衰退リスク領域", value: truncate(article.declining_area, 1000), inline: true }
    ],
    footer: { text: truncate(`情報源: ${article.source_name} (${article.info_type} / 信頼度: ${article.reliability}) | 注目点: ${article.watch_points}`, 1000) }
  }));

  if (data.summary) {
    embeds.push({
      color: 0xffd700,
      title: "🌟 本日の総括・構造変化",
      description: truncate(`**今日いちばん重要な変化:**\n${data.summary.most_important}`, 2000),
      fields: [
        { name: "🔍 構造変化", value: truncate(data.summary.structural_change, 1000), inline: false },
        { name: "👀 ウォッチすべきテーマ", value: truncate(data.summary.themes_to_watch, 1000), inline: false },
        { name: "📱 SNS発信有望テーマ", value: truncate(data.summary.sns_themes, 1000), inline: true },
        { name: "💼 事業の有望領域", value: truncate(data.summary.business_opportunities, 1000), inline: true },
        { name: "⚠️ 弱くなる領域", value: truncate(data.summary.declining_risks, 1000), inline: true },
        { name: "🤫 日本での情報格差", value: truncate(data.summary.info_gap, 1000), inline: false }
      ]
    });
  }

    let first = true;
    for (const embed of embeds) {
      const message = {
        username: "戦略リサーチャーAI",
        content: first ? "🌅 おはようございます！本日の最先端情報の戦略的解釈をお届けします📰\n(順不同で配信します)" : "",
        embeds: [embed]
      };
      
      try {
        await axios.post(webhookUrl, message);
      } catch (err) {
        console.error('⚠️ 送信エラーが発生しました。ペイロード:', JSON.stringify(message, null, 2));
        if (err.response?.data) {
          console.error('Discord Webhook API エラー (400):', JSON.stringify(err.response.data, null, 2));
        } else {
          console.error('Discord Webhookエラー:', err.message);
        }
      }
      first = false;
      await new Promise(r => setTimeout(r, 1000)); // Rate limit回避のためのウェイト
    }
    console.log('✅ Discord全投稿完了処理です！');
}

async function main() {
  try {
    const newsText = await fetchRssFeeds();
    if (!newsText) throw new Error('ニュースデータの取得に失敗しました。');
    
    const summaryBlocks = await summarizeWithGemini(newsText);
    await sendToDiscord(summaryBlocks);
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

main();
