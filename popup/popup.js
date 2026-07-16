// Popup脚本
document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const toggleTranslateBtn = document.getElementById('toggle-translate');
  const toggleHighlightBtn = document.getElementById('toggle-highlight');
  const addToBlacklistBtn = document.getElementById('add-to-blacklist');
  const openWordbookBtn = document.getElementById('open-wordbook');
  const openOptionsBtn = document.getElementById('open-options');
  const openWordbookPageBtn = document.getElementById('open-wordbook-page');
  
  const translateStatus = document.getElementById('translate-status');
  const highlightStatus = document.getElementById('highlight-status');
  const wordCount = document.getElementById('word-count');
  
  // 加载配置
  loadConfig();
  
  // 加载生词本统计
  loadWordbookStats();
  
  // 事件监听
  toggleTranslateBtn.addEventListener('click', toggleTranslate);
  toggleHighlightBtn.addEventListener('click', toggleHighlight);
  addToBlacklistBtn.addEventListener('click', addToBlacklist);
  openWordbookBtn.addEventListener('click', openWordbook);
  openOptionsBtn.addEventListener('click', openOptions);
  openWordbookPageBtn.addEventListener('click', openWordbookPage);
  
  // 加载配置
  function loadConfig() {
    chrome.storage.local.get(['config'], (result) => {
      const config = result.config || {
        enabled: true,
        highlightEnabled: true
      };
      
      updateUI(config);
    });
  }
  
  // 更新UI
  function updateUI(config) {
    translateStatus.textContent = config.enabled ? '开启' : '关闭';
    highlightStatus.textContent = config.highlightEnabled ? '开启' : '关闭';
    
    toggleTranslateBtn.classList.toggle('active', config.enabled);
    toggleHighlightBtn.classList.toggle('active', config.highlightEnabled);
  }
  
  // 切换划词翻译
  function toggleTranslate() {
    chrome.storage.local.get(['config'], (result) => {
      const config = result.config || {
        enabled: true,
        highlightEnabled: true
      };
      
      config.enabled = !config.enabled;
      
      chrome.storage.local.set({ config }, () => {
        updateUI(config);
        
        // 通知content脚本
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'toggleTranslate',
              enabled: config.enabled
            });
          }
        });
      });
    });
  }
  
  // 切换生词高亮
  function toggleHighlight() {
    chrome.storage.local.get(['config'], (result) => {
      const config = result.config || {
        enabled: true,
        highlightEnabled: true
      };
      
      config.highlightEnabled = !config.highlightEnabled;
      
      chrome.storage.local.set({ config }, () => {
        updateUI(config);
        
        // 通知content脚本
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'toggleHighlight',
              enabled: config.highlightEnabled
            });
          }
        });
      });
    });
  }
  
  // 加入黑名单
  function addToBlacklist() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const url = new URL(tabs[0].url);
        const domain = url.hostname;
        
        chrome.runtime.sendMessage({
          action: 'addToBlacklist',
          domain: domain
        }, (response) => {
          if (response && response.success) {
            alert(`已将 ${domain} 加入黑名单`);
            addToBlacklistBtn.disabled = true;
            addToBlacklistBtn.textContent = '已加入黑名单';
          }
        });
      }
    });
  }
  
  // 打开生词本（小弹窗）
  function openWordbook() {
    chrome.tabs.create({ url: 'wordbook/wordbook.html' });
  }
  
  // 打开设置页面
  function openOptions() {
    chrome.tabs.create({ url: 'options/options.html' });
  }
  
  // 打开完整生词本页面
  function openWordbookPage() {
    chrome.tabs.create({ url: 'wordbook/wordbook.html' });
  }
  
  // 加载生词本统计
  function loadWordbookStats() {
    chrome.storage.local.get(['wordbook'], (result) => {
      const wordbook = result.wordbook || [];
      wordCount.textContent = wordbook.length;
    });
  }
});