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

// 欠席回数から評価を算出（無断キャンセル回数のみ）
export function evaluateAbsence(absenceCount: number): Grade {
  if (absenceCount === 0) return 'S';
  if (absenceCount === 1) return 'A';
  if (absenceCount === 2) return 'B';
  if (absenceCount === 3) return 'C';
  return 'D'; // 4回以上
}

// 支払い状況から評価を算出（新仕様: S or D のみ）
export function evaluatePayment(paymentStatus: 'paid' | 'unpaid' | 'partial'): Grade {
  // unpaid の場合は D、それ以外は S
  return paymentStatus === 'unpaid' ? 'D' : 'S';
}

// 総合評価を計算（欠席・遅刻・支払い15%、学習3項目85%）
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

  const attendanceAndPaymentPoints =
    gradePoints[scores.absence] +
    gradePoints[scores.lateness] +
    gradePoints[scores.payment];
  const learningGrades = scores.comprehension === null
    ? [scores.mission, scores.activeListening]
    : [scores.mission, scores.activeListening, scores.comprehension];
  const learningPoints = learningGrades.reduce((sum, grade) => sum + gradePoints[grade], 0);

  // 欠席・遅刻・支払いの平均と、評価できた学習項目の平均に重みを掛けて四捨五入する。
  const averagePoint = Math.round(
    (15 * attendanceAndPaymentPoints * learningGrades.length + 85 * learningPoints * 3) /
    (100 * 3 * learningGrades.length)
  );

  return pointsToGrade[averagePoint] || 'C';
}

// 生徒の総合評価を実施
export function evaluateStudent(
  student: Student,
  absenceData: AbsenceData | undefined,
  paymentData: PaymentData | undefined,
  geminiAnalysis: GeminiAnalysisResult,
  month: string
): EvaluationResult {
  const scores: ProLevelScores = {
    absence: evaluateAbsence(absenceData?.absenceCount || 0),
    lateness: geminiAnalysis.lateness.grade,
    mission: geminiAnalysis.mission.grade,
    payment: paymentData ? evaluatePayment(paymentData.paymentStatus) : 'S', // 支払いデータなし（未払いリストに含まれていない）= S評価
    activeListening: geminiAnalysis.activeListening.grade,
    comprehension: geminiAnalysis.comprehension.grade,
  };

  const overallGrade = calculateOverallGrade(scores);

  return {
    evaluationMonth: month,
    studentId: student.studentId,
    studentName: student.name,
    scores,
    overallGrade,
    comments: generateComments(scores, geminiAnalysis, absenceData?.absenceCount || 0),
    evaluatedAt: new Date().toISOString(),
  };
}

// コメントを生成
function generateComments(
  scores: ProLevelScores,
  analysis: GeminiAnalysisResult,
  absenceCount: number,
): string {
  const comments: string[] = [];

  // 優れている点
  const strengths: string[] = [];
  if (scores.absence === 'S') strengths.push('皆勤');
  if (scores.lateness === 'S') strengths.push('遅刻なし');
  if (scores.mission === 'S' || scores.mission === 'A') strengths.push('ミッション達成');
  // 支払い評価は一旦コメントから除外

  if (strengths.length > 0) {
    comments.push(`【強み】${strengths.join('、')}`);
  }

  // 改善点
  const improvements: string[] = [];
  if (absenceCount > 0) improvements.push(`無断キャンセル${absenceCount}回`);
  if (scores.absence === 'C' || scores.absence === 'D') improvements.push('出席率の改善');
  if (scores.lateness === 'D') improvements.push('時間厳守');
  if (scores.mission === 'C' || scores.mission === 'D') improvements.push('ミッション取り組み');
  // 支払い評価は一旦コメントから除外
  if (scores.activeListening === 'C' || scores.activeListening === 'D') improvements.push('傾聴姿勢');
  if (scores.comprehension === 'C' || scores.comprehension === 'D') improvements.push('理解度向上');

  if (improvements.length > 0) {
    comments.push(`【改善点】${improvements.join('、')}`);
  }

  comments.push(`【ミッション】${analysis.mission.reason}`);
  comments.push(`【傾聴力】${analysis.activeListening.reason}`);
  comments.push(`【理解度】${analysis.comprehension.reason}`);

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
    result.scores.comprehension ?? '', // 理解度
    result.overallGrade,       // 総合評価
    result.comments,           // コメント
    result.evaluatedAt,        // 評価日時
  ];
}

// Older runs saved fallback grades as completed evaluations.
export function isFallbackProLevelComment(value: unknown): boolean {
  return typeof value === 'string' && (
    value.includes('【トークメモ】トークメモが見つかりません。') ||
    /【(?:ミッション|傾聴力|理解度)】分析エラー:/.test(value)
  );
}
