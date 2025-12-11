// 評価グレード
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

// 生徒情報
export interface Student {
  studentId: string;      // 学籍番号
  name: string;           // 氏名
  talkMemoFolderUrl: string; // トークメモフォルダURL
  enrollmentDate?: string;   // 入学年月
  status?: string;           // ステータス
}

// プロレベルセクションの評価項目
export interface ProLevelScores {
  absence: Grade;              // 欠席
  lateness: Grade;             // 遅刻
  mission: Grade;              // ミッション
  payment: Grade;              // 支払い
  activeListening: Grade;      // アクティブリスニング
  comprehension: Grade;        // 理解度
}

// 評価結果
export interface EvaluationResult {
  evaluationMonth: string;     // 評価月（YYYY-MM形式）
  studentId: string;           // 学籍番号
  studentName: string;         // 氏名
  scores: ProLevelScores;      // プロレベルセクションのスコア
  overallGrade: Grade;         // 総合評価
  comments?: string;           // コメント
  evaluatedAt: string;         // 評価日時
}

// トークメモの発言
export interface TalkMessage {
  speaker: string;    // 発言者（「先生」を含むか否かで判定）
  content: string;    // 発言内容
}

// トークメモドキュメント
export interface TalkMemoDocument {
  documentId: string;
  title: string;
  content: string;
  messages: TalkMessage[];
  date?: string;
}

// 欠席データ
export interface AbsenceData {
  studentId: string;
  absenceCount: number;
  month: string;
}

// 支払いデータ
export interface PaymentData {
  studentId: string;
  paymentStatus: 'paid' | 'unpaid' | 'partial';
  month: string;
}

// Gemini分析結果
export interface GeminiAnalysisResult {
  lateness: {
    grade: Grade;
    reason: string;
  };
  mission: {
    grade: Grade;
    reason: string;
  };
  activeListening: {
    grade: Grade;
    reason: string;
  };
  comprehension: {
    grade: Grade;
    correctAnswers: number;
    totalQuestions: number;
    reason: string;
  };
}

// API リクエスト/レスポンス型
export interface EvaluationRequest {
  studentIds?: string[];  // 特定の生徒のみ評価する場合
  month: string;          // 評価対象月（YYYY-MM形式）
}

export interface EvaluationResponse {
  success: boolean;
  message: string;
  results?: EvaluationResult[];
  errors?: string[];
}
