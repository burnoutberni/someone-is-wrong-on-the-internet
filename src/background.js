// Background service worker for message handling and (PoC) reply generation.

// In-memory cache for AI responses (key: hash of comment+tone, value: reply text)
const replyCache = new Map();

// Simple hash function for cache keys
function hashKey(comment, tone, lang) {
  const str = `${comment.trim().toLowerCase()}|${tone}|${lang}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

// Language-specific prompts with tone translations
const LANGUAGE_PROMPTS = {
  en: {
    tones: { funny: 'funny', sarcastic: 'sarcastic', mild: 'mild' },
    system: `You are a witty, concise assistant that writes short gotcha-style replies to internet comments. Keep replies between 10 and 60 words.`,
    user: (tone, comment, articleContext) => {
      let prompt = `Write a ${tone} reply to this comment:\n\n"""\n${comment}\n"""`;
      prompt += `\nKeep it short, humorous, and not abusive.`;
      if (articleContext && (articleContext.title || articleContext.content)) {
        prompt += `\n\nContext - The comment is about this article:\nTitle: ${articleContext.title}\n`;
        if (articleContext.content) {
          prompt += `Article text: ${articleContext.content}\n`;
        }
      }
      return prompt;
    }
  },
  zh: {
    tones: { funny: '幽默', sarcastic: '讽刺', mild: '温和' },
    system: `你是一个机智、简洁的助手，专门为网络评论撰写简短的"反驳式"回复。回复应保持在10到60个字之间。`,
    user: (tone, comment, articleContext) => {
      let prompt = `为这条评论写一个${tone}的回复：\n\n"""\n${comment}\n"""\n\n保持简短、幽默，不要粗俗。`;
      if (articleContext && (articleContext.title || articleContext.content)) {
        prompt += `\n\n背景 - 这条评论是关于这篇文章的：\n标题: ${articleContext.title}\n`;
        if (articleContext.content) {
          prompt += `文章内容: ${articleContext.content}\n`;
        }
      }
      return prompt;
    }
  },
  hi: {
    tones: { funny: 'मज़ेदार', sarcastic: 'व्यंग्यात्मक', mild: 'सौम्य' },
    system: `आप एक चतुर, संक्षिप्त सहायक हैं जो इंटरनेट टिप्पणियों के लिए छोटे गोचा-शैली के जवाब लिखते हैं। जवाब 10 से 60 शब्दों के बीच रखें।`,
    user: (tone, comment, articleContext) => {
      let prompt = `इस टिप्पणी का एक ${tone} जवाब लिखें:\n\n"""\n${comment}\n"""\n\nइसे छोटा, हास्यपूर्ण और अपमानजनक नहीं रखें।`;
      if (articleContext && (articleContext.title || articleContext.content)) {
        prompt += `\n\nसंदर्भ - यह टिप्पणी इस लेख के बारे में है:\nशीर्षक: ${articleContext.title}\n`;
        if (articleContext.content) {
          prompt += `लेख की सामग्री: ${articleContext.content}\n`;
        }
      }
      return prompt;
    }
  },
  es: {
    tones: { funny: 'divertida', sarcastic: 'sarcástica', mild: 'suave' },
    system: `Eres un asistente ingenioso y conciso que escribe respuestas cortas y contundentes a comentarios de internet. Mantén las respuestas entre 10 y 60 palabras.`,
    user: (tone, comment, articleContext) => {
      let prompt = `Escribe una respuesta ${tone} a este comentario:\n\n"""\n${comment}\n"""\n\nMantenla corta, divertida y no abusiva.`;
      if (articleContext && (articleContext.title || articleContext.content)) {
        prompt += `\n\nContexto - El comentario es sobre este artículo:\nTítulo: ${articleContext.title}\n`;
        if (articleContext.content) {
          prompt += `Contenido del artículo: ${articleContext.content}\n`;
        }
      }
      return prompt;
    }
  },
  fr: {
    tones: { funny: 'drôle', sarcastic: 'sarcastique', mild: 'douce' },
    system: `Tu es un assistant spirituel et concis qui écrit de courtes réponses percutantes aux commentaires sur internet. Garde les réponses entre 10 et 60 mots.`,
    user: (tone, comment, articleContext) => {
      let prompt = `Écris une réponse ${tone} à ce commentaire:\n\n"""\n${comment}\n"""\n\nGarde-la courte, humoristique et non abusive.`;
      if (articleContext && (articleContext.title || articleContext.content)) {
        prompt += `\n\nContexte - Le commentaire concerne cet article:\nTitre: ${articleContext.title}\n`;
        if (articleContext.content) {
          prompt += `Contenu de l'article: ${articleContext.content}\n`;
        }
      }
      return prompt;
    }
  },
  ar: {
    tones: { funny: 'مضحكًا', sarcastic: 'ساخرًا', mild: 'لطيفًا' },
    system: `أنت مساعد ذكي وموجز يكتب ردودًا قصيرة ومفحمة على تعليقات الإنترنت. حافظ على الردود بين 10 و 60 كلمة.`,
    user: (tone, comment, articleContext) => {
      let prompt = `اكتب ردًا ${tone} على هذا التعليق:\n\n"""\n${comment}\n"""\n\nاجعله قصيرًا وفكاهيًا وغير مسيء.`;
      if (articleContext && (articleContext.title || articleContext.content)) {
        prompt += `\n\nالسياق - التعليق يتعلق بهذا المقال:\nالعنوان: ${articleContext.title}\n`;
        if (articleContext.content) {
          prompt += `محتوى المقال: ${articleContext.content}\n`;
        }
      }
      return prompt;
    }
  },
  bn: {
    tones: { funny: 'মজার', sarcastic: 'ব্যঙ্গাত্মক', mild: 'মৃদু' },
    system: `আপনি একজন বুদ্ধিমান, সংক্ষিপ্ত সহায়ক যিনি ইন্টারনেট মন্তব্যের জন্য ছোট গোচা-স্টাইল উত্তর লেখেন। উত্তরগুলি 10 থেকে 60 শব্দের মধ্যে রাখুন।`,
    user: (tone, comment, articleContext) => {
      let prompt = `এই মন্তব্যের জন্য একটি ${tone} উত্তর লিখুন:\n\n"""\n${comment}\n"""\n\nএটি সংক্ষিপ্ত, হাস্যকর এবং অপমানজনক নয় রাখুন।`;
      if (articleContext && (articleContext.title || articleContext.content)) {
        prompt += `\n\nপ্রেক্ষাপট - মন্তব্যটি এই নিবন্ধ সম্পর্কে:\nশিরোনাম: ${articleContext.title}\n`;
        if (articleContext.content) {
          prompt += `নিবন্ধের বিষয়বস্তু: ${articleContext.content}\n`;
        }
      }
      return prompt;
    }
  },
  pt: {
    tones: { funny: 'engraçada', sarcastic: 'sarcástica', mild: 'suave' },
    system: `Você é um assistente espirituoso e conciso que escreve respostas curtas e contundentes a comentários da internet. Mantenha as respostas entre 10 e 60 palavras.`,
    user: (tone, comment, articleContext) => {
      let prompt = `Escreva uma resposta ${tone} a este comentário:\n\n"""\n${comment}\n"""\n\nMantenha-a curta, bem-humorada e não abusiva.`;
      if (articleContext && (articleContext.title || articleContext.content)) {
        prompt += `\n\nContexto - O comentário é sobre este artigo:\nTítulo: ${articleContext.title}\n`;
        if (articleContext.content) {
          prompt += `Conteúdo do artigo: ${articleContext.content}\n`;
        }
      }
      return prompt;
    }
  },
  ru: {
    tones: { funny: 'смешной', sarcastic: 'саркастичный', mild: 'мягкий' },
    system: `Вы остроумный и лаконичный помощник, который пишет короткие едкие ответы на интернет-комментарии. Держите ответы в пределах 10-60 слов.`,
    user: (tone, comment, articleContext) => {
      let prompt = `Напишите ${tone} ответ на этот комментарий:\n\n"""\n${comment}\n"""\n\nСделайте его коротким, юмористичным и не оскорбительным.`;
      if (articleContext && (articleContext.title || articleContext.content)) {
        prompt += `\n\nКонтекст - Комментарий касается этой статьи:\nЗаголовок: ${articleContext.title}\n`;
        if (articleContext.content) {
          prompt += `Содержание статьи: ${articleContext.content}\n`;
        }
      }
      return prompt;
    }
  },
  ja: {
    tones: { funny: '面白い', sarcastic: '皮肉な', mild: '穏やかな' },
    system: `あなたは機知に富んだ簡潔なアシスタントで、インターネットのコメントに対して短い切り返しスタイルの返信を書きます。返信は10〜60語に保ってください。`,
    user: (tone, comment, articleContext) => {
      let prompt = `このコメントに${tone}返信を書いてください：\n\n"""\n${comment}\n"""\n\n短く、ユーモラスで、攻撃的でないようにしてください。`;
      if (articleContext && (articleContext.title || articleContext.content)) {
        prompt += `\n\n文脈 - コメントはこの記事についてです:\nタイトル: ${articleContext.title}\n`;
        if (articleContext.content) {
          prompt += `記事の内容: ${articleContext.content}\n`;
        }
      }
      return prompt;
    }
  },
  de: {
    tones: { funny: 'lustige', sarcastic: 'sarkastische', mild: 'milde' },
    system: `Du bist ein witziger, prägnanter Assistent, der kurze, schlagfertige Antworten auf Internetkommentare schreibt. Halte Antworten zwischen 10 und 60 Wörtern.`,
    user: (tone, comment, articleContext) => {
      let prompt = `Schreibe eine ${tone} Antwort auf diesen Kommentar:\n\n"""\n${comment}\n"""\n\nHalte sie kurz, humorvoll und nicht beleidigend.`;
      if (articleContext && (articleContext.title || articleContext.content)) {
        prompt += `\n\nKontext - Der Kommentar bezieht sich auf diesen Artikel:\nTitel: ${articleContext.title}\n`;
        if (articleContext.content) {
          prompt += `Artikel-Inhalt: ${articleContext.content}\n`;
        }
      }
      return prompt;
    }
  },
  it: {
    tones: { funny: 'divertente', sarcastic: 'sarcastica', mild: 'gentile' },
    system: `Sei un assistente arguto e conciso che scrive risposte brevi e incisive ai commenti su internet. Mantieni le risposte tra 10 e 60 parole.`,
    user: (tone, comment, articleContext) => {
      let prompt = `Scrivi una risposta ${tone} a questo commento:\n\n"""\n${comment}\n"""\n\nMantienila breve, divertente e non offensiva.`;
      if (articleContext && (articleContext.title || articleContext.content)) {
        prompt += `\n\nContesto - Il commento riguarda questo articolo:\nTitolo: ${articleContext.title}\n`;
        if (articleContext.content) {
          prompt += `Contenuto dell'articolo: ${articleContext.content}\n`;
        }
      }
      return prompt;
    }
  },
  sv: {
    tones: { funny: 'roligt', sarcastic: 'sarkastiskt', mild: 'milt' },
    system: `Du är en kvick, koncis assistent som skriver korta, slagfärdiga svar på internetkommentarer. Håll svaren mellan 10 och 60 ord.`,
    user: (tone, comment, articleContext) => {
      let prompt = `Skriv ett ${tone} svar på denna kommentar:\n\n"""\n${comment}\n"""\n\nHåll det kort, humoristiskt och inte kränkande.`;
      if (articleContext && (articleContext.title || articleContext.content)) {
        prompt += `\n\nKontext - Kommentaren handlar om den här artikeln:\nTitel: ${articleContext.title}\n`;
        if (articleContext.content) {
          prompt += `Artikelinnehåll: ${articleContext.content}\n`;
        }
      }
      return prompt;
    }
  }
};

