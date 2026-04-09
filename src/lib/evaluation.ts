import type {
  Student,
  AbsenceData,
  PaymentData,
  TalkMemoDocument,
  ProLevelScores,
  EvaluationResult,
  Grade,
  GeminiAnalysisResult,
} from '../types';

// 欠席回数から評価を算出（無断キャンセル回数）
export function evaluateAbsence(absenceCount: number): Grade {
  if (absenceCount === 0) return 'S';
  if (absenceCount === 1) return 'A';
  if (absenceCount === 2) return 'B';
  if (absenceCount === 3) return 'C';
  return 'D'; // 4回以上
}

// リスケ回数から遅刻評価を算出（生徒様都合でリスケ回数）
// トークメモからのGemini評価と組み合わせ、リスケがある場合は厳しくする
export function evaluateLateness(
  rescheduleCount: number,
  geminiGrade: Grade | undefined
): Grade {
  // リスケ0件かつGemini評価あり → Gemini評価を採用
  if (rescheduleCount === 0 && geminiGrade) return geminiGrade;

  // リスケ0件かつGemini評価なし → S（デフォルト）
  if (rescheduleCount === 0) return 'S';

  // リスケがある場合: リスケ回数とGemini評価を組み合わせて算出
  const rescheduleGrade: Grade =
    rescheduleCount === 1 ? 'A' :
    rescheduleCount === 2 ? 'B' :
    rescheduleCount === 3 ? 'C' :
    'D'; // 4回以上

  // Gemini評価がない場合はリスケ回数のみで判定
  if (!geminiGrade) return rescheduleGrade;

  // Gemini評価とリスケ評価の悪い方を採用（厳格評価）
  const gradePoints: Record<Grade, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 };
  const pointsToGrade: Record<number, Grade> = { 5: 'S', 4: 'A', 3: 'B', 2: 'C', 1: 'D' };
  const minPoints = Math.min(gradePoints[geminiGrade], gradePoints[rescheduleGrade]);
  return pointsToGrade[minPoints];
}

// 支払い状況から評価を算出（新仕様: S or D のみ）
export function evaluatePayment(paymentStatus: 'paid' | 'unpaid' | 'partial'): Grade {
  // unpaid の場合は D、それ以外は S
  return paymentStatus === 'unpaid' ? 'D' : 'S';
}

// 総合評価を計算（6項目の平均）
export function calculateOverallGrade(scores: ProLevelScores): Grade {
  const gradePoints: Record<Grade, number> = {
    S: 5,
    A: 4,
    B: 3,
    C: 2,
    D: 1,
  };

  const pointsToGrade: Record<number, Grade> = {
    5: 'S',
    4: 'A',
    3: 'B',
    2: 'C',
    1: 'D',
  };

  // 各項目のポイントを合計
  const totalPoints =
    gradePoints[scores.absence] +
    gradePoints[scores.lateness] +
    gradePoints[scores.mission] +
    gradePoints[scores.payment] +
    gradePoints[scores.activeListening] +
    gradePoints[scores.comprehension];

  // 平均ポイントを計算（6項目）
  const averagePoint = Math.round(totalPoints / 6);

  return pointsToGrade[averagePoint] || 'C';
}

// 生徒の総合評価を実施
export function evaluateStudent(
  student: Student,
  absenceData: AbsenceData | undefined,
  paymentData: PaymentData | undefined,
  geminiAnalysis: GeminiAnalysisResult | null, // nullを許容
  month: string
): EvaluationResult {
  const rescheduleCount = absenceData?.rescheduleCount || 0;

  const scores: ProLevelScores = {
    absence: evaluateAbsence(absenceData?.absenceCount || 0),
    // 遅刻: リスケ回数 + Gemini評価（遅刻・話し方など）を組み合わせ
    lateness: evaluateLateness(rescheduleCount, geminiAnalysis?.lateness.grade),
    mission: geminiAnalysis?.mission.grade || 'C', // デフォルトC
    payment: paymentData ? evaluatePayment(paymentData.paymentStatus) : 'S', // 支払いデータなし（未払いリストに含まれていない）= S評価
    activeListening: geminiAnalysis?.activeListening.grade || 'C', // デフォルトC
    comprehension: geminiAnalysis?.comprehension.grade || 'C', // デフォルトC
  };

  const overallGrade = calculateOverallGrade(scores);

  return {
    evaluationMonth: month,
    studentId: student.studentId,
    studentName: student.name,
    scores,
    overallGrade,
    comments: generateComments(scores, geminiAnalysis, absenceData?.absenceCount || 0, rescheduleCount),
    evaluatedAt: new Date().toISOString(),
  };
}

// コメントを生成
function generateComments(
  scores: ProLevelScores,
  analysis: GeminiAnalysisResult | null,
  absenceCount: number,
  rescheduleCount: number,
): string {
  const comments: string[] = [];

  // 優れている点
  const strengths: string[] = [];
  if (scores.absence === 'S') strengths.push('皆勤');
  if (scores.lateness === 'S' && rescheduleCount === 0) strengths.push('リスケなし');
  if (scores.mission === 'S' || scores.mission === 'A') strengths.push('ミッション達成');
  // 支払い評価は一旦コメントから除外

  if (strengths.length > 0) {
    comments.push(`【強み】${strengths.join('、')}`);
  }

  // 改善点
  const improvements: string[] = [];
  if (absenceCount > 0) improvements.push(`無断キャンセル${absenceCount}回`);
  if (rescheduleCount > 0) improvements.push(`リスケ${rescheduleCount}回`);
  if (scores.absence === 'C' || scores.absence === 'D') improvements.push('出席率の改善');
  if (scores.lateness === 'D') improvements.push('リスケ・時間厳守');
  if (scores.mission === 'C' || scores.mission === 'D') improvements.push('ミッション取り組み');
  // 支払い評価は一旦コメントから除外
  if (scores.activeListening === 'C' || scores.activeListening === 'D') improvements.push('傾聴姿勢');
  if (scores.comprehension === 'C' || scores.comprehension === 'D') improvements.push('理解度向上');

  if (improvements.length > 0) {
    comments.push(`【改善点】${improvements.join('、')}`);
  }

  // AI分析からの具体的なフィードバック（トークメモがある場合のみ）
  if (analysis) {
    comments.push(`【ミッション】${analysis.mission.reason}`);
    comments.push(`【傾聴力】${analysis.activeListening.reason}`);
    comments.push(`【理解度】${analysis.comprehension.reason}`);
  } else {
    comments.push(`【トークメモ】トークメモが見つかりません。詳細な評価にはトークメモが必要です。`);
  }

  return comments.join(' / ');
}

// 評価結果をスプレッドシート用の配列に変換
export function convertResultToArray(result: EvaluationResult): any[] {
  return [
    result.evaluationMonth,    // 評価月
    result.studentId,          // 学籍番号
    result.studentName,        // 氏名
    result.scores.absence,     // 欠席
    result.scores.lateness,    // 遅刻
    result.scores.mission,     // ミッション
    result.scores.payment,     // 支払い
    result.scores.activeListening,  // アクティブリスニング
    result.scores.comprehension,    // 理解度
    result.overallGrade,       // 総合評価
    result.comments,           // コメント
    result.evaluatedAt,        // 評価日時
  ];
}
