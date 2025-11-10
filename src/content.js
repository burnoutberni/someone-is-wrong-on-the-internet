// Content script: scans the page for comment sections and highlights a "most stupid" comment.

const COMMENT_SELECTORS = [
  '[role="comment"]',
  '[aria-label*="comment"]',
  '.comment',
  '.comments',
  '.c-comments',
  'section[id*="comment"]',
  'article[id*="comment"]',
  '.reply',
  '.thread'
];

// Site-specific selectors for known comment platforms
const SITE_SELECTORS = {
  'derstandard.at': [
    '.posting--content'
  ]
};

const STUPID_WORDS = ['lol', 'wtf', 'stupid', 'idiot', 'moron', 'dumb', 'nonsense'];

// Get site-specific selectors for the current domain
function getSiteSelectors() {
  const hostname = window.location.hostname;
  for (const [domain, selectors] of Object.entries(SITE_SELECTORS)) {
    if (hostname.includes(domain)) {
      return [...(COMMENT_SELECTORS || []), ...selectors];
    }
  }
  return COMMENT_SELECTORS;
}

// Simple heuristic scoring: shorter comments and presence of insult words increase score.
function stupidityScore(text) {
  if (!text) return 0;
  const t = text.trim();
  let score = 0;
  if (t.length < 40) score += 2;
  if (t.length < 15) score += 2;
  const lower = t.toLowerCase();
  for (const w of STUPID_WORDS) if (lower.includes(w)) score += 3;
  // penalize very long comments
  if (t.length > 800) score -= 2;
  return score;
}

// Traverse shadow DOM to find comment elements (for derstandard.at and similar sites)
function querySelectorAllDeep(root, selector) {
  const results = [];
  const traverse = (node) => {
    // query in current (light) DOM
    try {
      const found = node.querySelectorAll(selector);
      results.push(...Array.from(found));
    } catch (e) {}
    // traverse into shadow roots
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
    let el;
    while ((el = walker.nextNode())) {
      if (el.shadowRoot) {
        traverse(el.shadowRoot);
      }
    }
  };
  traverse(root);
  return results;
}

// For derstandard.at: pierce into dst-forum shadow root
function gatherShadowCandidates() {
  const candidates = new Map();
  const hostname = window.location.hostname;
  if (!hostname.includes('derstandard.at')) return candidates;

  // find dst-forum elements
  const forums = document.querySelectorAll('dst-forum');
  for (const forum of forums) {
    if (!forum.shadowRoot) continue;
    const selectors = getSiteSelectors();
    for (const sel of selectors) {
      const found = querySelectorAllDeep(forum.shadowRoot, sel);
      for (const el of found) {
        const text = (el.innerText || el.textContent || '').trim();
        if (text.length > 0 && text.length < 2000) {
          candidates.set(el, text);
        }
      }
    }
    // also try generic traversal for comment-like elements
    const commentLike = querySelectorAllDeep(forum.shadowRoot, 'article, div[class*="comment"], li[class*="comment"], p[class*="comment"]');
    for (const el of commentLike) {
      const text = (el.innerText || el.textContent || '').trim();
      if (text.length > 5 && text.length < 2000 && !candidates.has(el)) {
        candidates.set(el, text);
      }
    }
  }
  return candidates;
}

