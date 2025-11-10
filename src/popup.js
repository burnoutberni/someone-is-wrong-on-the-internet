console.log('popup.js loaded');

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded fired');
  
  const scanBtn = document.getElementById('scan');
  const status = document.getElementById('status');
  const result = document.getElementById('result');
  const apikey = document.getElementById('apikey');
  const saveKey = document.getElementById('saveKey');
  const tone = document.getElementById('tone');
  const apibase = document.getElementById('apibase');
  const saveBase = document.getElementById('saveBase');
  const model = document.getElementById('model');
  const saveModel = document.getElementById('saveModel');
  const toggleKey = document.getElementById('toggleKey');
  
  console.log('Elements found:', { scanBtn, status, saveKey, saveBase, saveModel, toggleKey });

  // load stored API key, base, and model (if any)
  chrome.storage.local.get(['siwoti_apiKey', 'siwoti_apiBase', 'siwoti_model'], (data) => {
    if (data && data.siwoti_apiKey) apikey.value = data.siwoti_apiKey;
    if (data && data.siwoti_apiBase) apibase.value = data.siwoti_apiBase;
    if (data && data.siwoti_model) model.value = data.siwoti_model;
    console.log('Loaded settings:', { 
      apiKey: data && data.siwoti_apiKey ? '***' + data.siwoti_apiKey.slice(-4) : 'none',
      apiBase: data && data.siwoti_apiBase || 'none',
      model: data && data.siwoti_model || 'none'
    });
  });

  // Toggle API key visibility
  toggleKey.addEventListener('click', () => {
    if (apikey.type === 'password') {
      apikey.type = 'text';
      toggleKey.textContent = '🙈';
    } else {
      apikey.type = 'password';
      toggleKey.textContent = '👁️';
    }
  });

  // Save API key locally (no key is shipped with this project)
  saveKey.addEventListener('click', () => {
    console.log('Save key clicked');
    const key = apikey.value.trim();
    console.log('Saving key:', key ? '***' + key.slice(-4) : 'empty');
    chrome.storage.local.set({ siwoti_apiKey: key }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving key:', chrome.runtime.lastError);
        status.textContent = 'Error saving key!';
      } else {
        status.textContent = key ? 'API key saved.' : 'API key cleared.';
        console.log('Key saved successfully');
      }
      setTimeout(() => (status.textContent = ''), 2200);
    });
  });

  // Save API base URL (e.g., https://api.openai.com or http://localhost:11434 for Ollama)
  saveBase.addEventListener('click', () => {
    console.log('Save base clicked');
    const base = apibase.value.trim();
    console.log('Saving base:', base || 'empty');
    chrome.storage.local.set({ siwoti_apiBase: base }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving base:', chrome.runtime.lastError);
        status.textContent = 'Error saving base!';
      } else {
        status.textContent = base ? 'API base saved: ' + base : 'API base cleared (default: OpenAI)';
        console.log('Base saved successfully');
      }
      setTimeout(() => (status.textContent = ''), 3000);
    });
  });

  // Save model name (e.g., gpt-3.5-turbo, llama3.2)
  saveModel.addEventListener('click', () => {
    console.log('Save model clicked');
    const mdl = model.value.trim();
    console.log('Saving model:', mdl || 'empty');
    chrome.storage.local.set({ siwoti_model: mdl }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving model:', chrome.runtime.lastError);
        status.textContent = 'Error saving model!';
      } else {
        status.textContent = mdl ? 'Model saved: ' + mdl : 'Model cleared (auto-detect)';
        console.log('Model saved successfully');
      }
      setTimeout(() => (status.textContent = ''), 2200);
    });
  });

  scanBtn.addEventListener('click', async () => {
    status.textContent = 'Scanning...';
    result.textContent = '';
    // set tone for content script
    const selectedTone = tone.value || 'funny';
    // write a small script to set the tone variable for the page's content script
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        status.textContent = 'No active tab.';
        return;
      }
      // set a page-global variable used by content script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (t) => { window.__SIWOTI_TONE = t; },
        args: [selectedTone]
      });

      // tell content script to scan (content script listens for messages)
      chrome.tabs.sendMessage(tab.id, { type: 'scan' }, (response) => {
        if (chrome.runtime.lastError) {
          status.textContent = 'Scan failed: content script not active on this page.';
          console.warn(chrome.runtime.lastError.message);
          return;
        }
        if (response && response.found) {
          status.textContent = 'Found a candidate comment. Click the highlight on page to get a suggested reply.';
          result.textContent = 'Detected comment: ' + (response.text || '(text not returned)');
        } else {
          status.textContent = 'No comment section detected.';
        }
        setTimeout(() => (status.textContent = ''), 3000);
      });
    } catch (err) {
      console.error(err);
      status.textContent = 'Error during scan.';
    }
  });
});
