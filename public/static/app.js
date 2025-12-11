// VTuberスクール成長度リザルトシステム - フロントエンド

let students = [];
let evaluationResults = [];

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
      renderStudentList(students);
      hideLoading();
    } else {
      showError('生徒情報の読み込みに失敗しました');
    }
  } catch (error) {
    showError('エラー: ' + error.message);
  }
}

// 生徒一覧を表示
function renderStudentList(studentList) {
  const container = document.getElementById('student-list');
  
  if (studentList.length === 0) {
    container.innerHTML = '<p class="text-gray-500">生徒が登録されていません</p>';
    return;
  }

  const html = studentList.map(student => `
    <div class="bg-white rounded-lg shadow p-4 hover:shadow-md transition">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="font-bold text-lg">${student.name}</h3>
          <p class="text-gray-600 text-sm">学籍番号: ${student.studentId}</p>
        </div>
        <div class="text-right">
          <span class="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
            ${student.status || '在籍中'}
          </span>
        </div>
      </div>
      ${student.talkMemoFolderUrl ? `
        <a href="${student.talkMemoFolderUrl}" target="_blank" 
           class="text-blue-600 hover:text-blue-800 text-sm mt-2 inline-block">
          <i class="fas fa-folder"></i> トークメモフォルダ
        </a>
      ` : ''}
    </div>
  `).join('');

  container.innerHTML = html;
}

// イベントリスナー設定
function setupEventListeners() {
  // 採点実行ボタン
  document.getElementById('run-evaluation-btn').addEventListener('click', runEvaluation);
}

// 採点を実行
async function runEvaluation() {
  const month = document.getElementById('evaluation-month').value;
  
  if (!month) {
    showError('評価対象月を選択してください');
    return;
  }

  if (!confirm(`${month}の採点を実行しますか？`)) {
    return;
  }

  try {
    showLoading('採点を実行中... この処理には数分かかる場合があります');
    
    const response = await fetch('/api/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ month }),
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