function gatherCandidateComments() {
  const candidates = new Map();
  const selectors = getSiteSelectors(); // get site-specific selectors

  // For derstandard.at: first gather from shadow DOM
  const shadowCandidates = gatherShadowCandidates();
  for (const [el, text] of shadowCandidates.entries()) {
    candidates.set(el, text);
  }

  // find by selectors (including site-specific ones) in regular DOM
  for (const sel of selectors) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const text = (el.innerText || el.textContent || '').trim();
      if (text.length === 0) continue;
      candidates.set(el, text);
    }
  }

  // Only scan for comment containers if we have very few candidates from selectors
  if (candidates.size < 5) {
    // scan for common comment container elements by heuristics (more conservative)
    for (const el of Array.from(document.querySelectorAll('div[role="comment"], article[role="comment"]'))) {
      if (candidates.has(el)) continue;
      const text = (el.innerText || el.textContent || '').trim();
      if (text.length >= 10 && text.length <= 1000) {
        candidates.set(el, text);
      }
    }

    // lastly, try to find elements that are repeated multiple times with similar class names
    // Only if we have comment-like class names
    const classCounts = {};
    for (const el of Array.from(document.querySelectorAll('div[class*="comment"], li[class*="comment"], article[class*="comment"], div[class*="post"], li[class*="post"]'))) {
      const cls = el.className.split(' ').find(c => /comment|post|reply/i.test(c));
      if (!cls) continue;
      classCounts[cls] = (classCounts[cls] || 0) + 1;
    }
    
    for (const [cls, cnt] of Object.entries(classCounts)) {
      // Require at least 3 instances to be confident it's a comment pattern
      if (cnt < 3 || cnt > 100) continue; // also cap at 100 to avoid nav items etc
      
      for (const el of Array.from(document.querySelectorAll(`.${CSS.escape(cls)}`))) {
        if (candidates.has(el)) continue;
        const text = (el.innerText || el.textContent || '').trim();
        // More conservative: require reasonable comment length
        if (text.length >= 20 && text.length <= 800) {
          // Skip if contains too many links (likely nav/menu)
          const linkCount = el.querySelectorAll('a').length;
          const wordCount = text.split(/\s+/).length;
          if (linkCount > 0 && linkCount / wordCount > 0.3) continue;
          
          candidates.set(el, text);
        }
      }
    }
  }

  return candidates;
}

function pickMostStupid(candidates) {
  let best = null;
  let bestScore = -Infinity;
  for (const [el, text] of candidates.entries()) {
    const s = stupidityScore(text);
    if (s > bestScore) {
      bestScore = s;
      best = { el, text, score: s };
    }
  }
  return best;
}

// Track overlays we inject so we can remove them safely
window.__SIWOTI_OVERLAYS = window.__SIWOTI_OVERLAYS || [];

function clearHighlights() {
  document.querySelectorAll('.siwoti-highlight').forEach(el => {
    el.classList.remove('siwoti-highlight');
    // remove inline outline
    el.style.outline = '';
  });
  // remove floating overlays and boxes
  (window.__SIWOTI_OVERLAYS || []).forEach(node => {
    try { node.remove(); } catch (e) {}
  });
  window.__SIWOTI_OVERLAYS = [];
}

function getSafeContainer(el) {
  // walk up to find a reasonable container for the comment that is not an anchor or button
  let cur = el;
  while (cur && cur !== document.body) {
    const tag = cur.tagName && cur.tagName.toLowerCase();
    if (tag === 'a' || tag === 'button') {
      cur = cur.parentElement;
      continue;
    }
    // stop if this element itself looks like a comment container (has text nodes and not too big)
    const text = (cur.innerText || cur.textContent || '').trim();
    if (text.length > 0 && text.length < 2000) return cur;
    cur = cur.parentElement;
  }
  return el;
}

function attachReplyButton(targetEl, commentText) {
  // Use a floating overlay outside the comment element to avoid triggering underlying links.
  clearFloatingForElement(targetEl);
  const rect = targetEl.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.className = 'siwoti-overlay';
  // position overlay near the top-right of the target element
  overlay.style.position = 'absolute';
  overlay.style.zIndex = 2147483647; // very high
  overlay.style.left = (window.scrollX + rect.right - 10) + 'px';
  overlay.style.top = (window.scrollY + rect.top + 6) + 'px';
  overlay.style.pointerEvents = 'auto';

  // small button
  const btn = document.createElement('button');
  btn.textContent = 'Suggest';
  btn.className = 'siwoti-reply-btn';
  btn.style.padding = '6px 8px';
  btn.style.cursor = 'pointer';
  btn.style.borderRadius = '6px';
  btn.style.background = '#0b5cff';
  btn.style.color = 'white';
  btn.style.border = 'none';
  btn.style.fontSize = '12px';
  btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';

  // prevent clicks from reaching the page underneath
  overlay.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    btn.textContent = '...';
    btn.disabled = true;
    
    // Get tone from storage
    chrome.storage.local.get(['siwoti_tone'], (data) => {
      const tone = (data && data.siwoti_tone) || 'funny';
      console.log('🎯 Requesting reply generation:', {
        fullComment: commentText,
        commentLength: commentText.length,
        tone
      });
      
      // request generation from background/service worker
      chrome.runtime.sendMessage({ type: 'generateReply', comment: commentText, tone }, (response) => {
      btn.textContent = 'Suggest';
      btn.disabled = false;
      
      console.log('🎯 Received response:', response);
      
        btn.textContent = 'Suggest';
        btn.disabled = false;
        
        console.log('🎯 Received response:', response);
        
        if (response && response.reply) {
          console.log('✅ Got reply:', response.reply.slice(0, 100) + (response.reply.length > 100 ? '...' : ''));
          showSuggestedReplyFloating(targetEl, response.reply, overlay, response.cached);
        } else {
          const errMsg = response && response.error ? response.error : 'AI API call failed. Check your API key in the extension popup.';
          console.error('❌ Reply generation failed:', errMsg);
          showSuggestedReplyFloating(targetEl, errMsg, overlay, false, true);
        }
      });
    });
  });

  overlay.appendChild(btn);
  document.body.appendChild(overlay);
  window.__SIWOTI_OVERLAYS.push(overlay);
}

