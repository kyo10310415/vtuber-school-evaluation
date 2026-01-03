// 評価結果詳細画面 - グラフ・チャート表示

let currentStudentId = null;
let currentMonth = null;
let evaluationData = null;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  // URLパラメータから学籍番号と月を取得
  const params = new URLSearchParams(window.location.search);
  currentStudentId = params.get('studentId');
  currentMonth = params.get('month') || getCurrentMonth();
  
  if (currentStudentId) {
    document.getElementById('student-id-input').value = currentStudentId;
    document.getElementById('month-input').value = currentMonth;
    loadEvaluationData();
  }
  
  setupEventListeners();
});

// 前月を取得 (YYYY-MM形式)
function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  
  if (month === 0) {
    // 1月の場合、前年の12月
    return `${year - 1}-12`;
  } else {
    return `${year}-${String(month).padStart(2, '0')}`;
  }
}

// イベントリスナー設定
function setupEventListeners() {
  document.getElementById('load-btn').addEventListener('click', loadEvaluationData);
  document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = '/';
  });
  
  // ナビゲーションボタン（評価結果セクション内）
  const backToHomeBtn = document.getElementById('back-to-home-btn');
  const goToMonthlyReportBtn = document.getElementById('go-to-monthly-report-btn');
  
  if (backToHomeBtn) {
    backToHomeBtn.addEventListener('click', () => {
      window.location.href = '/';
    });
  }
  
  if (goToMonthlyReportBtn) {
    goToMonthlyReportBtn.addEventListener('click', () => {
      if (currentStudentId) {
        window.location.href = `/monthly-report?studentId=${currentStudentId}`;
      } else {
        alert('学籍番号が設定されていません');
      }
    });
  }
}

// 評価データを読み込み
async function loadEvaluationData() {
  currentStudentId = document.getElementById('student-id-input').value.trim();
  currentMonth = document.getElementById('month-input').value;
  
  if (!currentStudentId) {
    showError('学籍番号を入力してください');
    return;
  }
  
  if (!currentMonth) {
    showError('評価月を選択してください');
    return;
  }
  
  try {
    showLoading('評価データを読み込み中...');
    
    // 統合評価APIを使用
    const response = await fetch(`/api/evaluation/complete/${currentStudentId}?month=${currentMonth}`);
    const result = await response.json();
    
    hideLoading();
    
    if (!result.success) {
      showError('評価データの取得に失敗しました: ' + result.error);
      return;
    }
    
    evaluationData = result;
    
    // 画面を表示
    document.getElementById('loading-section').classList.add('hidden');
    document.getElementById('evaluation-section').classList.remove('hidden');
    
    // データを表示
    renderEvaluationData();
    
  } catch (error) {
    hideLoading();
    showError('エラー: ' + error.message);
  }
}

// 評価データを表示
function renderEvaluationData() {
  // ヘッダー情報を表示
  document.getElementById('student-name').textContent = evaluationData.studentName;
  document.getElementById('display-student-id').textContent = evaluationData.studentId;
  document.getElementById('display-month').textContent = evaluationData.month;
  
  // プロレベルセクション評価を表示
  if (evaluationData.proLevel) {
    renderProLevelEvaluation(evaluationData.proLevel);
    document.getElementById('prolevel-section').classList.remove('hidden');
  } else {
    document.getElementById('prolevel-section').classList.add('hidden');
  }
  
  // YouTube評価を表示
  if (evaluationData.youtube && !evaluationData.youtube.error) {
    renderYouTubeEvaluation(evaluationData.youtube);
  } else {
    document.getElementById('youtube-section').innerHTML = `
      <div class="bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="text-red-800">
          <i class="fas fa-exclamation-triangle mr-2"></i>
          YouTube評価データがありません
        </p>
      </div>
    `;
  }
  
  // X評価を表示
  if (evaluationData.x && !evaluationData.x.error) {
    renderXEvaluation(evaluationData.x);
  } else {
    document.getElementById('x-section').innerHTML = `
      <div class="bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="text-red-800">
          <i class="fas fa-exclamation-triangle mr-2"></i>
          X評価データがありません
        </p>
      </div>
    `;
  }
}

