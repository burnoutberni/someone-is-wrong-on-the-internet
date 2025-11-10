// Background service worker for message handling and (PoC) reply generation.

// In-memory cache for AI responses (key: hash of comment+tone, value: reply text)
const replyCache = new Map();

// Simple hash function for cache keys
function hashKey(comment, tone) {
  const str = `${comment.trim().toLowerCase()}|${tone}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('SIWOTI extension installed (PoC)');
  // Register context menu for right-click on any element
  chrome.contextMenus.create({
    id: 'siwoti-generate-reply',
    title: 'Generate gotcha reply',
    contexts: ['selection', 'page']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'siwoti-generate-reply' && tab.id) {
    const selectedText = info.selectionText || '';
    if (selectedText.trim().length === 0) {
      alert('Please select some text (a comment) first.');
      return;
    }
    // send to content script to generate reply
    chrome.tabs.sendMessage(tab.id, {
      type: 'generateReplyFromSelection',
      comment: selectedText,
      tone: 'funny' // default; can be extended to read from storage
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Content script error:', chrome.runtime.lastError.message);
      }
    });
  }
});


// Call OpenAI-compatible or Ollama API from the background service worker.
async function callOpenAI(commentText, tone) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['siwoti_apiKey', 'siwoti_apiBase', 'siwoti_model'], async (data) => {
      console.log('💾 Raw storage data:', {
        hasData: !!data,
        keys: data ? Object.keys(data) : [],
        apiKey: data && data.siwoti_apiKey ? `"${data.siwoti_apiKey.slice(0, 8)}...${data.siwoti_apiKey.slice(-4)}"` : 'undefined',
        apiBase: data && data.siwoti_apiBase ? `"${data.siwoti_apiBase}"` : 'undefined',
        model: data && data.siwoti_model ? `"${data.siwoti_model}"` : 'undefined'
      });
      
      const apiKey = (data && data.siwoti_apiKey) ? data.siwoti_apiKey.trim() : '';
      const apiBase = (data && data.siwoti_apiBase) ? data.siwoti_apiBase.trim().replace(/\/$/, '') : 'https://api.openai.com';
      const customModel = (data && data.siwoti_model) ? data.siwoti_model.trim() : '';
      
      // Detect Ollama or Open WebUI by hostname or path
      const isOllama = /localhost|127\.0\.0\.1|ollama/i.test(apiBase);
      const isOpenWebUI = apiBase.includes('/api/chat') || apiBase.includes('open-webui') || apiBase.includes(':3000');
      
      const debugInfo = {
        apiBase,
        isOllama,
        isOpenWebUI,
        hasKey: !!apiKey,
        keyPreview: apiKey ? apiKey.slice(0, 8) + '...' + apiKey.slice(-4) : 'none',
        model: customModel || 'default',
        commentLength: commentText.length,
        tone
      };
      console.log('🔧 API call config:', debugInfo);
      
      // Ollama and Open WebUI don't require an API key; OpenAI does
      if (!isOllama && !isOpenWebUI && !apiKey) {
        reject(new Error('No API key configured (required for OpenAI). For Ollama/Open WebUI, set API base to http://localhost:11434 or http://localhost:3000 and leave key empty.'));
        return;
      }

      const system = `You are a witty, concise assistant that writes short gotcha-style replies to internet comments. Keep replies between 10 and 60 words unless the user asked for a different tone.`;
      const prompt = `Write a ${tone} reply to this comment:\n\n"""\n${commentText}\n"""\n\nKeep it short, humorous, and not abusive.`;

      // Choose model: user-specified, or defaults (gpt-3.5-turbo for OpenAI, llama3.2 for Ollama)
      const model = customModel || (isOllama || isOpenWebUI ? 'llama3.2' : 'gpt-3.5-turbo');

      try {
        const headers = { 'Content-Type': 'application/json' };
        // Only add Authorization header for non-Ollama/non-OpenWebUI endpoints
        if (!isOllama && !isOpenWebUI && apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        // Detect endpoint path: Open WebUI uses /api/chat/completions, others use /v1/chat/completions
        let endpoint;
        if (apiBase.includes('/api/chat')) {
          // API base already includes the full path
          endpoint = apiBase;
        } else if (isOpenWebUI) {
          endpoint = `${apiBase}/api/chat/completions`;
        } else {
          endpoint = `${apiBase}/v1/chat/completions`;
        }
        const requestBody = {
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt }
          ],
          max_tokens: 180,
          temperature: 0.8
        };
        
        console.log('📤 Sending request to:', endpoint);
        console.log('📤 Headers:', { ...headers, Authorization: headers.Authorization ? 'Bearer ***' + apiKey.slice(-4) : 'none' });
        console.log('📤 Body:', { ...requestBody, messages: requestBody.messages.map(m => ({ role: m.role, contentLength: m.content.length })) });

        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        });
        
        console.log('📥 Response status:', res.status, res.statusText);
        console.log('📥 Response headers:', Object.fromEntries([...res.headers.entries()]));

        const responseText = await res.text();
        console.log('📥 Raw response body:', responseText);

        // Log the entire request and response for debugging
        const debugData = {
          request: {
            endpoint,
            method: 'POST',
            headers: { ...headers, Authorization: headers.Authorization ? 'Bearer ***' + apiKey.slice(-4) : 'none' },
            body: requestBody
          },
          response: {
            status: res.status,
            statusText: res.statusText,
            headers: Object.fromEntries([...res.headers.entries()]),
            body: responseText
          }
        };
        console.log('🔍 FULL REQUEST/RESPONSE:', JSON.stringify(debugData, null, 2));

        if (!res.ok) {
          console.error('❌ API call failed');
          reject(new Error(`HTTP ${res.status}: ${responseText}`));
          return;
        }
        
        const dataResp = JSON.parse(responseText);
        console.log('✅ Parsed API response:', dataResp);
        const choice = dataResp.choices && dataResp.choices[0];
        const content = (choice && (choice.message && choice.message.content)) || dataResp.result || '';
        console.log('✅ Extracted content:', content.slice(0, 100) + (content.length > 100 ? '...' : ''));
        resolve(content.trim());
      } catch (err) {
        console.error('❌ API call exception:', err);
        reject(err);
      }
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'generateReply') {
    const tone = msg.tone || 'funny';
    const comment = msg.comment || '';
    
    // Check cache first
    const cacheKey = hashKey(comment, tone);
    if (replyCache.has(cacheKey)) {
      console.log('Returning cached reply for:', comment.slice(0, 50));
      sendResponse({ reply: replyCache.get(cacheKey), cached: true });
      return true;
    }
    
    // Always call OpenAI (no fallback placeholder)
    callOpenAI(comment, tone).then((reply) => {
      // cache the response
      replyCache.set(cacheKey, reply);
      sendResponse({ reply });
    }).catch((err) => {
      console.error('OpenAI call failed:', err && err.message);
      sendResponse({ error: err && (err.message || String(err)) });
    });
    return true; // indicate async response
  }

  // allow saving API key, base, and model via messages
  if (msg.type === 'saveApiKey') {
    chrome.storage.local.set({ siwoti_apiKey: msg.apiKey }, () => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'saveApiBase') {
    chrome.storage.local.set({ siwoti_apiBase: msg.apiBase }, () => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'saveModel') {
    chrome.storage.local.set({ siwoti_model: msg.model }, () => sendResponse({ ok: true }));
    return true;
  }
});
