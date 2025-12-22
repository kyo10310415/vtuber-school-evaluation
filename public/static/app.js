// WannaV成長度リザルトシステム - フロントエンド

let students = [];
let evaluationResults = [];
let currentStatusFilter = 'アクティブ'; // デフォルトはアクティブ

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  await loadStudents();
  setupEventListeners();
});

// 生徒一覧を読み込み
async function loadStudents() {
  try {
    showLoading('生徒情報を読み込み中...');
    const response = await fetch('/api/students');
    const data = await response.json();
    
    if (data.success) {
      students = data.students;
      renderStudentList(students, currentStatusFilter);
      hideLoading();
    } else {
      showError('生徒情報の読み込みに失敗しました');
    }
  } catch (error) {
    showError('エラー: ' + error.message);
  }
}

// 生徒一覧を表示
function renderStudentList(studentList, statusFilter = '全て') {
  const container = document.getElementById('student-list');
  
  // ステータスでフィルタリング
  let filteredStudents = studentList;
  if (statusFilter !== '全て') {
    filteredStudents = studentList.filter(student => student.status === statusFilter);
  }
  
  if (filteredStudents.length === 0) {
    container.innerHTML = `<p class="text-gray-500">「${statusFilter}」の生徒が見つかりません</p>`;
    return;
  }

  const html = filteredStudents.map(student => `
    <div class="bg-white rounded-lg shadow p-4 hover:shadow-md transition cursor-pointer student-card" data-student-id="${student.studentId}">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="font-bold text-lg text-blue-600 hover:text-blue-800 student-name">
            ${student.name}
          </h3>
          <p class="text-gray-600 text-sm">学籍番号: ${student.studentId}</p>
        </div>
        <div class="text-right">
          <span class="inline-block px-3 py-1 ${getStatusColor(student.status)} rounded-full text-sm">
            ${student.status || 'アクティブ'}
          </span>
        </div>
      </div>
      ${student.talkMemoFolderUrl ? `
        <a href="${student.talkMemoFolderUrl}" target="_blank" 
           class="text-blue-600 hover:text-blue-800 text-sm mt-2 inline-block"
           onclick="event.stopPropagation()">
          <i class="fas fa-folder"></i> トークメモフォルダ
        </a>
      ` : ''}
    </div>
  `).join('');

  container.innerHTML = html;
  
  // 生徒カードにクリックイベントを追加
  document.querySelectorAll('.student-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const studentId = card.dataset.studentId;
      showStudentHistory(studentId);
    });
  });
}

// ステータスの色を取得
function getStatusColor(status) {
  const colors = {
    'アクティブ': 'bg-green-100 text-green-800',
    'レッスン準備中': 'bg-blue-100 text-blue-800',
    '休会': 'bg-yellow-100 text-yellow-800',
    '正規退会': 'bg-gray-100 text-gray-800',
    '無断キャンセル': 'bg-red-100 text-red-800',
    'クーリングオフ': 'bg-orange-100 text-orange-800',
    '在籍中': 'bg-indigo-100 text-indigo-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

// 生徒の評価履歴を表示
async function showStudentHistory(studentId) {
  // 検索欄に学籍番号を設定
  document.getElementById('search-student-id').value = studentId;
  
  // 検索を実行
  await searchResults();
}

// イベントリスナー設定
function setupEventListeners() {
  // 採点実行ボタン
  document.getElementById('run-evaluation-btn').addEventListener('click', runEvaluation);
  
  // 結果検索ボタン
  document.getElementById('search-results-btn').addEventListener('click', searchResults);
  
  // Enterキーで検索
  document.getElementById('search-student-id').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      searchResults();
    }
  });
  
  // ステータスタブ
  document.querySelectorAll('.status-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const status = tab.dataset.status;
      currentStatusFilter = status;
      
      // タブのアクティブ状態を更新
      document.querySelectorAll('.status-tab').forEach(t => {
        t.classList.remove('border-purple-600', 'text-purple-600');
        t.classList.add('border-transparent', 'text-gray-600');
      });
      tab.classList.remove('border-transparent', 'text-gray-600');
      tab.classList.add('border-purple-600', 'text-purple-600');
      
      // 生徒一覧を再レンダリング
      renderStudentList(students, status);
    });
  });
}

