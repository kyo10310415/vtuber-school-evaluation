import { GoogleGenerativeAI } from '@google/generative-ai';
import type { TalkMemoDocument, GeminiAnalysisResult, Grade } from '../types';

export class GeminiAnalyzer {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    // Gemini 2.5 Flash を使用（2025年1月時点で利用可能な最新モデル）
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  // トークメモを分析して評価を返す
  async analyzeTrainingSession(talkMemo: TalkMemoDocument): Promise<GeminiAnalysisResult> {
    if (!talkMemo.messages.some(message => message.content.trim())) {
      throw new Error('トークメモに分析できる発言がありません');
    }
    const prompt = this.createAnalysisPrompt(talkMemo);
    
    try {
      console.log('[GeminiAnalyzer] Starting document analysis');
      console.log('[GeminiAnalyzer] Message count:', talkMemo.messages.length);
      
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      console.log('[GeminiAnalyzer] Response text length:', text.length);
      
      // Markdownコードブロックを除去（```json ... ``` または ``` ... ```）
      let jsonText = text;
      
      // ```json ... ``` 形式を検出
      const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1];
        console.log('[GeminiAnalyzer] Extracted JSON from code block');
      } else {
        // コードブロックなしでJSONを直接検出
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }
      }
      
      
      const analysis = JSON.parse(jsonText);
      return this.normalizeAnalysisResult(analysis);
    } catch (error: any) {
      console.error('[GeminiAnalyzer] Analysis failed');
      
      const status = Number.isInteger(error?.status) ? error.status : undefined;
      if (status === 429) {
        const violations = Array.isArray(error.errorDetails)
          ? error.errorDetails.flatMap(detail => Array.isArray(detail?.violations) ? detail.violations : [])
          : [];
        const metrics = violations.map(item => item?.quotaMetric)
          .filter(metric => typeof metric === 'string' && /^generativelanguage\.googleapis\.com\/[A-Za-z0-9_]+$/.test(metric));
        const quotaIds = violations.map(item => item?.quotaId)
          .filter(id => typeof id === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(id));
        console.warn('[GeminiAnalyzer] Quota exceeded', { status, metrics, quotaIds });
        throw new Error('Gemini API の利用上限に達しました');
      }
      if (status !== undefined) console.warn('[GeminiAnalyzer] HTTP status:', status);
      throw new Error('Gemini によるトークメモ分析に失敗しました');
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
   - 先生が生徒に出した、レッスン内容の理解を確かめる質問と回答を特定する。質問数は固定しない。
   - 挨拶・日程調整などの質問や、回答を求めない問いかけは除く。同じ質問の言い換えは1問と数える。
   - 質問に沿ってどの程度正確かつ具体的に、自分の言葉で答えられたかを評価する。補助を受けて一部答えられた場合も考慮する。
   - S: ほぼすべてに正確に答え、理由も説明できる。A: 大半に適切に答えられる。B: 要点に答えられるが、一部は不十分。C: 適切に答えられる質問が少ない。D: 質問にほとんど答えられない。
   - correctAnswers と totalQuestions には記録から確認できた実数を入れる。対象となる質問を確認できなければ、両方を0、gradeをnullにする。

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
    "grade": "B",
    "correctAnswers": 2,
    "totalQuestions": 3,
    "reason": "要点には答えられたが、手順を選んだ理由は補助が必要だった"
  }
}

評価理由は具体的かつ簡潔に記述してください。`;
  }

  // レスポンスを正規化
  private normalizeAnalysisResult(raw: any): GeminiAnalysisResult {
    const { grade, correctAnswers, totalQuestions, reason } = raw.comprehension ?? {};
    if (!Number.isSafeInteger(totalQuestions) || totalQuestions < 0 ||
        !Number.isSafeInteger(correctAnswers) || correctAnswers < 0 || correctAnswers > totalQuestions ||
        (totalQuestions === 0 && grade !== null)) {
      throw new Error('Gemini の理解度評価の質問数または回答数が不正です');
    }
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
        grade: totalQuestions === 0 ? null : this.normalizeGrade(grade),
        correctAnswers,
        totalQuestions,
        reason: totalQuestions === 0 ? '理解度を確認できる質問がありません' : reason || '',
      },
    };
  }

  // グレードを正規化
  private normalizeGrade(grade: any): Grade {
    const normalized = String(grade).toUpperCase();
    if (['S', 'A', 'B', 'C', 'D'].includes(normalized)) {
      return normalized as Grade;
    }
    throw new Error('Gemini の評価が欠落または不正です');
  }
}
