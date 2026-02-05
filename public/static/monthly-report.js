// 月次レポート画面 - 複数月の比較

let currentStudentId = null;
let reportData = null;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  // URLパラメータから学籍番号を取得
  const params = new URLSearchParams(window.location.search);
  currentStudentId = params.get('studentId');
  
  if (currentStudentId) {
    document.getElementById('student-id-input').value = currentStudentId;
  }
  
  // デフォルトで直近3ヶ月を設定
  const months = getRecentMonths(3);
  document.getElementById('months-input').value = months.join(',');
  
  setupEventListeners();
  
  // 学籍番号があれば自動読み込み
  if (currentStudentId) {
    loadMonthlyReport();
  }
});

// 直近N ヶ月のリストを取得（前月まで）
function getRecentMonths(n) {
  const months = [];
  const now = new Date();
  // 前月から数える
  const startMonth = now.getMonth() - 1; // 0-indexed
  
  for (let i = 0; i < n; i++) {
    const targetMonth = startMonth - i;
    let year = now.getFullYear();
    let month = targetMonth;
    
    // 年を跨ぐ場合の調整
    if (month < 0) {
      year += Math.floor(month / 12);
      month = 12 + (month % 12);
    }
    
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    months.push(monthStr);
  }
  
  return months.reverse(); // 古い順に並び替え
}

// プロレベルセクション比較を描画
function renderProLevelComparison() {
  const section = document.getElementById('prolevel-comparison-section');
  
  // デバッグ: プロレベルデータをログ出力
  console.log('[プロレベル描画] reportData.report:', reportData.report);
  reportData.report.forEach((r, i) => {
    console.log(`[プロレベル描画] [${i}] 月: ${r.month}, proLevel:`, r.proLevel);
  });
  
  // データ抽出
  const months = reportData.report.map(r => r.month);
  const totalGrades = reportData.report.map(r => {
    const proLevel = r.proLevel;
    if (!proLevel) return null;
    
    // 総合評価をポイント化（S=5, A=4, B=3, C=2, D=1）
    const gradeMap = { 'S': 5, 'A': 4, 'B': 3, 'C': 2, 'D': 1 };
    return gradeMap[proLevel['総合評価']] || 0;
  });
  
  const hasProLevelData = reportData.report.some(r => r.proLevel);
  
  if (!hasProLevelData) {
    section.innerHTML = '<p class="text-gray-500 text-center py-8">プロレベルセクションのデータがありません</p>';
    return;
  }
  
  const chartsHtml = `
    <div class="mb-8">
      <h3 class="text-2xl font-bold mb-4 text-gray-800">
        <i class="fas fa-graduation-cap mr-2 text-purple-600"></i>
        プロレベルセクション 評価推移
      </h3>
      
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h4 class="text-lg font-bold mb-4">総合評価の推移</h4>
        <canvas id="prolevel-grade-chart"></canvas>
      </div>
      
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-lg font-bold mb-4">詳細評価</h4>
        <div class="overflow-x-auto">
          <table class="min-w-full">
            <thead class="bg-gray-100">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">評価月</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">総合評価</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">欠席・遅刻</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">ミッション</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">支払い</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">傾聴力</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">理解度</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              ${reportData.report.map(r => {
                const p = r.proLevel;
                if (!p) return `
                  <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 whitespace-nowrap font-semibold text-purple-600">${r.month}</td>
                    <td colspan="6" class="px-4 py-3 text-gray-400 text-center">データなし</td>
                  </tr>
                `;
                
                return `
                  <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 whitespace-nowrap font-semibold text-purple-600">${r.month}</td>
                    <td class="px-4 py-3 whitespace-nowrap">
                      <span class="px-3 py-1 rounded-full text-sm font-bold ${getGradeBadgeClass(p['総合評価'])}">
                        ${p['総合評価'] || '-'}
                      </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                      <span class="px-2 py-1 rounded text-sm ${getGradeBadgeClass(p['欠席・遅刻評価'])}">
                        ${p['欠席・遅刻評価'] || '-'}
                      </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                      <span class="px-2 py-1 rounded text-sm ${getGradeBadgeClass(p['ミッション評価'])}">
                        ${p['ミッション評価'] || '-'}
                      </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                      <span class="px-2 py-1 rounded text-sm ${getGradeBadgeClass(p['支払い評価'])}">
                        ${p['支払い評価'] || '-'}
                      </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                      <span class="px-2 py-1 rounded text-sm ${getGradeBadgeClass(p['傾聴力評価'])}">
                        ${p['傾聴力評価'] || '-'}
                      </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                      <span class="px-2 py-1 rounded text-sm ${getGradeBadgeClass(p['理解度評価'])}">
                        ${p['理解度評価'] || '-'}
                      </span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  
  section.innerHTML = chartsHtml;
  
  // 総合評価チャート
  new Chart(document.getElementById('prolevel-grade-chart'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: '総合評価',
        data: totalGrades,
        borderColor: '#8B5CF6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 6,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          beginAtZero: false,
          min: 0,
          max: 5,
          ticks: {
            stepSize: 1,
            callback: function(value) {
              const gradeLabels = ['', 'D', 'C', 'B', 'A', 'S'];
              return gradeLabels[value];
            }
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const gradeLabels = ['', 'D', 'C', 'B', 'A', 'S'];
              return '総合評価: ' + gradeLabels[context.parsed.y];
            }
          }
        }
      }
    }
  });
}