// プロレベルセクション評価を表示
function renderProLevelEvaluation(proLevel) {
  const section = document.getElementById('prolevel-content');
  
  const gradeColor = {
    'S': 'bg-purple-100 text-purple-800 border-purple-300',
    'A': 'bg-blue-100 text-blue-800 border-blue-300',
    'B': 'bg-green-100 text-green-800 border-green-300',
    'C': 'bg-yellow-100 text-yellow-800 border-yellow-300',
    'D': 'bg-red-100 text-red-800 border-red-300',
  };
  
  const html = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <!-- 総合評価 -->
      <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border-2 ${gradeColor[proLevel['総合評価']] || 'border-gray-300'}">
        <div class="text-center">
          <p class="text-sm text-gray-600 mb-2">総合評価</p>
          <div class="text-6xl font-bold ${gradeColor[proLevel['総合評価']]?.split(' ')[1] || 'text-gray-800'}">
            ${proLevel['総合評価'] || '-'}
          </div>
        </div>
      </div>
      
      <!-- 各項目評価 -->
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        ${[
          {key: '欠席', label: '欠席'},
          {key: '遅刻', label: '遅刻'},
          {key: 'ミッション', label: 'ミッション'},
          {key: '支払い', label: '支払い'},
          {key: 'アクティブリスニング', label: '傾聴力'},
          {key: '理解度', label: '理解度'}
        ].map(item => `
          <div class="bg-white rounded-lg p-3 border-2 ${gradeColor[proLevel[item.key]] || 'border-gray-200'} text-center">
            <p class="text-xs text-gray-600 mb-1">${item.label}</p>
            <div class="text-2xl font-bold ${gradeColor[proLevel[item.key]]?.split(' ')[1] || 'text-gray-800'}">
              ${proLevel[item.key] || '-'}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    
    ${proLevel['コメント'] ? `
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h4 class="font-bold text-blue-900 mb-2">
          <i class="fas fa-comment-alt mr-2"></i>評価コメント
        </h4>
        <p class="text-gray-700 whitespace-pre-line">${proLevel['コメント']}</p>
      </div>
    ` : ''}
    
    <div class="text-sm text-gray-500 text-right">
      評価日時: ${proLevel['評価日時'] ? new Date(proLevel['評価日時']).toLocaleString('ja-JP') : '-'}
    </div>
  `;
  
  section.innerHTML = html;
}

// YouTube評価を表示
function renderYouTubeEvaluation(evaluation) {
  const section = document.getElementById('youtube-section');
  
  const gradeColor = {
    'S': 'from-purple-500 to-purple-600 text-white',
    'A': 'from-blue-500 to-blue-600 text-white',
    'B': 'from-green-500 to-green-600 text-white',
    'C': 'from-yellow-500 to-yellow-600 text-white',
    'D': 'from-red-500 to-red-600 text-white',
  };
  
  // 総合評価カード
  const overallGradeHtml = evaluation.overallGrade ? `
    <div class="bg-gradient-to-br ${gradeColor[evaluation.overallGrade] || 'from-gray-500 to-gray-600 text-white'} rounded-lg p-6 mb-6 text-center shadow-lg">
      <p class="text-sm opacity-90 mb-2">YouTube 総合評価</p>
      <div class="text-6xl font-bold">${evaluation.overallGrade}</div>
    </div>
  ` : '';
  
  // サマリーカード
  const summaryHtml = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-red-600 font-semibold">登録者数</p>
            <p class="text-2xl font-bold text-red-900">${evaluation.subscriberCount.toLocaleString()}</p>
          </div>
          <i class="fab fa-youtube text-4xl text-red-500 opacity-50"></i>
        </div>
        <div class="mt-2 text-xs ${evaluation.subscriberGrowthRate > 0 ? 'text-green-600' : 'text-gray-600'}">
          ${evaluation.subscriberGrowthRate > 0 ? '↑' : '→'} ${evaluation.subscriberGrowthRate.toFixed(1)}% 伸び率
        </div>
      </div>
      
      <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-blue-600 font-semibold">総再生回数</p>
            <p class="text-2xl font-bold text-blue-900">${evaluation.totalViews.toLocaleString()}</p>
          </div>
          <i class="fas fa-eye text-4xl text-blue-500 opacity-50"></i>
        </div>
        <div class="mt-2 text-xs text-gray-600">
          月間動画数: ${evaluation.videosInMonth}本
        </div>
      </div>
      
      <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-purple-600 font-semibold">週間配信回数</p>
            <p class="text-2xl font-bold text-purple-900">${evaluation.weeklyStreamCount.toFixed(1)}回</p>
          </div>
          <i class="fas fa-video text-4xl text-purple-500 opacity-50"></i>
        </div>
        <div class="mt-2 text-xs">
          <span class="${evaluation.meetsWeekly4StreamsGoal ? 'text-green-600' : 'text-red-600'}">
            ${evaluation.meetsWeekly4StreamsGoal ? '✓ 目標達成' : '✗ 未達成'} (目標: 週4回)
          </span>
        </div>
      </div>
      
      <div class="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-green-600 font-semibold">平均配信時間</p>
            <p class="text-2xl font-bold text-green-900">${Math.round(evaluation.averageStreamDuration)}分</p>
          </div>
          <i class="fas fa-clock text-4xl text-green-500 opacity-50"></i>
        </div>
        <div class="mt-2 text-xs">
          <span class="${evaluation.meetsMinimum90MinutesGoal ? 'text-green-600' : 'text-red-600'}">
            ${evaluation.meetsMinimum90MinutesGoal ? '✓ 目標達成' : '✗ 未達成'} (目標: 90分)
          </span>
        </div>
      </div>
    </div>
  `;
  
  // チャート
  const chartsHtml = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-lg font-bold mb-4">エンゲージメント分析</h4>
        <canvas id="youtube-engagement-chart"></canvas>
      </div>
      
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-lg font-bold mb-4">コンテンツ品質</h4>
        <canvas id="youtube-quality-chart"></canvas>
      </div>
    </div>
  `;
  
  // 最近の動画リスト
  const videosHtml = evaluation.recentVideos && evaluation.recentVideos.length > 0 ? `
    <div class="bg-white rounded-lg shadow p-6">
      <h4 class="text-lg font-bold mb-4">最近の動画（最大10件）</h4>
      <div class="space-y-3">
        ${evaluation.recentVideos.slice(0, 10).map(video => `
          <div class="flex items-center gap-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
            <img src="${video.thumbnailUrl}" alt="thumbnail" class="w-32 h-18 object-cover rounded">
            <div class="flex-1">
              <h5 class="font-semibold text-sm line-clamp-2">${video.title}</h5>
              <p class="text-xs text-gray-600 mt-1">
                <i class="fas fa-eye mr-1"></i>${video.viewCount.toLocaleString()}回視聴 
                <i class="fas fa-thumbs-up ml-3 mr-1"></i>${video.likeCount.toLocaleString()} 
                <i class="fas fa-comment ml-3 mr-1"></i>${video.commentCount.toLocaleString()}
              </p>
              <p class="text-xs text-gray-500 mt-1">${video.publishedAt.substring(0, 10)}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';
  
  section.innerHTML = overallGradeHtml + summaryHtml + chartsHtml + videosHtml;
  
  // チャートを描画
  renderYouTubeCharts(evaluation);
}

// YouTubeチャートを描画
function renderYouTubeCharts(evaluation) {
  // エンゲージメントチャート
  const engagementCtx = document.getElementById('youtube-engagement-chart');
  if (engagementCtx) {
    new Chart(engagementCtx, {
      type: 'doughnut',
      data: {
        labels: ['いいね', 'コメント'],
        datasets: [{
          data: [evaluation.totalLikes, evaluation.totalComments],
          backgroundColor: ['#3B82F6', '#8B5CF6'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom'
          },
          title: {
            display: true,
            text: `エンゲージメント率: ${evaluation.engagementRate.toFixed(2)}%`
          }
        }
      }
    });
  }
  
  // 品質チャート
  const qualityCtx = document.getElementById('youtube-quality-chart');
  if (qualityCtx) {
    const qualityScore = {
      'Excellent': 5,
      'Good': 4,
      'Average': 3,
      'Poor': 2,
      'Very Poor': 1
    };
    
    new Chart(qualityCtx, {
      type: 'bar',
      data: {
        labels: ['タイトル品質', 'サムネイル品質'],
        datasets: [{
          label: '品質スコア',
          data: [
            qualityScore[evaluation.titleQuality] || 3,
            qualityScore[evaluation.thumbnailQuality] || 3
          ],
          backgroundColor: ['#10B981', '#F59E0B'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
            max: 5,
            ticks: {
              stepSize: 1,
              callback: function(value) {
                const labels = ['', 'Very Poor', 'Poor', 'Average', 'Good', 'Excellent'];
                return labels[value] || '';
              }
            }
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  }
}

// X評価を表示
function renderXEvaluation(evaluation) {
  const section = document.getElementById('x-section');
  
  const gradeColor = {
    'S': 'from-purple-500 to-purple-600 text-white',
    'A': 'from-blue-500 to-blue-600 text-white',
    'B': 'from-green-500 to-green-600 text-white',
    'C': 'from-yellow-500 to-yellow-600 text-white',
    'D': 'from-red-500 to-red-600 text-white',
  };
  
  // 総合評価カード
  const overallGradeHtml = evaluation.overallGrade ? `
    <div class="bg-gradient-to-br ${gradeColor[evaluation.overallGrade] || 'from-gray-500 to-gray-600 text-white'} rounded-lg p-6 mb-6 text-center shadow-lg">
      <p class="text-sm opacity-90 mb-2">X (Twitter) 総合評価</p>
      <div class="text-6xl font-bold">${evaluation.overallGrade}</div>
    </div>
  ` : '';
  
  // サマリーカード
  const summaryHtml = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-blue-600 font-semibold">フォロワー数</p>
            <p class="text-2xl font-bold text-blue-900">${evaluation.followersCount.toLocaleString()}</p>
          </div>
          <i class="fab fa-x-twitter text-4xl text-blue-500 opacity-50"></i>
        </div>
        <div class="mt-2 text-xs ${evaluation.followerGrowthRate > 0 ? 'text-green-600' : 'text-gray-600'}">
          ${evaluation.followerGrowthRate > 0 ? '↑' : '→'} ${evaluation.followerGrowthRate.toFixed(1)}% 伸び率
        </div>
      </div>
      
      <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-purple-600 font-semibold">月間投稿数</p>
            <p class="text-2xl font-bold text-purple-900">${evaluation.tweetsInMonth}</p>
          </div>
          <i class="fas fa-comment text-4xl text-purple-500 opacity-50"></i>
        </div>
        <div class="mt-2 text-xs">
          <span class="${evaluation.meetsDailyTweetGoal ? 'text-green-600' : 'text-red-600'}">
            ${evaluation.meetsDailyTweetGoal ? '✓ 目標達成' : '✗ 未達成'} (1日2回)
          </span>
        </div>
      </div>
      
      <div class="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-green-600 font-semibold">インプレッション</p>
            <p class="text-2xl font-bold text-green-900">${evaluation.totalImpressions.toLocaleString()}</p>
          </div>
          <i class="fas fa-chart-line text-4xl text-green-500 opacity-50"></i>
        </div>
        <div class="mt-2 text-xs ${evaluation.impressionGrowthRate > 0 ? 'text-green-600' : 'text-gray-600'}">
          ${evaluation.impressionGrowthRate > 0 ? '↑' : '→'} ${evaluation.impressionGrowthRate.toFixed(1)}% 伸び率
        </div>
      </div>
      
      <div class="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-yellow-600 font-semibold">エンゲージメント率</p>
            <p class="text-2xl font-bold text-yellow-900">${evaluation.engagementRate.toFixed(2)}%</p>
          </div>
          <i class="fas fa-heart text-4xl text-yellow-500 opacity-50"></i>
        </div>
        <div class="mt-2 text-xs ${evaluation.engagementGrowthRate > 0 ? 'text-green-600' : 'text-gray-600'}">
          ${evaluation.engagementGrowthRate > 0 ? '↑' : '→'} ${evaluation.engagementGrowthRate.toFixed(1)}% 伸び率
        </div>
      </div>
    </div>
  `;
  
  // チャート
  const chartsHtml = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-lg font-bold mb-4">エンゲージメント内訳</h4>
        <canvas id="x-engagement-chart"></canvas>
      </div>
      
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-lg font-bold mb-4">投稿活動</h4>
        <canvas id="x-activity-chart"></canvas>
      </div>
    </div>
  `;
  
  // 最近のツイートリスト
  const tweetsHtml = evaluation.recentTweets && evaluation.recentTweets.length > 0 ? `
    <div class="bg-white rounded-lg shadow p-6">
      <h4 class="text-lg font-bold mb-4">最近のツイート（最大10件）</h4>
      <div class="space-y-3">
        ${evaluation.recentTweets.slice(0, 10).map(tweet => `
          <div class="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition border border-gray-200">
            <p class="text-sm mb-2">${tweet.text}</p>
            <div class="flex items-center gap-4 text-xs text-gray-600">
              <span><i class="fas fa-retweet mr-1"></i>${tweet.publicMetrics.retweetCount}</span>
              <span><i class="fas fa-heart mr-1"></i>${tweet.publicMetrics.likeCount}</span>
              <span><i class="fas fa-comment mr-1"></i>${tweet.publicMetrics.replyCount}</span>
              <span><i class="fas fa-eye mr-1"></i>${tweet.publicMetrics.impressionCount}</span>
              <span class="ml-auto">${tweet.createdAt.substring(0, 10)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';
  
  section.innerHTML = overallGradeHtml + summaryHtml + chartsHtml + tweetsHtml;
  
  // チャートを描画
  renderXCharts(evaluation);
}

// Xチャートを描画
function renderXCharts(evaluation) {
  // エンゲージメント内訳チャート
  const engagementCtx = document.getElementById('x-engagement-chart');
  if (engagementCtx) {
    new Chart(engagementCtx, {
      type: 'pie',
      data: {
        labels: ['いいね', 'リツイート', 'リプライ'],
        datasets: [{
          data: [
            evaluation.totalLikes,
            evaluation.totalRetweets,
            evaluation.totalReplies
          ],
          backgroundColor: ['#EF4444', '#3B82F6', '#10B981'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }
  
  // 投稿活動チャート
  const activityCtx = document.getElementById('x-activity-chart');
  if (activityCtx) {
    new Chart(activityCtx, {
      type: 'bar',
      data: {
        labels: ['1日あたりの投稿', '1日あたりのフォロー', '週間企画投稿'],
        datasets: [{
          label: '実績',
          data: [
            evaluation.dailyTweetCount,
            evaluation.dailyFollows,
            evaluation.weeklyPlanningTweets
          ],
          backgroundColor: '#8B5CF6',
          borderWidth: 0
        }, {
          label: '目標',
          data: [2, 10, 2],
          backgroundColor: '#D1D5DB',
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true
          }
        },
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }
}

// ローディング表示
function showLoading(message) {
  const overlay = document.getElementById('loading-overlay');
  const text = document.getElementById('loading-text');
  text.textContent = message;
  overlay.classList.remove('hidden');
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.add('hidden');
}

// エラーメッセージ表示
function showError(message) {
  showToast(message, 'error');
}

// トースト通知
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
  };

  toast.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-md`;
  toast.innerHTML = `
    <div class="flex items-center">
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} mr-3"></i>
      <span>${message}</span>
    </div>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 5000);
}