// Simple language detection based on character patterns
function detectLanguage(text) {
  const sample = text.slice(0, 500).toLowerCase();
  
  // Chinese (simplified/traditional) - detect CJK characters
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(sample)) return 'zh';
  
  // Japanese - detect hiragana/katakana
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(sample)) return 'ja';
  
  // Arabic - detect Arabic script
  if (/[\u0600-\u06ff\u0750-\u077f]/.test(sample)) return 'ar';
  
  // Hindi/Bengali - detect Devanagari/Bengali script
  if (/[\u0900-\u097f]/.test(sample)) return 'hi';
  if (/[\u0980-\u09ff]/.test(sample)) return 'bn';
  
  // Russian - detect Cyrillic
  if (/[\u0400-\u04ff]/.test(sample)) return 'ru';
  
  // For Latin-script languages, use common words/patterns
  const latinWords = {
    de: /\b(der|die|das|den|dem|des|ein|eine|und|in|zu|ist|von|mit|auf|für|nicht|sich|auch|aus|ich|sie|er)\b/g,
    es: /\b(el|la|los|las|de|que|es|en|un|una|por|con|para|está|como|muy|pero|sido)\b/g,
    fr: /\b(le|la|les|de|des|un|une|et|est|dans|pour|qui|avec|ce|il|elle|sont|plus|pas)\b/g,
    it: /\b(il|lo|la|i|gli|le|di|da|in|con|su|per|tra|fra|a|è|sono|ha|hanno|che|non|un|una)\b/g,
    pt: /\b(o|a|os|as|de|que|em|um|uma|para|com|não|se|por|mais|como|mas|foi|ele|ela)\b/g,
    sv: /\b(och|i|att|det|som|på|är|av|för|med|till|en|ett|den|har|de|inte|om|var|ett|han|hon)\b/g,
    en: /\b(the|is|are|was|were|have|has|had|be|been|do|does|did|will|would|can|could|may|might)\b/g
  };
  
  let maxCount = 0;
  let detectedLang = 'en';
  
  for (const [lang, pattern] of Object.entries(latinWords)) {
    const matches = sample.match(pattern);
    const count = matches ? matches.length : 0;
    if (count > maxCount) {
      maxCount = count;
      detectedLang = lang;
    }
  }
  
  return detectedLang;
}