// 評価グレードのバッジクラスを取得
function getGradeBadgeClass(grade) {
  const gradeColors = {
    'S': 'bg-purple-600 text-white',
    'A': 'bg-blue-500 text-white',
    'B': 'bg-green-500 text-white',
    'C': 'bg-yellow-500 text-white',
    'D': 'bg-red-500 text-white'
  };
  return gradeColors[grade] || 'bg-gray-300 text-gray-700';
}

// イベントリスナー設定
function setupEventListeners() {
  document.getElementById('load-btn').addEventListener('click', loadMonthlyReport);
  document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = '/';
  });
  
  // ナビゲーションボタン（レポートセクション内）
  const backToHomeFromReportBtn = document.getElementById('back-to-home-from-report-btn');
  const goToDetailFromReportBtn = document.getElementById('go-to-detail-from-report-btn');
  
  if (backToHomeFromReportBtn) {
    backToHomeFromReportBtn.addEventListener('click', () => {
      window.location.href = '/';
    });
  }
  
  if (goToDetailFromReportBtn) {
    goToDetailFromReportBtn.addEventListener('click', () => {
      if (currentStudentId) {
        // 前月を取得
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-11
        const previousMonth = month === 0 ? `${year - 1}-12` : `${year}-${String(month).padStart(2, '0')}`;
        window.location.href = `/evaluation-detail?studentId=${currentStudentId}&month=${previousMonth}`;
      } else {
        alert('学籍番号が設定されていません');
      }
    });
  }
  
  // 期間選択ドロップダウン
  const monthsSelect = document.getElementById('months-select');
  const customMonthsContainer = document.getElementById('custom-months-input-container');
  
  if (monthsSelect) {
    monthsSelect.addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        customMonthsContainer?.classList.remove('hidden');
      } else {
        customMonthsContainer?.classList.add('hidden');
        
        // 自動的に月リストを生成
        const numMonths = parseInt(e.target.value);
        const months = getRecentMonths(numMonths);
        document.getElementById('months-input').value = months.join(',');
      }
    });
    
    // 初期値を設定
    monthsSelect.value = '3';
    const months = getRecentMonths(3);
    document.getElementById('months-input').value = months.join(',');
  }
}

// 月次レポートを読み込み
async function loadMonthlyReport() {
  currentStudentId = document.getElementById('student-id-input').value.trim();
  const monthsInput = document.getElementById('months-input').value.trim();
  
  if (!currentStudentId) {
    showError('学籍番号を入力してください');
    return;
  }
  
  if (!monthsInput) {
    showError('評価月を入力してください（カンマ区切り）');
    return;
  }
  
  try {
    showLoading('月次レポートを読み込み中...');
    
    const response = await fetch(`/api/monthly-report/${currentStudentId}?months=${encodeURIComponent(monthsInput)}`);
    const result = await response.json();
    
    hideLoading();
    
    if (!result.success) {
      showError('月次レポートの取得に失敗しました: ' + result.error);
      return;
    }
    
    reportData = result;
    
    // デバッグ: レスポンスデータをログ出力
    console.log('[月次レポート] 取得データ:', JSON.stringify(result, null, 2));
    
    // 画面を表示
    document.getElementById('loading-section').classList.add('hidden');
    document.getElementById('report-section').classList.remove('hidden');
    
    // データを表示
    renderMonthlyReport();
    
  } catch (error) {
    hideLoading();
    showError('エラー: ' + error.message);
  }
}

// 月次レポートを表示
function renderMonthlyReport() {
  // ヘッダー情報を表示
  document.getElementById('student-name').textContent = reportData.studentName;
  document.getElementById('display-student-id').textContent = reportData.studentId;
  
  // プロレベルセクション比較
  renderProLevelComparison();
  
  // YouTube比較チャート
  renderYouTubeComparisonCharts();
  
  // X比較チャート
  renderXComparisonCharts();
  
  // 詳細テーブル
  renderDetailTable();
}

