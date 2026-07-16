// 生词本页面脚本
document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const selectAllBtn = document.getElementById('select-all-btn');
  const deleteSelectedBtn = document.getElementById('delete-selected-btn');
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const reviewBtn = document.getElementById('review-btn');
  const wordbookList = document.getElementById('wordbook-list');
  const pagination = document.getElementById('pagination');
  const totalCount = document.getElementById('total-count');
  const reviewedCount = document.getElementById('reviewed-count');
  const importFile = document.getElementById('import-file');
  
  // 复习模式相关
  const reviewModal = document.getElementById('review-modal');
  const closeModal = document.getElementById('close-modal');
  const reviewWord = document.getElementById('review-word');
  const reviewTranslation = document.getElementById('review-translation');
  const showTranslationBtn = document.getElementById('show-translation-btn');
  const markKnownBtn = document.getElementById('mark-known');
  const markUnknownBtn = document.getElementById('mark-unknown');
  const reviewProgress = document.getElementById('review-progress');
  
  // 状态
  let wordbook = [];
  let filteredWordbook = [];
  let currentPage = 1;
  const itemsPerPage = 20;
  let selectedWords = new Set();
  let reviewIndex = 0;
  
  // 初始化
  loadWordbook();
  
  // 事件监听
  searchInput.addEventListener('input', filterWordbook);
  searchBtn.addEventListener('click', filterWordbook);
  selectAllBtn.addEventListener('click', selectAll);
  deleteSelectedBtn.addEventListener('click', deleteSelected);
  exportBtn.addEventListener('click', exportWordbook);
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', importWordbook);
  reviewBtn.addEventListener('click', startReview);
  closeModal.addEventListener('click', closeReviewModal);
  showTranslationBtn.addEventListener('click', showTranslation);
  markKnownBtn.addEventListener('click', () => markWord(true));
  markUnknownBtn.addEventListener('click', () => markWord(false));
  
  // 加载生词本
  function loadWordbook() {
    chrome.storage.local.get(['wordbook'], (result) => {
      wordbook = result.wordbook || [];
      filteredWordbook = [...wordbook];
      updateStats();
      renderWordbook();
    });
  }
  
  // 更新统计
  function updateStats() {
    totalCount.textContent = wordbook.length;
    reviewedCount.textContent = wordbook.filter(item => item.reviewed).length;
  }
  
  // 渲染生词本
  function renderWordbook() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = filteredWordbook.slice(startIndex, endIndex);
    
    wordbookList.innerHTML = '';
    wordbookList.className = 'wordbook-grid';
    
    if (pageItems.length === 0) {
      wordbookList.innerHTML = `
        <div class="empty-message">
          <div class="empty-icon">📚</div>
          <div>暂无生词</div>
        </div>
      `;
      return;
    }
    
    pageItems.forEach((item, index) => {
      const globalIndex = startIndex + index;
      const isSelected = selectedWords.has(globalIndex);
      
      const card = document.createElement('div');
      card.className = `word-card ${isSelected ? 'selected' : ''} ${item.reviewed ? 'reviewed' : ''}`;
      card.innerHTML = `
        <div class="word-card-checkbox">
          <input type="checkbox" ${isSelected ? 'checked' : ''} data-index="${globalIndex}">
        </div>
        <div class="word-card-actions">
          <button class="card-action-btn query-btn" data-word="${item.word}" title="查询释义">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="M21 21l-4.35-4.35"></path>
            </svg>
          </button>
          <button class="card-action-btn delete" data-index="${globalIndex}" title="删除">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18"></path>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
        <div class="word-card-word">${escapeHtml(item.word)}</div>
        <div class="word-card-translation">${escapeHtml(item.translation)}</div>
        <div class="word-card-meta">
          <span class="meta-item">${formatTime(item.addTime)}</span>
          <span class="meta-item">出现 ${item.count} 次</span>
          ${item.reviewed ? '<span class="reviewed-badge">✓ 已复习</span>' : ''}
        </div>
      `;
      wordbookList.appendChild(card);
    });
    
    // 添加事件监听
    document.querySelectorAll('.word-card-checkbox input').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        if (e.target.checked) {
          selectedWords.add(index);
          e.target.closest('.word-card').classList.add('selected');
        } else {
          selectedWords.delete(index);
          e.target.closest('.word-card').classList.remove('selected');
        }
      });
    });
    
    document.querySelectorAll('.query-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const word = btn.dataset.word;
        queryWord(word);
      });
    });
    
    document.querySelectorAll('.card-action-btn.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        deleteWord(index);
      });
    });
    
    renderPagination();
  }
  
  // HTML转义
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // 渲染分页
  function renderPagination() {
    const totalPages = Math.ceil(filteredWordbook.length / itemsPerPage);
    
    if (totalPages <= 1) {
      pagination.innerHTML = '';
      return;
    }
    
    let html = '';
    
    // 上一页
    html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">上一页</button>`;
    
    // 页码
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
      } else if (i === currentPage - 3 || i === currentPage + 3) {
        html += `<span class="page-ellipsis">...</span>`;
      }
    }
    
    // 下一页
    html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">下一页</button>`;
    
    pagination.innerHTML = html;
    
    // 添加事件监听
    document.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const page = parseInt(e.target.dataset.page);
        if (page && page !== currentPage) {
          currentPage = page;
          renderWordbook();
        }
      });
    });
  }
  
  // 格式化时间
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  
  // 过滤生词
  function filterWordbook() {
    const keyword = searchInput.value.trim().toLowerCase();
    
    if (!keyword) {
      filteredWordbook = [...wordbook];
    } else {
      filteredWordbook = wordbook.filter(item => 
        item.word.toLowerCase().includes(keyword) || 
        item.translation.toLowerCase().includes(keyword)
      );
    }
    
    currentPage = 1;
    selectedWords.clear();
    renderWordbook();
  }
  
  // 全选
  function selectAll() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredWordbook.length);
    
    for (let i = startIndex; i < endIndex; i++) {
      selectedWords.add(i);
    }
    
    renderWordbook();
  }
  
  // 删除选中
  function deleteSelected() {
    if (selectedWords.size === 0) {
      alert('请先选择要删除的生词');
      return;
    }
    
    if (!confirm(`确定要删除 ${selectedWords.size} 个生词吗？`)) {
      return;
    }
    
    const indices = Array.from(selectedWords).sort((a, b) => b - a);
    
    indices.forEach(index => {
      wordbook.splice(index, 1);
    });
    
    chrome.storage.local.set({ wordbook }, () => {
      selectedWords.clear();
      filteredWordbook = [...wordbook];
      updateStats();
      renderWordbook();
    });
  }
  
  // 删除单个单词
  function deleteWord(index) {
    if (!confirm('确定要删除这个生词吗？')) {
      return;
    }
    
    wordbook.splice(index, 1);
    
    chrome.storage.local.set({ wordbook }, () => {
      filteredWordbook = [...wordbook];
      updateStats();
      renderWordbook();
    });
  }
  
  // 查询单词
  function queryWord(word) {
    chrome.runtime.sendMessage({
      action: 'translate',
      text: word
    }, (response) => {
      if (response && response.success) {
        alert(`${word}: ${response.translation}`);
      } else {
        alert('查询失败');
      }
    });
  }
  
  // 导出生词本
  function exportWordbook() {
    if (wordbook.length === 0) {
      alert('生词本为空');
      return;
    }
    
    const dataStr = JSON.stringify(wordbook, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `wordbook_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }
  
  // 导入生词本
  function importWordbook(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedWordbook = JSON.parse(event.target.result);
        
        if (!Array.isArray(importedWordbook)) {
          throw new Error('无效的生词本格式');
        }
        
        // 合并生词本（避免重复）
        importedWordbook.forEach(item => {
          if (!wordbook.some(existing => existing.word === item.word)) {
            wordbook.push(item);
          }
        });
        
        chrome.storage.local.set({ wordbook }, () => {
          filteredWordbook = [...wordbook];
          updateStats();
          renderWordbook();
          alert(`成功导入 ${importedWordbook.length} 个生词`);
          importFile.value = '';
        });
      } catch (error) {
        alert('导入失败：文件格式错误');
        importFile.value = '';
      }
    };
    
    reader.readAsText(file);
  }
  
  // 开始复习
  function startReview() {
    if (wordbook.length === 0) {
      alert('生词本为空');
      return;
    }
    
    reviewIndex = 0;
    reviewModal.style.display = 'flex';
    showReviewWord();
  }
  
  // 显示复习单词
  function showReviewWord() {
    if (reviewIndex >= wordbook.length) {
      alert('复习完成！');
      closeReviewModal();
      return;
    }
    
    const item = wordbook[reviewIndex];
    reviewWord.textContent = item.word;
    reviewTranslation.textContent = item.translation;
    reviewTranslation.style.display = 'none';
    showTranslationBtn.style.display = 'block';
    reviewProgress.textContent = `${reviewIndex + 1} / ${wordbook.length}`;
  }
  
  // 显示释义
  function showTranslation() {
    reviewTranslation.style.display = 'block';
    showTranslationBtn.style.display = 'none';
  }
  
  // 标记单词
  function markWord(known) {
    wordbook[reviewIndex].reviewed = known;
    
    chrome.storage.local.set({ wordbook }, () => {
      updateStats();
      reviewIndex++;
      showReviewWord();
    });
  }
  
  // 关闭复习模态框
  function closeReviewModal() {
    reviewModal.style.display = 'none';
  }
});