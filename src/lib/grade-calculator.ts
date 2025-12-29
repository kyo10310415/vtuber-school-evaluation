/**
 * YouTube評価をS～Dの5段階で採点
 */
export function calculateYouTubeGrade(evaluation: any): string {
  let score = 0;
  let maxScore = 0;
  
  // 1. 週4回配信目標（20点）
  maxScore += 20;
  if (evaluation.meetsWeekly4StreamsGoal) {
    score += 20;
  } else if (evaluation.weeklyStreamCount >= 3) {
    score += 15;
  } else if (evaluation.weeklyStreamCount >= 2) {
    score += 10;
  } else if (evaluation.weeklyStreamCount >= 1) {
    score += 5;
  }
  
  // 2. 1.5時間配信目標（20点）
  maxScore += 20;
  if (evaluation.meetsMinimum90MinutesGoal) {
    score += 20;
  } else if (evaluation.averageStreamDuration >= 60) {
    score += 15;
  } else if (evaluation.averageStreamDuration >= 30) {
    score += 10;
  } else if (evaluation.averageStreamDuration > 0) {
    score += 5;
  }
  
  // 3. 登録者伸び率（20点）
  maxScore += 20;
  if (evaluation.subscriberGrowthRate >= 10) {
    score += 20;
  } else if (evaluation.subscriberGrowthRate >= 5) {
    score += 15;
  } else if (evaluation.subscriberGrowthRate >= 2) {
    score += 10;
  } else if (evaluation.subscriberGrowthRate > 0) {
    score += 5;
  }
  
  // 4. エンゲージメント率（20点）
  maxScore += 20;
  if (evaluation.engagementRate >= 5) {
    score += 20;
  } else if (evaluation.engagementRate >= 3) {
    score += 15;
  } else if (evaluation.engagementRate >= 1) {
    score += 10;
  } else if (evaluation.engagementRate > 0) {
    score += 5;
  }
  
  // 5. タイトル・サムネイル品質（20点）
  maxScore += 20;
  const qualityScore = {
    'Excellent': 20,
    'Good': 15,
    'Average': 10,
    'Poor': 5,
    'Very Poor': 0
  };
  score += (qualityScore[evaluation.titleQuality as keyof typeof qualityScore] || 0) / 2;
  score += (qualityScore[evaluation.thumbnailQuality as keyof typeof qualityScore] || 0) / 2;
  
  // パーセンテージを計算
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  
  // 5段階評価
  if (percentage >= 90) return 'S';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 60) return 'C';
  return 'D';
}

/**
 * X評価をS～Dの5段階で採点
 */
export function calculateXGrade(evaluation: any): string {
  let score = 0;
  let maxScore = 0;
  
  // 1. 1日2回投稿目標（20点）
  maxScore += 20;
  if (evaluation.meetsDailyTweetGoal) {
    score += 20;
  } else if (evaluation.dailyTweetCount >= 1.5) {
    score += 15;
  } else if (evaluation.dailyTweetCount >= 1) {
    score += 10;
  } else if (evaluation.dailyTweetCount > 0) {
    score += 5;
  }
  
  // 2. 週2回企画投稿目標（20点）
  maxScore += 20;
  if (evaluation.meetsWeeklyPlanningGoal) {
    score += 20;
  } else if (evaluation.weeklyPlanningTweets >= 1.5) {
    score += 15;
  } else if (evaluation.weeklyPlanningTweets >= 1) {
    score += 10;
  } else if (evaluation.weeklyPlanningTweets > 0) {
    score += 5;
  }
  
  // 3. フォロワー伸び率（20点）
  maxScore += 20;
  if (evaluation.followerGrowthRate >= 10) {
    score += 20;
  } else if (evaluation.followerGrowthRate >= 5) {
    score += 15;
  } else if (evaluation.followerGrowthRate >= 2) {
    score += 10;
  } else if (evaluation.followerGrowthRate > 0) {
    score += 5;
  }
  
  // 4. エンゲージメント率（20点）
  maxScore += 20;
  if (evaluation.engagementRate >= 10) {
    score += 20;
  } else if (evaluation.engagementRate >= 7) {
    score += 15;
  } else if (evaluation.engagementRate >= 5) {
    score += 10;
  } else if (evaluation.engagementRate > 0) {
    score += 5;
  }
  
  // 5. インプレッション伸び率（20点）
  maxScore += 20;
  if (evaluation.impressionGrowthRate >= 20) {
    score += 20;
  } else if (evaluation.impressionGrowthRate >= 10) {
    score += 15;
  } else if (evaluation.impressionGrowthRate >= 5) {
    score += 10;
  } else if (evaluation.impressionGrowthRate > 0) {
    score += 5;
  }
  
  // パーセンテージを計算
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  
  // 5段階評価
  if (percentage >= 90) return 'S';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 60) return 'C';
  return 'D';
}