function clearFloatingForElement(targetEl) {
  (window.__SIWOTI_OVERLAYS || []).forEach(node => {
    try {
      // remove overlays near this element
      const rect = targetEl.getBoundingClientRect();
      const nrect = node.getBoundingClientRect();
      const dx = Math.abs(nrect.left - (window.scrollX + rect.right));
      const dy = Math.abs(nrect.top - (window.scrollY + rect.top));
      if (dx < 100 && dy < 100) node.remove();
    } catch (e) {}
  });
  window.__SIWOTI_OVERLAYS = (window.__SIWOTI_OVERLAYS || []).filter(n => document.body.contains(n));
}

function showSuggestedReplyFloating(targetEl, replyText, anchorOverlay, isCached, isError) {
  // remove existing floating boxes
  (window.__SIWOTI_OVERLAYS || []).forEach(n => {
    if (n && n.classList && n.classList.contains('siwoti-reply-box-floating')) n.remove();
  });

  const rect = targetEl.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = 'siwoti-reply-box-floating';
  box.style.position = 'absolute';
  box.style.zIndex = 2147483647;
  // prefer placing below the anchor overlay
  const ax = anchorOverlay.getBoundingClientRect();
  box.style.left = (window.scrollX + ax.left - 220) + 'px';
  box.style.top = (window.scrollY + ax.bottom + 6) + 'px';
  box.style.maxWidth = '360px';
  box.style.padding = '8px 10px';
  box.style.background = isError ? '#fff3f3' : 'white';
  box.style.border = isError ? '1px solid rgba(255,0,0,0.2)' : '1px solid rgba(0,0,0,0.12)';
  box.style.borderRadius = '8px';
  box.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
  box.style.fontSize = '13px';
  box.style.color = isError ? '#d00' : '#111';

  // add cached badge if applicable
  if (isCached && !isError) {
    const badge = document.createElement('span');
    badge.textContent = 'cached';
    badge.style.fontSize = '10px';
    badge.style.background = '#e0e0e0';
    badge.style.padding = '2px 6px';
    badge.style.borderRadius = '3px';
    badge.style.marginBottom = '6px';
    badge.style.display = 'inline-block';
    box.appendChild(badge);
  }

  // add text
  const p = document.createElement('div');
  p.textContent = replyText;
  p.style.marginTop = isCached ? '6px' : '0';
  box.appendChild(p);

  // add a tiny close button
  const close = document.createElement('button');
  close.textContent = '×';
  close.title = 'Close';
  close.style.position = 'absolute';
  close.style.right = '6px';
  close.style.top = '4px';
  close.style.border = 'none';
  close.style.background = 'transparent';
  close.style.cursor = 'pointer';
  close.style.fontSize = '14px';
  close.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); box.remove(); });
  box.appendChild(close);

  document.body.appendChild(box);
  window.__SIWOTI_OVERLAYS.push(box);
}

