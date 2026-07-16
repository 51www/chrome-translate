// 百度翻译API配置（从storage加载）
let BAIDU_CONFIG = {
  appid: '',
  key: ''
};

// 百度大模型翻译API配置
let BAIDU_LLM_CONFIG = {
  apiKey: ''
};

// 初始化时加载配置
chrome.storage.local.get(['baiduConfig', 'baiduLlmConfig'], (result) => {
  if (result.baiduConfig) {
    BAIDU_CONFIG = result.baiduConfig;
  }
  if (result.baiduLlmConfig) {
    BAIDU_LLM_CONFIG = result.baiduLlmConfig;
  }
});

// 监听配置变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.baiduConfig) {
    BAIDU_CONFIG = changes.baiduConfig.newValue || { appid: '', key: '' };
  }
  if (changes.baiduLlmConfig) {
    BAIDU_LLM_CONFIG = changes.baiduLlmConfig.newValue || { apiKey: '' };
  }
});

// 翻译API代理服务
const TRANSLATE_APIS = [
  // 百度翻译API
  {
    name: 'BaiduTranslate',
    url: 'https://fanyi-api.baidu.com/api/trans/vip/translate',
    method: 'GET',
    headers: {}
  },
  // LibreTranslate 公共实例（备用）
  {
    name: 'LibreTranslate',
    url: 'https://libretranslate.com/translate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      q: '{text}',
      source: 'en',
      target: 'zh'
    })
  }
];

// 翻译缓存
let translationCache = {};

// 初始化时加载缓存
chrome.storage.local.get(['translationCache'], (result) => {
  if (result.translationCache) {
    translationCache = result.translationCache;
  }
});