// 採点を実行
async function runEvaluation() {
  const month = document.getElementById('evaluation-month').value;
  const studentIdsInput = document.getElementById('student-ids-input').value.trim();
  
  if (!month) {
    showError('評価対象月を選択してください');
    return;
  }

  const studentIds = studentIdsInput ? studentIdsInput.split(',').map(id => id.trim()).filter(id => id) : undefined;
  
  const targetText = studentIds && studentIds.length > 0 
    ? `${studentIds.length}名の生徒` 
    : '全生徒';

  if (!confirm(`${month}の${targetText}の採点を実行しますか？`)) {
    return;
  }

  try {
    showLoading('採点を実行中... この処理には数分かかる場合があります');
    
    const body = { month };
    if (studentIds && studentIds.length > 0) {
      body.studentIds = studentIds;
    }
    
    const response = await fetch('/api/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    hideLoading();

    if (data.success) {
      evaluationResults = data.results || [];
      showSuccess(`採点が完了しました！ ${data.message}`);
      renderResults(evaluationResults);
      
      if (data.errors && data.errors.length > 0) {
        showWarning('一部の生徒で処理エラーが発生しました：\n' + data.errors.join('\n'));
      }
    } else {
      showError('採点に失敗しました: ' + data.message);
    }
  } catch (error) {
    hideLoading();
    showError('エラー: ' + error.message);
  }
}

// 結果を表示
function renderResults(results) {
  const container = document.getElementById('evaluation-results');
  
  if (results.length === 0) {
    container.innerHTML = '<p class="text-gray-500">採点結果はありません</p>';
    return;
  }

  const html = results.map(result => {
    const gradeColor = {
      'S': 'bg-purple-100 text-purple-800',
      'A': 'bg-blue-100 text-blue-800',
      'B': 'bg-green-100 text-green-800',
      'C': 'bg-yellow-100 text-yellow-800',
      'D': 'bg-red-100 text-red-800',
    };

    return `
      <div class="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="font-bold text-xl">${result.studentName}</h3>
            <p class="text-gray-600">学籍番号: ${result.studentId}</p>
          </div>
          <div class="text-center">
            <div class="text-sm text-gray-600 mb-1">総合評価</div>
            <span class="inline-block px-6 py-3 ${gradeColor[result.overallGrade]} rounded-lg text-2xl font-bold">
              ${result.overallGrade}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div class="text-center p-3 bg-gray-50 rounded">
            <div class="text-xs text-gray-600 mb-1">欠席</div>
            <span class="inline-block px-3 py-1 ${gradeColor[result.scores.absence]} rounded font-bold">
              ${result.scores.absence}
            </span>
          </div>
          <div class="text-center p-3 bg-gray-50 rounded">
            <div class="text-xs text-gray-600 mb-1">遅刻</div>
            <span class="inline-block px-3 py-1 ${gradeColor[result.scores.lateness]} rounded font-bold">
              ${result.scores.lateness}
            </span>
          </div>
          <div class="text-center p-3 bg-gray-50 rounded">
            <div class="text-xs text-gray-600 mb-1">ミッション</div>
            <span class="inline-block px-3 py-1 ${gradeColor[result.scores.mission]} rounded font-bold">
              ${result.scores.mission}
            </span>
          </div>
          <div class="text-center p-3 bg-gray-50 rounded">
            <div class="text-xs text-gray-600 mb-1">支払い</div>
            <span class="inline-block px-3 py-1 ${gradeColor[result.scores.payment]} rounded font-bold">
              ${result.scores.payment}
            </span>
          </div>
          <div class="text-center p-3 bg-gray-50 rounded">
            <div class="text-xs text-gray-600 mb-1">傾聴力</div>
            <span class="inline-block px-3 py-1 ${gradeColor[result.scores.activeListening]} rounded font-bold">
              ${result.scores.activeListening}
            </span>
          </div>
          <div class="text-center p-3 bg-gray-50 rounded">
            <div class="text-xs text-gray-600 mb-1">理解度</div>
            <span class="inline-block px-3 py-1 ${gradeColor[result.scores.comprehension]} rounded font-bold">
              ${result.scores.comprehension}
            </span>
          </div>
        </div>

        ${result.comments ? `
          <div class="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div class="text-sm font-semibold text-blue-900 mb-2">
              <i class="fas fa-comment-alt"></i> 評価コメント
            </div>
            <p class="text-sm text-gray-700 whitespace-pre-line">${result.comments}</p>
          </div>
        ` : ''}

        <div class="mt-3 text-xs text-gray-500 text-right">
          評価日時: ${new Date(result.evaluatedAt).toLocaleString('ja-JP')}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

// 結果を検索
async function searchResults() {
  const studentId = document.getElementById('search-student-id').value.trim();
  
  if (!studentId) {
    showError('学籍番号を入力してください');
    return;
  }

  try {
    showLoading('評価結果を検索中...');
    
    const response = await fetch(`/api/results/${encodeURIComponent(studentId)}`);
    const data = await response.json();
    hideLoading();

    if (data.success) {
      if (data.count === 0) {
        showWarning(`学籍番号「${studentId}」の評価結果が見つかりませんでした`);
        document.getElementById('search-results-section').classList.add('hidden');
      } else {
        showSuccess(`${data.count}件の評価結果が見つかりました`);
        renderSearchResults(data.results, studentId);
        document.getElementById('search-results-section').classList.remove('hidden');
        
        // 結果表示位置にスクロール
        document.getElementById('search-results-section').scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      showError('検索に失敗しました: ' + data.message);
    }
  } catch (error) {
    hideLoading();
    showError('エラー: ' + error.message);
  }
}

// 検索結果を表示
function renderSearchResults(results, studentId) {
  const titleElement = document.getElementById('search-results-title');
  const container = document.getElementById('search-results-list');
  
  // 生徒名を取得（最初の結果から）
  const studentName = results[0]['氏名'] || '';
  titleElement.textContent = `${studentName}（${studentId}）の評価履歴`;
  
  const gradeColor = {
    'S': 'bg-purple-100 text-purple-800',
    'A': 'bg-blue-100 text-blue-800',
    'B': 'bg-green-100 text-green-800',
    'C': 'bg-yellow-100 text-yellow-800',
    'D': 'bg-red-100 text-red-800',
  };

  const html = results.map(result => {
    const month = result['評価月'] || '-';
    const overallGrade = result['総合評価'] || '-';
    const absence = result['欠席'] || '-';
    const lateness = result['遅刻'] || '-';
    const mission = result['ミッション'] || '-';
    const payment = result['支払い'] || '-';
    const activeListening = result['アクティブリスニング'] || '-';
    const comprehension = result['理解度'] || '-';
    const comments = result['コメント'] || '';
    const evaluatedAt = result['評価日時'] || '';

    return `
      <div class="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-500 hover:shadow-lg transition">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl font-bold text-purple-600">${month}</span>
            <div class="text-center">
              <div class="text-xs text-gray-600 mb-1">総合評価</div>
              <span class="inline-block px-4 py-2 ${gradeColor[overallGrade]} rounded-lg text-xl font-bold">
                ${overallGrade}
              </span>
            </div>
          </div>
          <div class="text-xs text-gray-500">
            ${evaluatedAt ? new Date(evaluatedAt).toLocaleString('ja-JP') : ''}
          </div>
        </div>

        <div class="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
          <div class="text-center p-2 bg-gray-50 rounded">
            <div class="text-xs text-gray-600 mb-1">欠席</div>
            <span class="inline-block px-2 py-1 ${gradeColor[absence]} rounded text-sm font-bold">
              ${absence}
            </span>
          </div>
          <div class="text-center p-2 bg-gray-50 rounded">
            <div class="text-xs text-gray-600 mb-1">遅刻</div>
            <span class="inline-block px-2 py-1 ${gradeColor[lateness]} rounded text-sm font-bold">
              ${lateness}
            </span>
          </div>
          <div class="text-center p-2 bg-gray-50 rounded">
            <div class="text-xs text-gray-600 mb-1">ミッション</div>
            <span class="inline-block px-2 py-1 ${gradeColor[mission]} rounded text-sm font-bold">
              ${mission}
            </span>
          </div>
          <div class="text-center p-2 bg-gray-50 rounded">
            <div class="text-xs text-gray-600 mb-1">支払い</div>
            <span class="inline-block px-2 py-1 ${gradeColor[payment]} rounded text-sm font-bold">
              ${payment}
            </span>
          </div>
          <div class="text-center p-2 bg-gray-50 rounded">
            <div class="text-xs text-gray-600 mb-1">傾聴力</div>
            <span class="inline-block px-2 py-1 ${gradeColor[activeListening]} rounded text-sm font-bold">
              ${activeListening}
            </span>
          </div>
          <div class="text-center p-2 bg-gray-50 rounded">
            <div class="text-xs text-gray-600 mb-1">理解度</div>
            <span class="inline-block px-2 py-1 ${gradeColor[comprehension]} rounded text-sm font-bold">
              ${comprehension}
            </span>
          </div>
        </div>

        ${comments ? `
          <div class="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div class="text-xs font-semibold text-blue-900 mb-1">
              <i class="fas fa-comment-alt"></i> 評価コメント
            </div>
            <p class="text-sm text-gray-700 whitespace-pre-line">${comments}</p>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  container.innerHTML = html;
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

// 成功メッセージ表示
function showSuccess(message) {
  showToast(message, 'success');
}

// エラーメッセージ表示
function showError(message) {
  showToast(message, 'error');
  hideLoading();
}

// 警告メッセージ表示
function showWarning(message) {
  showToast(message, 'warning');
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