// Load supported sites configuration
let SUPPORTED_SITES = {};

async function loadSitesConfig() {
  try {
    const response = await fetch(chrome.runtime.getURL('src/sites.json'));
    SUPPORTED_SITES = await response.json();
    console.log('SIWOTI: Loaded sites config:', Object.keys(SUPPORTED_SITES));
  } catch (error) {
    console.error('SIWOTI: Failed to load sites config:', error);
    SUPPORTED_SITES = {};
  }
}

// Check if a hostname is supported
async function isSiteSupported(hostname) {
  // Ensure sites config is loaded
  if (Object.keys(SUPPORTED_SITES).length === 0) {
    await loadSitesConfig();
  }
  
  return Object.keys(SUPPORTED_SITES).some(pattern => {
    // Convert glob pattern to regex (simple implementation for *.domain.com patterns)
    const regex = new RegExp(pattern.replace('*', '.*').replace(/\./g, '\\.'));
    return regex.test(hostname);
  });
}

// Update context menu based on current tab
async function updateContextMenu(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) return;
    
    const url = new URL(tab.url);
    const hostname = url.hostname;
    const supported = await isSiteSupported(hostname);
    
    // Remove existing menu item
    chrome.contextMenus.removeAll(() => {
      // Add menu item only for supported sites
      if (supported) {
        chrome.contextMenus.create({
          id: 'siwoti-generate-reply',
          title: 'Generate gotcha reply',
          contexts: ['selection', 'page']
        });
        console.log('SIWOTI: Context menu enabled for', hostname);
      } else {
        console.log('SIWOTI: Context menu disabled for unsupported site', hostname);
      }
    });
  } catch (error) {
    console.error('SIWOTI: Failed to update context menu:', error);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log('SIWOTI extension installed (PoC)');
  await loadSitesConfig();
  
  // Get current active tab and update menu
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id) {
      updateContextMenu(activeTab.id);
    }
  } catch (error) {
    console.log('SIWOTI: No active tab on install');
  }
});

