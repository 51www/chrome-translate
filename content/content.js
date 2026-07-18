// 划词翻译内容脚本
(function() {
  'use strict';
  
  // 配置
  let config = {
    enabled: true,
    delay: 300, // 毫秒
    highlightEnabled: true,
    highlightColor: '#fff3cd',
    underline: false,
    blacklist: []
  };
  
  // 状态
  let selectionTimer = null;
  let tooltip = null;
  let hoverTimer = null;
  let currentDomain = window.location.hostname;
  let isTooltipHovered = false;
  let isWordHighlighted = false;
  let lastMouseDownTime = 0;
  let lastMouseDownTarget = null;
  let isDoubleClickInProgress = false;

  // 检查扩展上下文是否有效
  function isExtensionValid() {
    try {
      return !!chrome.runtime?.id;
    } catch (e) {
      return false;
    }
  }

  // 安全调用 chrome.storage.local.get
  function safeStorageGet(keys, callback) {
    if (!isExtensionValid()) return;
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) return;
        callback(result);
      });
    } catch (e) {
      // Extension context invalidated
    }
  }

  // 安全调用 chrome.storage.local.set
  function safeStorageSet(data, callback) {
    if (!isExtensionValid()) return;
    try {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) return;
        if (callback) callback();
      });
    } catch (e) {
      // Extension context invalidated
    }
  }

  // 安全调用 chrome.runtime.sendMessage
  function safeSendMessage(message, callback) {
    if (!isExtensionValid()) return;
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) return;
        if (callback) callback(response);
      });
    } catch (e) {
      // Extension context invalidated
    }
  }

  // 初始化
  function init() {
    loadConfig();
    createTooltip();
    setupEventListeners();
    checkBlacklist();
  }
  
  // 加载配置
  function loadConfig() {
    safeStorageGet(['config', 'blacklist'], (result) => {
      if (result.config) {
        config = { ...config, ...result.config };
      }
      if (result.blacklist) {
        config.blacklist = result.blacklist;
      }
      checkBlacklist();
    });

    // 监听配置变化
    try {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (changes.config) {
          config = { ...config, ...changes.config.newValue };
          checkBlacklist();
        }
        if (changes.blacklist) {
          config.blacklist = changes.blacklist.newValue || [];
          checkBlacklist();
        }
      });
    } catch (e) {
      // Extension context invalidated
    }
  }
  
  // 检查黑名单
  function checkBlacklist() {
    const isBlacklisted = config.blacklist.some(domain => {
      return currentDomain.includes(domain) || domain.includes(currentDomain);
    });
    
    if (isBlacklisted) {
      disableFeatures();
    } else {
      enableFeatures();
    }
  }
  
  // 启用功能
  function enableFeatures() {
    if (config.highlightEnabled) {
      highlightWords();
    }
  }
  
  // 禁用功能
  function disableFeatures() {
    removeHighlights();
  }
  
  // 设置事件监听
  function setupEventListeners() {
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('dblclick', handleDoubleClick, true);
    
    // 监听页面变化（SPA）
    let highlightDebounceTimer = null;
    const observer = new MutationObserver((mutations) => {
      // 跳过我们自己元素的变化
      const isOurMutation = mutations.some(mutation => {
        return Array.from(mutation.addedNodes).some(node => {
          return node === tooltip || (node.nodeType === 1 && node.classList && 
            (node.classList.contains('nl-highlight') || node.classList.contains('neonlingo-tooltip')));
        });
      });
      
      if (isOurMutation) return;
      
      // 跳过正在hover时的变化
      if (isTooltipHovered || isWordHighlighted) return;

      // 跳过有文本选中时的变化
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;

      if (config.highlightEnabled) {
        clearTimeout(highlightDebounceTimer);
        highlightDebounceTimer = setTimeout(highlightWords, 1500);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // 处理鼠标按下
  function handleMouseDown(e) {
    // 检测双击：当前mousedown与上次mousedown间隔小于300ms且在同一元素
    const timeSinceLastMouseDown = Date.now() - lastMouseDownTime;
    isDoubleClickInProgress = timeSinceLastMouseDown < 300 && lastMouseDownTarget === e.target;
    
    // 记录mousedown的时间和目标
    lastMouseDownTime = Date.now();
    lastMouseDownTarget = e.target;
    
    // 清除待处理的选择定时器
    clearTimeout(selectionTimer);
    
    // 如果点击的是tooltip内部，不处理
    if (tooltip && tooltip.contains(e.target)) {
      return;
    }
    
    // 如果点击的是高亮单词，不隐藏tooltip（让hover处理）
    if (e.target.classList && e.target.classList.contains('nl-highlight')) {
      return;
    }
  }
  
  // 处理鼠标松开
  function handleMouseUp(e) {
    // 如果功能已关闭，不处理
    if (!config.enabled) return;

    // 如果点击的是tooltip内部，不处理
    if (tooltip && tooltip.contains(e.target)) {
      return;
    }

    // 如果点击的是高亮单词，不处理（由hover处理）
    if (e.target.classList && e.target.classList.contains('nl-highlight')) {
      return;
    }

    // 使用handleMouseDown中设置的双击检测标志
    if (isDoubleClickInProgress) {
      isDoubleClickInProgress = false;
      return;
    }

    // 单击处理
    // 如果tooltip正在显示，且用户点击空白区域，隐藏tooltip
    if (tooltip && tooltip.style.display === 'block') {
      hideTooltip();
      isWordHighlighted = false;
      return;
    }

    // 延迟处理选择
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const selectedText = getSelectedText();
      if (selectedText && isValidEnglish(selectedText)) {
        showTooltip(selectedText, e.clientX, e.clientY);
      }
    }, config.delay);
  }

  // 处理双击事件
  function handleDoubleClick(e) {
    // 如果功能已关闭，不处理
    if (!config.enabled) return;

    // 如果点击的是tooltip内部，不处理
    if (tooltip && tooltip.contains(e.target)) {
      return;
    }
    
    // 清除任何待处理的selection timer
    clearTimeout(selectionTimer);
    
    // 双击选中单词后，等待浏览器完成选中
    // 使用0ms延迟，让浏览器先完成选中操作
    setTimeout(() => {
      const selectedText = getSelectedText();
      if (selectedText && isValidEnglish(selectedText)) {
        showTooltip(selectedText, e.clientX, e.clientY);
      }
    }, 10);
  }
  
  // 获取选中文本
  function getSelectedText() {
    const selection = window.getSelection();
    if (!selection) return null;
    
    let text = selection.toString().trim();
    
    // 限制长度
    if (text.length > 200) {
      text = text.substring(0, 200);
    }
    
    return text;
  }
  
  // 验证是否为有效英文
  function isValidEnglish(text) {
    // 必须包含至少一个字母
    if (!/[a-zA-Z]/.test(text)) return false;
    // 不能包含中文/日文/韩文
    if (/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(text)) return false;
    // 检查文本是否主要由英文字符组成（包括字母、空格、常见标点符号）
    // 排除其他语言的特殊字符（如法语重音、德语变音符号等）
    const englishOnlyRegex = /^[a-zA-Z\s.,;:!?'"\-()]+$/;
    return englishOnlyRegex.test(text);
  }
  
  // 创建tooltip
  function createTooltip() {
    if (tooltip) return;
    
    tooltip = document.createElement('div');
    tooltip.id = 'neonlingo-tooltip';
    tooltip.className = 'neonlingo-tooltip';
    tooltip.innerHTML = `
      <div class="nl-tooltip-header">
        <div class="nl-tooltip-content">
          <div class="nl-tooltip-loading">
            <div class="nl-spinner"></div>
            <span>翻译中...</span>
          </div>
        </div>
        <button class="nl-btn-star" title="收藏到生词本">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path class="star-outline" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            <path class="star-filled" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </button>
      </div>
      <div class="nl-tooltip-footer">
        <div class="nl-tooltip-source">百度翻译</div>
      </div>
    `;
    document.body.appendChild(tooltip);
    
    // 添加鼠标事件
    tooltip.addEventListener('mouseenter', () => {
      isTooltipHovered = true;
      clearTimeout(hoverTimer);
    });
    
    tooltip.addEventListener('mouseleave', () => {
      isTooltipHovered = false;
      hideTooltip();
    });
    
    // 添加收藏按钮点击事件
    tooltip.querySelector('.nl-btn-star').addEventListener('click', toggleWordbook);
  }
  
  // 切换收藏状态
  function toggleWordbook() {
    const text = tooltip.dataset.text;
    if (!text) return;
    
    const starBtn = tooltip.querySelector('.nl-btn-star');
    const isCollected = starBtn.classList.contains('collected');
    
    if (isCollected) {
      removeFromWordbook(text);
    } else {
      addToWordbook(text);
    }
  }
  
  // 添加到生词本
  function addToWordbook(text) {
    const translation = tooltip.querySelector('.nl-translation');
    const translationText = translation ? translation.textContent : '';

    safeStorageGet(['wordbook'], (result) => {
      const wordbook = result.wordbook || [];

      // 检查是否已存在
      const exists = wordbook.some(item => item.word === text);
      if (exists) {
        updateStarButton(true);
        return;
      }

      // 添加新单词
      const newWord = {
        word: text,
        translation: translationText,
        addTime: Date.now(),
        count: 1,
        reviewed: false
      };
      wordbook.push(newWord);

      // 保存后立即刷新高亮
      safeStorageSet({ wordbook }, () => {
        updateStarButton(true);
        showCollectAnimation();
        // 直接高亮新单词，不等待完整刷新
        highlightNewWord(text, translationText);
      });
    });
  }

  // 从生词本移除
  function removeFromWordbook(text) {
    safeStorageGet(['wordbook'], (result) => {
      const wordbook = result.wordbook || [];

      // 查找并移除
      const index = wordbook.findIndex(item => item.word === text);
      if (index > -1) {
        wordbook.splice(index, 1);

        // 保存后立即移除高亮
        safeStorageSet({ wordbook }, () => {
          updateStarButton(false);
          showUncollectAnimation();
          // 直接移除该单词的高亮
          removeWordHighlight(text);
        });
      }
    });
  }
  
  // 直接高亮新单词（快速路径）
  function highlightNewWord(word, translation) {
    // 查找页面中包含该单词的文本节点
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    const nodesToProcess = [];
    let node;
    while (node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent) {
        const tagName = parent.tagName.toLowerCase();
        if (['input', 'textarea', 'code', 'pre', 'script', 'style'].includes(tagName)) continue;
        if (parent.classList && parent.classList.contains('nl-highlight')) continue;
        if (tooltip && tooltip.contains(parent)) continue;
      }
      
      // 检查是否包含目标单词
      const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
      if (regex.test(node.textContent)) {
        nodesToProcess.push(node);
      }
    }
    
    // 处理找到的节点
    nodesToProcess.forEach(node => {
      const text = node.textContent;
      const regex = new RegExp(`\\b(${escapeRegex(word)})\\b`, 'gi');
      
      if (!regex.test(text)) return;
      regex.lastIndex = 0;
      
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        
        const span = document.createElement('span');
        span.className = 'nl-highlight';
        span.textContent = match[0];
        span.dataset.word = match[0];
        span.dataset.translation = translation;
        span.style.backgroundColor = config.highlightColor || '#fff3cd';
        if (config.underline) {
          span.style.textDecoration = 'underline';
        }
        
        span.addEventListener('mouseenter', handleWordHighlightHover);
        span.addEventListener('mouseleave', handleWordHighlightLeave);
        
        fragment.appendChild(span);
        lastIndex = match.index + match[0].length;
      }
      
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
      
      node.parentNode.replaceChild(fragment, node);
    });
  }
  
  // 移除单个单词的高亮（快速路径）
  function removeWordHighlight(word) {
    const highlights = document.querySelectorAll('.nl-highlight');
    highlights.forEach(highlight => {
      if (highlight.dataset.word && 
          highlight.dataset.word.toLowerCase() === word.toLowerCase()) {
        const parent = highlight.parentNode;
        parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
        parent.normalize();
      }
    });
  }
  
  // 更新收藏按钮状态
  function updateStarButton(isCollected) {
    const starBtn = tooltip.querySelector('.nl-btn-star');
    if (isCollected) {
      starBtn.classList.add('collected');
      starBtn.title = '取消收藏';
    } else {
      starBtn.classList.remove('collected');
      starBtn.title = '收藏到生词本';
    }
  }
  
  // 显示收藏动画
  function showCollectAnimation() {
    const starBtn = tooltip.querySelector('.nl-btn-star');
    starBtn.classList.add('pulse');
    setTimeout(() => starBtn.classList.remove('pulse'), 500);
  }
  
  // 显示取消收藏动画
  function showUncollectAnimation() {
    const starBtn = tooltip.querySelector('.nl-btn-star');
    starBtn.classList.add('shake');
    setTimeout(() => starBtn.classList.remove('shake'), 500);
  }
  
  // 显示tooltip
  function showTooltip(text, x, y) {
    if (!tooltip) return;
    
    // 设置位置
    const margin = 12;
    
    let left = x + margin;
    let top = y - 60;
    
    // 边界检测
    if (left + 280 > window.innerWidth) {
      left = x - 280 - margin;
    }
    if (top < 10) {
      top = y + margin;
    }
    if (top + 120 > window.innerHeight) {
      top = window.innerHeight - 130;
    }
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    
    // 显示tooltip
    tooltip.style.display = 'block';
    tooltip.style.opacity = '0';
    tooltip.style.transform = 'translateY(4px)';
    
    // 检查是否在生词本中
    safeStorageGet(['wordbook'], (result) => {
      const wordbook = result.wordbook || [];
      const wordData = wordbook.find(item =>
        item.word.toLowerCase() === text.toLowerCase()
      );
      updateStarButton(!!wordData);
    });
    
    // 获取翻译
    translateText(text);
    
    // 存储当前文本
    tooltip.dataset.text = text;
    
    // 动画显示
    requestAnimationFrame(() => {
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateY(0)';
    });
  }
  
  // 隐藏tooltip
  function hideTooltip() {
    if (tooltip && !isTooltipHovered) {
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'translateY(4px)';
      setTimeout(() => {
        if (!isTooltipHovered) {
          tooltip.style.display = 'none';
        }
      }, 200);
    }
  }
  
  // 翻译文本
  function translateText(text) {
    const contentDiv = tooltip.querySelector('.nl-tooltip-content');
    contentDiv.innerHTML = `
      <div class="nl-tooltip-loading">
        <div class="nl-spinner"></div>
        <span>翻译中...</span>
      </div>
    `;

    safeSendMessage({
      action: 'translate',
      text: text
    }, (response) => {
      if (!response) {
        contentDiv.innerHTML = `
          <div class="nl-error">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span>翻译服务暂时不可用</span>
          </div>
        `;
        return;
      }

      if (response.success) {
        contentDiv.innerHTML = `
          <div class="nl-word">${escapeHtml(text)}</div>
          <div class="nl-translation">${escapeHtml(response.translation)}</div>
        `;
      } else {
        contentDiv.innerHTML = `
          <div class="nl-error">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span>${escapeHtml(response.error || '翻译失败')}</span>
          </div>
        `;
      }
    });
  }
  
  // HTML转义
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // 生词高亮功能
  function highlightWords() {
    if (!config.highlightEnabled) return;

    // 跳过正在hover时的刷新
    if (isTooltipHovered || isWordHighlighted) return;

    // 跳过有文本选中时的刷新
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;

    safeStorageGet(['wordbook'], (result) => {
      const wordbook = result.wordbook || [];

      // 移除现有高亮
      removeHighlights();

      if (wordbook.length === 0) return;

      // 遍历页面文本节点
      const textNodes = getTextNodes(document.body);

      textNodes.forEach(node => {
        highlightTextNode(node, wordbook);
      });
    });
  }
  
  // 获取文本节点
  function getTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      // 排除特定标签
      const parent = node.parentElement;
      if (parent) {
        const tagName = parent.tagName.toLowerCase();
        if (['input', 'textarea', 'code', 'pre', 'script', 'style'].includes(tagName)) {
          continue;
        }
        // 排除已有高亮
        if (parent.classList && parent.classList.contains('nl-highlight')) {
          continue;
        }
        // 排除tooltip内的文本
        if (tooltip && tooltip.contains(parent)) {
          continue;
        }
      }
      
      textNodes.push(node);
    }
    
    return textNodes;
  }
  
  // 高亮文本节点
  function highlightTextNode(node, wordbook) {
    const text = node.textContent;
    const words = wordbook.map(item => item.word);
    
    if (words.length === 0) return;
    
    // 创建正则表达式（不区分大小写）
    const regex = new RegExp(`\\b(${words.map(escapeRegex).join('|')})\\b`, 'gi');
    
    if (!regex.test(text)) return;
    
    // 重置正则
    regex.lastIndex = 0;
    
    // 替换文本
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      // 添加匹配前的文本
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      
      // 找到对应的生词数据
      const wordData = wordbook.find(item => 
        item.word.toLowerCase() === match[0].toLowerCase()
      );
      
      // 创建高亮span
      const span = document.createElement('span');
      span.className = 'nl-highlight';
      span.textContent = match[0];
      span.dataset.word = match[0];
      span.dataset.translation = wordData ? wordData.translation : '';
      
      // 应用配置的样式
      span.style.backgroundColor = config.highlightColor || '#fff3cd';
      if (config.underline) {
        span.style.textDecoration = 'underline';
      }
      
      // 添加hover事件
      span.addEventListener('mouseenter', handleWordHighlightHover);
      span.addEventListener('mouseleave', handleWordHighlightLeave);
      
      fragment.appendChild(span);
      lastIndex = match.index + match[0].length;
    }
    
    // 添加剩余文本
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    
    node.parentNode.replaceChild(fragment, node);
  }
  
  // 转义正则特殊字符
  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  // 生词高亮hover显示翻译
  function handleWordHighlightHover(e) {
    isWordHighlighted = true;
    const word = e.target.dataset.word;
    const translation = e.target.dataset.translation;
    
    if (!word || !translation) return;
    
    // 清除之前的定时器
    clearTimeout(hoverTimer);
    
    // 延迟显示tooltip
    hoverTimer = setTimeout(() => {
      showWordbookTooltip(word, translation, e.clientX, e.clientY);
    }, 150);
  }
  
  function handleWordHighlightLeave() {
    clearTimeout(hoverTimer);
    // 延迟隐藏，让用户可以移动到tooltip上
    hoverTimer = setTimeout(() => {
      if (!isTooltipHovered) {
        hideTooltip();
        isWordHighlighted = false;
      }
    }, 200);
  }
  
  // 显示生词本tooltip（直接显示翻译，不调用API）
  function showWordbookTooltip(word, translation, x, y) {
    if (!tooltip) return;
    
    // 设置位置
    const margin = 12;
    
    let left = x + margin;
    let top = y - 60;
    
    // 边界检测
    if (left + 280 > window.innerWidth) {
      left = x - 280 - margin;
    }
    if (top < 10) {
      top = y + margin;
    }
    if (top + 120 > window.innerHeight) {
      top = window.innerHeight - 130;
    }
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    
    // 显示tooltip
    tooltip.style.display = 'block';
    tooltip.style.opacity = '0';
    tooltip.style.transform = 'translateY(4px)';
    
    // 直接显示翻译结果
    const contentDiv = tooltip.querySelector('.nl-tooltip-content');
    contentDiv.innerHTML = `
      <div class="nl-word">${escapeHtml(word)}</div>
      <div class="nl-translation">${escapeHtml(translation)}</div>
    `;
    
    // 存储当前文本
    tooltip.dataset.text = word;
    
    // 生词本中的单词，设置收藏状态为已收藏
    updateStarButton(true);
    
    // 动画显示
    requestAnimationFrame(() => {
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateY(0)';
    });
  }
  
  // 移除高亮
  function removeHighlights() {
    const highlights = document.querySelectorAll('.nl-highlight');
    highlights.forEach(highlight => {
      const parent = highlight.parentNode;
      parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
      parent.normalize();
    });
  }
  
  // 监听来自popup或options的消息
  try {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'updateConfig') {
        // 更新配置
        if (request.config) {
          config = { ...config, ...request.config };
          // 刷新高亮
          if (config.highlightEnabled) {
            highlightWords();
          } else {
            removeHighlights();
          }
        }
        sendResponse({ success: true });
        return;
      }

      if (request.action === 'toggleHighlight') {
        config.highlightEnabled = request.enabled;
        if (config.highlightEnabled) {
          highlightWords();
        } else {
          removeHighlights();
        }
        sendResponse({ success: true });
      }

      if (request.action === 'refreshHighlights') {
        highlightWords();
        sendResponse({ success: true });
      }

      if (request.action === 'addToBlacklist') {
        safeSendMessage({
          action: 'addToBlacklist',
          domain: currentDomain
        }, (response) => {
          sendResponse(response);
        });
        return true;
      }
    });
  } catch (e) {
    // Extension context invalidated
  }
  
  // 初始化
  init();
})();