// 消息监听
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    translateText(request.text)
      .then(result => sendResponse({ success: true, translation: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 保持消息通道开放
  }
  
  if (request.action === 'getBlacklist') {
    chrome.storage.local.get(['blacklist'], (result) => {
      sendResponse({ blacklist: result.blacklist || [] });
    });
    return true;
  }
  
  if (request.action === 'addToBlacklist') {
    chrome.storage.local.get(['blacklist'], (result) => {
      const blacklist = result.blacklist || [];
      if (!blacklist.includes(request.domain)) {
        blacklist.push(request.domain);
        chrome.storage.local.set({ blacklist });
      }
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'removeFromBlacklist') {
    chrome.storage.local.get(['blacklist'], (result) => {
      const blacklist = result.blacklist || [];
      const index = blacklist.indexOf(request.domain);
      if (index > -1) {
        blacklist.splice(index, 1);
        chrome.storage.local.set({ blacklist });
      }
      sendResponse({ success: true });
    });
    return true;
  }
});

// 翻译函数
async function translateText(text) {
  // 检查缓存
  if (translationCache[text]) {
    return translationCache[text];
  }
  
  // 获取当前选择的API
  const result = await chrome.storage.local.get(['config']);
  const config = result.config || { api: 'baidu' };
  
  // 根据选择的API调用
  let translation = null;
  
  if (config.api === 'baidu') {
    try {
      translation = await callBaiduTranslate(text);
    } catch (error) {
      console.warn('百度翻译API失败:', error);
    }
  } else if (config.api === 'baidu_llm') {
    try {
      translation = await callBaiduLLMTranslate(text);
    } catch (error) {
      console.warn('百度大模型翻译API失败:', error);
    }
  } else if (config.api === 'libretranslate') {
    try {
      translation = await callLibreTranslate(text);
    } catch (error) {
      console.warn('LibreTranslate API失败:', error);
    }
  }
  
  if (translation) {
    // 保存到缓存
    translationCache[text] = translation;
    chrome.storage.local.set({ translationCache });
    return translation;
  }
  
  throw new Error('翻译服务暂时不可用');
}

// 调用百度通用翻译API
async function callBaiduTranslate(text) {
  if (!BAIDU_CONFIG.appid || !BAIDU_CONFIG.key) {
    throw new Error('请先配置百度翻译APPID和密钥');
  }
  
  const salt = Math.random().toString(36).substr(2);
  const sign = await md5(BAIDU_CONFIG.appid + text + salt + BAIDU_CONFIG.key);
  
  // 对q进行URL编码
  const encodedQ = encodeURIComponent(text);
  
  const url = `https://fanyi-api.baidu.com/api/trans/vip/translate?q=${encodedQ}&from=en&to=zh&appid=${BAIDU_CONFIG.appid}&salt=${salt}&sign=${sign}`;
  
  const response = await fetch(url, {
    method: 'GET'
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.error_code) {
    throw new Error(`百度API错误: ${data.error_msg}`);
  }
  
  if (data.trans_result && data.trans_result.length > 0) {
    return data.trans_result.map(r => r.dst).join('\n');
  }
  
  return null;
}

// 调用百度大模型翻译API
async function callBaiduLLMTranslate(text) {
  if (!BAIDU_LLM_CONFIG.apiKey) {
    throw new Error('请先配置百度大模型翻译API Key');
  }

  if (!BAIDU_CONFIG.appid) {
    throw new Error('请先配置百度翻译APPID（大模型翻译也需要）');
  }

  const response = await fetch('https://fanyi-api.baidu.com/ait/api/aiTextTranslate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BAIDU_LLM_CONFIG.apiKey}`
    },
    body: JSON.stringify({
      appid: BAIDU_CONFIG.appid,
      from: 'en',
      to: 'zh',
      q: text,
      model_type: 'llm'
    })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.error_code) {
    throw new Error(`百度API错误: ${data.error_msg}`);
  }
  
  if (data.trans_result && data.trans_result.length > 0) {
    return data.trans_result.map(r => r.dst).join('\n');
  }
  
  return null;
}

// 调用LibreTranslate API
async function callLibreTranslate(text) {
  const response = await fetch('https://libretranslate.com/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      q: text,
      source: 'en',
      target: 'zh'
    })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const data = await response.json();
  return data.translatedText;
}

// MD5哈希函数（用于百度API签名）
function md5(string) {
  function md5cycle(x, k) {
    var a = x[0], b = x[1], c = x[2], d = x[3];

    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);

    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);

    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);

    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);

    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }

  function cmn(q, a, b, x, s, t) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }

  function ff(a, b, c, d, x, s, t) {
    return cmn((b & c) | ((~b) & d), a, b, x, s, t);
  }

  function gg(a, b, c, d, x, s, t) {
    return cmn((b & d) | (c & (~d)), a, b, x, s, t);
  }

  function hh(a, b, c, d, x, s, t) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a, b, c, d, x, s, t) {
    return cmn(c ^ (b | (~d)), a, b, x, s, t);
  }

  function md51(s) {
    var n = s.length,
      state = [1732584193, -271733879, -1732584194, 271733878],
      i;
    for (i = 64; i <= n; i += 64) {
      md5cycle(state, md5blk(s.substring(i - 64, i)));
    }
    s = s.substring(i - 64);
    var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < s.length; i++)
      tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) {
      md5cycle(state, tail);
      for (i = 0; i < 16; i++) tail[i] = 0;
    }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }

  function md5blk(s) {
    var md5blks = [],
      i;
    for (i = 0; i < 64; i += 4) {
      md5blks[i >> 2] =
        s.charCodeAt(i) +
        (s.charCodeAt(i + 1) << 8) +
        (s.charCodeAt(i + 2) << 16) +
        (s.charCodeAt(i + 3) << 24);
    }
    return md5blks;
  }

  var hex_chr = '0123456789abcdef'.split('');

  function rhex(n) {
    var s = '',
      j = 0;
    for (; j < 4; j++)
      s +=
        hex_chr[(n >> (j * 8 + 4)) & 0x0f] + hex_chr[(n >> (j * 8)) & 0x0f];
    return s;
  }

  function hex(x) {
    for (var i = 0; i < x.length; i++) x[i] = rhex(x[i]);
    return x.join('');
  }

  function add32(a, b) {
    return (a + b) & 0xffffffff;
  }

  return hex(md51(string));
}

// 清理缓存（可选）
function clearCache() {
  translationCache = {};
  chrome.storage.local.set({ translationCache: {} });
}

// 监听设置变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.translationCache) {
    translationCache = changes.translationCache.newValue || {};
  }
});