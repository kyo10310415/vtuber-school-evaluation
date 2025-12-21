import { GoogleGenerativeAI } from '@google/generative-ai';
import type { TalkMemoDocument, GeminiAnalysisResult, Grade } from '../types';

export class GeminiAnalyzer {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    // Gemini API v1betaでは具体的なバージョン番号を使用
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash-002' });
  }

  // トークメモを分析して評価を返す
  async analyzeTrainingSession(talkMemo: TalkMemoDocument): Promise<GeminiAnalysisResult> {
    const prompt = this.createAnalysisPrompt(talkMemo);
    
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // JSONレスポンスをパース
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return this.normalizeAnalysisResult(analysis);
      }
      
      throw new Error('Failed to parse Gemini response');
    } catch (error) {
      console.error('Gemini analysis error:', error);
      // エラー時のデフォルト値
      return {
        lateness: { grade: 'C', reason: '分析エラー' },
        mission: { grade: 'C', reason: '分析エラー' },
        activeListening: { grade: 'C', reason: '分析エラー' },
        comprehension: { grade: 'C', correctAnswers: 0, totalQuestions: 5, reason: '分析エラー' },
      };
    }
  }

  // 分析用プロンプトを作成
  private createAnalysisPrompt(talkMemo: TalkMemoDocument): string {
    const messages = talkMemo.messages
      .map(m => `${m.speaker}: ${m.content}`)
      .join('\n');

    return `あなたはVTuber育成スクールの評価AIです。以下のレッスンのトークメモを分析し、生徒の成長度を評価してください。

【トークメモ】
${messages}

【評価項目と基準】
1. **遅刻評価（S or D の2段階）**
   - トーク内で遅刻に関する話題がなければS評価
   - 遅刻の話題があればD評価

2. **ミッション評価（S〜Dの5段階）**
   - ミッションの達成度や取り組み姿勢を評価
   - S: 完璧な達成、A: 良好、B: 普通、C: やや不十分、D: 不十分

3. **アクティブリスニング評価（S〜Dの5段階）**
   - 先生の話に対して適切に反応しているか
   - 相槌、質問、フィードバックの質を評価
   - S: 非常に優れた傾聴、A: 良好、B: 普通、C: やや不足、D: 不足

4. **理解度評価（S〜Dの5段階）**
   - 先生が口頭で出す質問の正解数をカウント（全5問想定）
   - 正解数に応じて評価: 5問→S, 4問→A, 3問→B, 2問→C, 1問以下→D
   - トーク内で質問と回答のやり取りを特定してカウント

【出力形式】
以下のJSON形式で出力してください：
{
  "lateness": {
    "grade": "S",
    "reason": "遅刻に関する言及なし"
  },
  "mission": {
    "grade": "A",
    "reason": "ミッションを適切に理解し取り組んでいる"
  },
  "activeListening": {
    "grade": "B",
    "reason": "基本的な相槌はあるが、深い質問が少ない"
  },
  "comprehension": {
    "grade": "A",
    "correctAnswers": 4,
    "totalQuestions": 5,
    "reason": "5問中4問正解。概ね理解している"
  }
}

評価理由は具体的かつ簡潔に記述してください。`;
  }

  // レスポンスを正規化
  private normalizeAnalysisResult(raw: any): GeminiAnalysisResult {
    return {
      lateness: {
        grade: this.normalizeGrade(raw.lateness?.grade),
        reason: raw.lateness?.reason || '',
      },
      mission: {
        grade: this.normalizeGrade(raw.mission?.grade),
        reason: raw.mission?.reason || '',
      },
      activeListening: {
        grade: this.normalizeGrade(raw.activeListening?.grade),
        reason: raw.activeListening?.reason || '',
      },
      comprehension: {
        grade: this.normalizeGrade(raw.comprehension?.grade),
        correctAnswers: raw.comprehension?.correctAnswers || 0,
        totalQuestions: raw.comprehension?.totalQuestions || 5,
        reason: raw.comprehension?.reason || '',
      },
    };
  }

  // グレードを正規化
  private normalizeGrade(grade: any): Grade {
    const normalized = String(grade).toUpperCase();
    if (['S', 'A', 'B', 'C', 'D'].includes(normalized)) {
      return normalized as Grade;
    }
    return 'C'; // デフォルト
  }
}
