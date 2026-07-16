// 设置页面脚本
document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const enableTranslate = document.getElementById('enable-translate');
  const translateDelay = document.getElementById('translate-delay');
  const delayValue = document.getElementById('delay-value');
  const fontSize = document.getElementById('font-size');
  const enableHighlight = document.getElementById('enable-highlight');
  const highlightColor = document.getElementById('highlight-color');
  const enableUnderline = document.getElementById('enable-underline');
  const apiSelect = document.getElementById('api-select');
  const baiduAppid = document.getElementById('baidu-appid');
  const baiduKey = document.getElementById('baidu-key');
  const llmApiKey = document.getElementById('llm-api-key');
  const newBlacklistDomain = document.getElementById('new-blacklist-domain');
  const addBlacklistBtn = document.getElementById('add-blacklist-btn');
  const blacklistList = document.getElementById('blacklist-list');
  const exportWordbookBtn = document.getElementById('export-wordbook');
  const importWordbookBtn = document.getElementById('import-wordbook');
  const importFile = document.getElementById('import-file');
  const clearCacheBtn = document.getElementById('clear-cache');
  const clearWordbookBtn = document.getElementById('clear-wordbook');
  const saveSettingsBtn = document.getElementById('save-settings');
  const resetSettingsBtn = document.getElementById('reset-settings');
  
  // 加载当前设置
  loadSettings();
  
  // 加载黑名单
  loadBlacklist();
  
  // 事件监听
  translateDelay.addEventListener('input', updateDelayValue);
  apiSelect.addEventListener('change', toggleApiConfig);
  addBlacklistBtn.addEventListener('click', addBlacklist);
  exportWordbookBtn.addEventListener('click', exportWordbook);
  importWordbookBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', importWordbook);
  clearCacheBtn.addEventListener('click', clearCache);
  clearWordbookBtn.addEventListener('click', clearWordbook);
  saveSettingsBtn.addEventListener('click', saveSettings);
  resetSettingsBtn.addEventListener('click', resetSettings);
  
  // 更新延迟值显示
  function updateDelayValue() {
    delayValue.textContent = `${translateDelay.value}ms`;
  }
  
  // 切换API配置显示
  function toggleApiConfig() {
    const api = apiSelect.value;
    const baiduAppidItem = document.querySelector('.baidu-appid-item');
    const baiduKeyItem = document.querySelector('.baidu-key-item');
    const llmApikeyItem = document.querySelector('.llm-apikey-item');
    
    // 隐藏所有配置
    baiduAppidItem.style.display = 'none';
    baiduKeyItem.style.display = 'none';
    llmApikeyItem.style.display = 'none';
    
    // 根据选择显示对应配置
    if (api === 'baidu') {
      // 通用翻译：显示 App ID 和密钥
      baiduAppidItem.style.display = 'flex';
      baiduKeyItem.style.display = 'flex';
    } else if (api === 'baidu_llm') {
      // 大模型翻译：显示 App ID 和 API Key
      baiduAppidItem.style.display = 'flex';
      llmApikeyItem.style.display = 'flex';
    }
  }
  
  // 加载设置
  function loadSettings() {
    chrome.storage.local.get(['config', 'baiduConfig', 'baiduLlmConfig'], (result) => {
      const config = result.config || {
        enabled: true,
        delay: 500,
        fontSize: 14,
        highlightEnabled: true,
        highlightColor: '#ffeb3b',
        underline: true,
        api: 'baidu'
      };
      
      const baiduConfig = result.baiduConfig || {
        appid: '',
        key: ''
      };
      
      const baiduLlmConfig = result.baiduLlmConfig || {
        apiKey: ''
      };
      
      // 设置表单值
      enableTranslate.checked = config.enabled;
      translateDelay.value = config.delay;
      delayValue.textContent = `${config.delay}ms`;
      fontSize.value = config.fontSize;
      enableHighlight.checked = config.highlightEnabled;
      highlightColor.value = config.highlightColor;
      enableUnderline.checked = config.underline;
      apiSelect.value = config.api;
      baiduAppid.value = baiduConfig.appid;
      baiduKey.value = baiduConfig.key;
      llmApiKey.value = baiduLlmConfig.apiKey;
      
      // 切换配置显示
      toggleApiConfig();
    });
  }
  
  // 保存设置
  function saveSettings() {
    const config = {
      enabled: enableTranslate.checked,
      delay: parseInt(translateDelay.value),
      fontSize: parseInt(fontSize.value),
      highlightEnabled: enableHighlight.checked,
      highlightColor: highlightColor.value,
      underline: enableUnderline.checked,
      api: apiSelect.value
    };
    
    const baiduConfig = {
      appid: baiduAppid.value.trim(),
      key: baiduKey.value.trim()
    };
    
    const baiduLlmConfig = {
      apiKey: llmApiKey.value.trim()
    };
    
    chrome.storage.local.set({ config, baiduConfig, baiduLlmConfig }, () => {
      alert('设置已保存');
      
      // 通知所有标签页更新设置
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'updateConfig',
            config: config
          }).catch(() => {});
        });
      });
    });
  }
  
  // 恢复默认设置
  function resetSettings() {
    const defaultConfig = {
      enabled: true,
      delay: 500,
      fontSize: 14,
      highlightEnabled: true,
      highlightColor: '#ffeb3b',
      underline: true,
      api: 'baidu'
    };
    
    const defaultBaiduConfig = {
      appid: '',
      key: ''
    };
    
    const defaultBaiduLlmConfig = {
      apiKey: ''
    };
    
    chrome.storage.local.set({ 
      config: defaultConfig, 
      baiduConfig: defaultBaiduConfig,
      baiduLlmConfig: defaultBaiduLlmConfig
    }, () => {
      loadSettings();
      alert('已恢复默认设置');
    });
  }
  
  // 加载黑名单
  function loadBlacklist() {
    chrome.storage.local.get(['blacklist'], (result) => {
      const blacklist = result.blacklist || [];
      renderBlacklist(blacklist);
    });
  }
  
  // 渲染黑名单
  function renderBlacklist(blacklist) {
    blacklistList.innerHTML = '';
    
    if (blacklist.length === 0) {
      blacklistList.innerHTML = '<div class="empty-message">暂无黑名单</div>';
      return;
    }
    
    blacklist.forEach((domain, index) => {
      const item = document.createElement('div');
      item.className = 'blacklist-item';
      item.innerHTML = `
        <span class="domain">${domain}</span>
        <button class="remove-btn" data-index="${index}">×</button>
      `;
      blacklistList.appendChild(item);
    });
    
    // 添加删除事件
    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        removeBlacklist(index);
      });
    });
  }
  
  // 添加黑名单
  function addBlacklist() {
    const domain = newBlacklistDomain.value.trim();
    if (!domain) {
      alert('请输入域名');
      return;
    }
    
    chrome.storage.local.get(['blacklist'], (result) => {
      const blacklist = result.blacklist || [];
      
      if (blacklist.includes(domain)) {
        alert('该域名已在黑名单中');
        return;
      }
      
      blacklist.push(domain);
      chrome.storage.local.set({ blacklist }, () => {
        newBlacklistDomain.value = '';
        loadBlacklist();
      });
    });
  }
  
  // 移除黑名单
  function removeBlacklist(index) {
    chrome.storage.local.get(['blacklist'], (result) => {
      const blacklist = result.blacklist || [];
      blacklist.splice(index, 1);
      chrome.storage.local.set({ blacklist }, () => {
        loadBlacklist();
      });
    });
  }
  
  // 导出生词本
  function exportWordbook() {
    chrome.storage.local.get(['wordbook'], (result) => {
      const wordbook = result.wordbook || [];
      
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
    });
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
        
        chrome.storage.local.get(['wordbook'], (result) => {
          const existingWordbook = result.wordbook || [];
          
          // 合并生词本（避免重复）
          importedWordbook.forEach(item => {
            if (!existingWordbook.some(existing => existing.word === item.word)) {
              existingWordbook.push(item);
            }
          });
          
          chrome.storage.local.set({ wordbook: existingWordbook }, () => {
            alert(`成功导入 ${importedWordbook.length} 个生词`);
            importFile.value = '';
          });
        });
      } catch (error) {
        alert('导入失败：文件格式错误');
        importFile.value = '';
      }
    };
    
    reader.readAsText(file);
  }
  
  // 清除缓存
  function clearCache() {
    if (confirm('确定要清除翻译缓存吗？')) {
      chrome.storage.local.set({ translationCache: {} }, () => {
        alert('缓存已清除');
      });
    }
  }
  
  // 清空生词本
  function clearWordbook() {
    if (confirm('确定要清空生词本吗？此操作不可恢复。')) {
      chrome.storage.local.set({ wordbook: [] }, () => {
        alert('生词本已清空');
      });
    }
  }
});