// Handle extension startup (when browser starts)
chrome.runtime.onStartup.addListener(async () => {
  console.log('SIWOTI extension starting up');
  await loadSitesConfig();
  
  // Update context menu for current active tab
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id) {
      updateContextMenu(activeTab.id);
    }
  } catch (error) {
    console.log('SIWOTI: No active tab on startup');
  }
});

// Listen for tab updates (URL changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only update when the URL changes and the tab is active
  if (changeInfo.url && tab.active) {
    await updateContextMenu(tabId);
  }
});

// Listen for tab activation (switching between tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await updateContextMenu(activeInfo.tabId);
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'siwoti-generate-reply' && tab.id && tab.url) {
    // Double-check site is supported before proceeding
    const url = new URL(tab.url);
    const hostname = url.hostname;
    if (!(await isSiteSupported(hostname))) {
      console.log('SIWOTI: Context menu clicked on unsupported site, ignoring');
      return;
    }

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
async function callOpenAI(commentText, tone, articleContext = null) {
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

      // Detect language and get appropriate prompts
      const detectedLang = detectLanguage(commentText);
      const langPrompts = LANGUAGE_PROMPTS[detectedLang] || LANGUAGE_PROMPTS.en;
      
      // Translate tone to the detected language
      const translatedTone = langPrompts.tones[tone] || tone;
      
      console.log('🌍 Detected language:', detectedLang);
      console.log('🎭 Tone:', tone, '→', translatedTone);
      console.log('📰 Article context:', articleContext ? {
        hasTitle: !!articleContext.title,
        titleLength: articleContext.title?.length || 0,
        hasContent: !!articleContext.content,
        contentLength: articleContext.content?.length || 0,
        url: articleContext.url
      } : 'None');
      
      const system = langPrompts.system;
      const prompt = langPrompts.user(translatedTone, commentText, articleContext);
      
      console.log('💬 Generated prompt preview:');
      console.log(prompt.substring(0, 500) + (prompt.length > 500 ? '...' : ''));

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
    const articleContext = msg.articleContext || null;
    
    // Detect language for cache key
    const detectedLang = detectLanguage(comment);
    
    // Include article context in cache key if present
    const contextKey = articleContext ? `${articleContext.title}|${articleContext.url}` : '';
    const cacheKey = hashKey(comment + contextKey, tone, detectedLang);
    if (replyCache.has(cacheKey)) {
      console.log('Returning cached reply for:', comment.slice(0, 50), '(lang:', detectedLang + ')');
      sendResponse({ reply: replyCache.get(cacheKey), cached: true });
      return true;
    }
    
    // Always call OpenAI (no fallback placeholder)
    callOpenAI(comment, tone, articleContext).then((reply) => {
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