// Handle a user-provided comment text (from right-click context menu or manual selection)
function handleUserComment(commentText, tone) {
  if (!commentText || commentText.trim().length === 0) return;
  clearHighlights();
  
  // create a temporary container for the reply
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'fixed';
  tempContainer.style.left = '50%';
  tempContainer.style.top = '50%';
  tempContainer.style.transform = 'translate(-50%, -50%)';
  tempContainer.style.zIndex = 2147483647;
  
  // Get tone from storage if not provided
  chrome.storage.local.get(['siwoti_tone'], (data) => {
    const selectedTone = tone || (data && data.siwoti_tone) || 'funny';
    
    // request reply from background
    console.log('🎯 Right-click: requesting reply generation:', {
      fullComment: commentText,
      commentLength: commentText.length,
      tone: selectedTone
    });
    
    chrome.runtime.sendMessage({ type: 'generateReply', comment: commentText, tone: selectedTone }, (response) => {
    console.log('🎯 Right-click: received response:', response);
    
    const box = document.createElement('div');
    box.className = 'siwoti-reply-box-floating';
    box.style.maxWidth = '400px';
    box.style.padding = '12px 14px';
    box.style.borderRadius = '8px';
    box.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)';
    box.style.fontSize = '13px';
    box.style.fontFamily = 'sans-serif';
    
    const isError = !response || !response.reply;
    box.style.background = isError ? '#fff3f3' : 'white';
    box.style.border = isError ? '1px solid rgba(255,0,0,0.2)' : '1px solid rgba(0,0,0,0.12)';
    box.style.color = isError ? '#d00' : '#111';
    
    // title
    const title = document.createElement('div');
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '8px';
    title.style.fontSize = '13px';
      title.textContent = isError ? 'Error' : ('Suggested reply (' + selectedTone + ')' + (response.cached ? ' [cached]' : ''));
      box.appendChild(title);
      
      // reply text or error
      const p = document.createElement('div');
      p.textContent = response && response.reply ? response.reply : (response && response.error ? response.error : 'AI API call failed. Check your API key.');
      p.style.marginBottom = '10px';
      p.style.lineHeight = '1.4';
      box.appendChild(p);
      
      // button row
      const btnRow = document.createElement('div');
      btnRow.style.display = 'flex';
      btnRow.style.gap = '8px';
      
      if (!isError) {
        const copyBtn = document.createElement('button');
        copyBtn.textContent = 'Copy';
        copyBtn.style.padding = '6px 12px';
        copyBtn.style.fontSize = '12px';
        copyBtn.style.cursor = 'pointer';
        copyBtn.style.borderRadius = '4px';
        copyBtn.style.background = '#0b5cff';
        copyBtn.style.color = 'white';
        copyBtn.style.border = 'none';
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(response.reply).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
          });
        });
        btnRow.appendChild(copyBtn);
      }
      
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Close';
      closeBtn.style.padding = '6px 12px';
      closeBtn.style.fontSize = '12px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.borderRadius = '4px';
      closeBtn.style.background = '#ccc';
      closeBtn.style.border = 'none';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        tempContainer.remove();
        window.__SIWOTI_OVERLAYS = window.__SIWOTI_OVERLAYS.filter(n => n !== tempContainer);
      });
      btnRow.appendChild(closeBtn);
      
      box.appendChild(btnRow);
      tempContainer.appendChild(box);
      document.body.appendChild(tempContainer);
      window.__SIWOTI_OVERLAYS.push(tempContainer);
    });
  });
}

function scanAndHighlight() {
  clearHighlights();
  const candidates = gatherCandidateComments();
  if (candidates.size === 0) return { found: false };
  
  // attach a suggest button to ALL found comments
  let count = 0;
  for (const [el, text] of candidates.entries()) {
    const safe = getSafeContainer(el) || el;
    safe.classList.add('siwoti-highlight');
    safe.style.outline = '2px solid rgba(11,92,255,0.25)';
    attachReplyButton(safe, text);
    count++;
  }
  
  return { found: true, count, text: `Found ${count} comment(s)` };
}

// Listen for messages from popup / background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'scan') {
    const res = scanAndHighlight();
    sendResponse(res);
  }
  if (msg && msg.type === 'generateReplyFromSelection') {
    // right-click context menu triggered
    handleUserComment(msg.comment, msg.tone || 'funny');
    sendResponse({ ok: true });
  }
});

// Expose a window-level default tone for the page (can be set from popup)
window.__SIWOTI_TONE = window.__SIWOTI_TONE || 'funny';

// Auto-scan once on page load as part of PoC
try {
  setTimeout(() => {
    scanAndHighlight();
  }, 1200);
} catch (e) {
  // ignore
}