// YouTube比較チャートを描画
function renderYouTubeComparisonCharts() {
  const section = document.getElementById('youtube-comparison-section');
  
  // データ抽出
  const months = reportData.report.map(r => r.month);
  const subscribers = reportData.report.map(r => r.youtube?.subscriberCount || 0);
  const views = reportData.report.map(r => r.youtube?.totalViews || 0);
  const videos = reportData.report.map(r => r.youtube?.videosInMonth || 0);
  const avgDuration = reportData.report.map(r => r.youtube?.averageStreamDuration || 0);
  const engagement = reportData.report.map(r => r.youtube?.engagementRate || 0);
  
  const chartsHtml = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-lg font-bold mb-4">登録者数の推移</h4>
        <canvas id="youtube-subscribers-chart"></canvas>
      </div>
      
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-lg font-bold mb-4">再生回数の推移</h4>
        <canvas id="youtube-views-chart"></canvas>
      </div>
      
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-lg font-bold mb-4">月間動画数の推移</h4>
        <canvas id="youtube-videos-chart"></canvas>
      </div>
      
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-lg font-bold mb-4">平均配信時間の推移</h4>
        <canvas id="youtube-duration-chart"></canvas>
      </div>
      
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-lg font-bold mb-4">エンゲージメント率の推移</h4>
        <canvas id="youtube-engagement-chart"></canvas>
      </div>
    </div>
  `;
  
  section.innerHTML = chartsHtml;
  
  // 登録者数チャート
  new Chart(document.getElementById('youtube-subscribers-chart'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: '登録者数',
        data: subscribers,
        borderColor: '#EF4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          beginAtZero: false
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
  
  // 再生回数チャート
  new Chart(document.getElementById('youtube-views-chart'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: '再生回数',
        data: views,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
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
          display: false
        }
      }
    }
  });
  
  // 月間動画数チャート
  new Chart(document.getElementById('youtube-videos-chart'), {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: '動画数',
        data: videos,
        backgroundColor: '#8B5CF6',
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
          display: false
        }
      }
    }
  });
  
  // 平均配信時間チャート
  new Chart(document.getElementById('youtube-duration-chart'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: '平均配信時間（分）',
        data: avgDuration,
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4
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
          display: false
        }
      }
    }
  });
  
  // エンゲージメント率チャート
  new Chart(document.getElementById('youtube-engagement-chart'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'エンゲージメント率（%）',
        data: engagement,
        borderColor: '#F59E0B',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.4
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
          display: false
        }
      }
    }
  });
}

// X比較チャートを描画
function renderXComparisonCharts() {
  const section = document.getElementById('x-comparison-section');
  
  // データ抽出
  const months = reportData.report.map(r => r.month);
  const followers = reportData.report.map(r => r.x?.followersCount || 0);
  const tweets = reportData.report.map(r => r.x?.tweetsInMonth || 0);
  const impressions = reportData.report.map(r => r.x?.totalImpressions || 0);
  const engagement = reportData.report.map(r => r.x?.engagementRate || 0);
  
  const chartsHtml = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-lg font-bold mb-4">フォロワー数の推移</h4>
        <canvas id="x-followers-chart"></canvas>
      </div>
      
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-lg font-bold mb-4">月間投稿数の推移</h4>
        <canvas id="x-tweets-chart"></canvas>
      </div>
      
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-lg font-bold mb-4">インプレッション数の推移</h4>
        <canvas id="x-impressions-chart"></canvas>
      </div>
      
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-lg font-bold mb-4">エンゲージメント率の推移</h4>
        <canvas id="x-engagement-chart"></canvas>
      </div>
    </div>
  `;
  
  section.innerHTML = chartsHtml;
  
  // フォロワー数チャート
  new Chart(document.getElementById('x-followers-chart'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'フォロワー数',
        data: followers,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          beginAtZero: false
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
  
  // 月間投稿数チャート
  new Chart(document.getElementById('x-tweets-chart'), {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: '投稿数',
        data: tweets,
        backgroundColor: '#8B5CF6',
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
          display: false
        }
      }
    }
  });
  
  // インプレッション数チャート
  new Chart(document.getElementById('x-impressions-chart'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'インプレッション数',
        data: impressions,
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4
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
          display: false
        }
      }
    }
  });
  
  // エンゲージメント率チャート
  new Chart(document.getElementById('x-engagement-chart'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'エンゲージメント率（%）',
        data: engagement,
        borderColor: '#F59E0B',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.4
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
          display: false
        }
      }
    }
  });
}

// 詳細テーブルを表示
function renderDetailTable() {
  const section = document.getElementById('detail-table-section');
  
  const tableHtml = `
    <div class="overflow-x-auto">
      <table class="min-w-full bg-white">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">評価月</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">YouTube登録者数</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">YouTube動画数</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Xフォロワー数</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">X投稿数</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">詳細</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          ${reportData.report.map(r => `
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3 whitespace-nowrap font-semibold text-purple-600">${r.month}</td>
              <td class="px-4 py-3 whitespace-nowrap">${r.youtube?.subscriberCount?.toLocaleString() || '-'}</td>
              <td class="px-4 py-3 whitespace-nowrap">${r.youtube?.videosInMonth || '-'}</td>
              <td class="px-4 py-3 whitespace-nowrap">${r.x?.followersCount?.toLocaleString() || '-'}</td>
              <td class="px-4 py-3 whitespace-nowrap">${r.x?.tweetsInMonth || '-'}</td>
              <td class="px-4 py-3 whitespace-nowrap">
                <a href="/evaluation-detail?studentId=${reportData.studentId}&month=${r.month}" 
                   class="text-blue-600 hover:text-blue-800 font-semibold">
                  <i class="fas fa-external-link-alt mr-1"></i>詳細を見る
                </a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  
  section.innerHTML = tableHtml;
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
