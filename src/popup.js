console.log('popup.js loaded');

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded fired');
  
  const scanBtn = document.getElementById('scan');
  const status = document.getElementById('status');
  const apikey = document.getElementById('apikey');
  const tone = document.getElementById('tone');
  const apibase = document.getElementById('apibase');
  const model = document.getElementById('model');
  const toggleKey = document.getElementById('toggleKey');
  const siteEnable = document.getElementById('siteEnable');
  const currentSite = document.getElementById('currentSite');
  const toggleConfig = document.getElementById('toggleConfig');
  const configContent = document.getElementById('configContent');
  const configSection = document.querySelector('.collapsible');
  
  console.log('Elements found:', {
    toggleConfig: toggleConfig,
    configContent: configContent,
    configSection: configSection
  });
  
  // Disable transitions initially to prevent animation on load
  if (configSection) {
    configSection.style.transition = 'none';
  }
  
  // Get current tab hostname
  let currentHostname = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const url = new URL(tab.url);
      currentHostname = url.hostname;
      currentSite.textContent = currentHostname;
    }
  } catch (e) {
    console.error('Failed to get current tab:', e);
    currentSite.textContent = 'Unknown site';
  }

  // Load settings
  chrome.storage.local.get([
    'siwoti_apiKey', 
    'siwoti_apiBase', 
    'siwoti_model', 
    'siwoti_tone',
    'siwoti_disabledSites'
  ], (data) => {
    if (data && data.siwoti_apiKey) apikey.value = data.siwoti_apiKey;
    if (data && data.siwoti_apiBase) apibase.value = data.siwoti_apiBase;
    if (data && data.siwoti_model) model.value = data.siwoti_model;
    if (data && data.siwoti_tone) tone.value = data.siwoti_tone;
    
  // Load enable states
    const disabledSites = data.siwoti_disabledSites || [];
    const siteEnabled = !disabledSites.includes(currentHostname);
    siteEnable.checked = siteEnabled;
    
    // Check if user has API settings configured
    const hasApiSettings = !!(data && (data.siwoti_apiKey || data.siwoti_apiBase || data.siwoti_model));

    // If no API settings at all, show all fields by expanding without animation (no-init-anim prevents transitions)
    if (!hasApiSettings) {
      configSection.classList.remove('collapsed');
      console.log('No API settings found. Expanding config (no animation).');
    } else {
      // Ensure stays collapsed by default
      configSection.classList.add('collapsed');
    }
    // Keep no-init-anim class until first user interaction.
    console.log('Initial state set. hasApiSettings:', hasApiSettings);
    
    console.log('Loaded settings:', { 
      apiKey: data && data.siwoti_apiKey ? '***' + data.siwoti_apiKey.slice(-4) : 'none',
      apiBase: data && data.siwoti_apiBase || 'none',
      model: data && data.siwoti_model || 'none',
      tone: data && data.siwoti_tone || 'funny',
      siteEnabled,
      currentHostname,
      hasApiSettings
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

  // Auto-save tone on change
  tone.addEventListener('change', () => {
    console.log('Tone changed to:', tone.value);
    const selectedTone = tone.value;
    chrome.storage.local.set({ siwoti_tone: selectedTone }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving tone:', chrome.runtime.lastError);
      } else {
        console.log('Tone saved successfully:', selectedTone);
        showStatus('✓ Tone saved');
      }
    });
  });

  // Auto-save API fields on blur
  apikey.addEventListener('blur', () => {
    const key = apikey.value.trim();
    chrome.storage.local.set({ siwoti_apiKey: key }, () => {
      if (!chrome.runtime.lastError) {
        showStatus(key ? '✓ API key saved' : '✓ API key cleared');
      }
    });
  });

  apibase.addEventListener('blur', () => {
    const base = apibase.value.trim();
    chrome.storage.local.set({ siwoti_apiBase: base }, () => {
      if (!chrome.runtime.lastError) {
        showStatus(base ? '✓ API base saved' : '✓ Using default');
      }
    });
  });

  model.addEventListener('blur', () => {
    const mdl = model.value.trim();
    chrome.storage.local.set({ siwoti_model: mdl }, () => {
      if (!chrome.runtime.lastError) {
        showStatus(mdl ? '✓ Model saved' : '✓ Using auto-detect');
      }
    });
  });

  // Removed global enable toggle; extension is always globally on. Use site toggle instead.

  // Site enable toggle
  siteEnable.addEventListener('change', () => {
    const enabled = siteEnable.checked;
    chrome.storage.local.get(['siwoti_disabledSites'], (data) => {
      let disabledSites = data.siwoti_disabledSites || [];
      
      if (enabled) {
        // Remove from disabled list
        disabledSites = disabledSites.filter(site => site !== currentHostname);
      } else {
        // Add to disabled list
        if (!disabledSites.includes(currentHostname)) {
          disabledSites.push(currentHostname);
        }
      }
      
      chrome.storage.local.set({ siwoti_disabledSites: disabledSites }, () => {
        if (!chrome.runtime.lastError) {
          showStatus(enabled ? `✓ Enabled for ${currentHostname}` : `✓ Disabled for ${currentHostname}`);
          console.log('Site enabled:', enabled, 'for', currentHostname);
        }
      });
    });
  });

  // Collapsible config section toggle handler
  if (toggleConfig && configSection) {
    console.log('Attaching click handler to toggleConfig button');
    toggleConfig.addEventListener('click', (e) => {
      console.log('Toggle clicked!');
      e.preventDefault();
      e.stopPropagation();

      // Ensure transitions are enabled after first user interaction (remove no-init-anim)
      if (configSection.classList.contains('no-init-anim')) {
        console.log('Removing no-init-anim to enable transitions');
        configSection.classList.remove('no-init-anim');
      }
      
      const isCollapsed = configSection.classList.contains('collapsed');
      console.log('Current state - collapsed:', isCollapsed);
      
      if (isCollapsed) {
        configSection.classList.remove('collapsed');
        console.log('Config expanded - classes:', configSection.className);
      } else {
        configSection.classList.add('collapsed');
        console.log('Config collapsed - classes:', configSection.className);
      }
    });
  } else {
    console.error('Could not attach click handler - missing elements:', {
      toggleConfig: toggleConfig,
      configSection: configSection
    });
  }

  // Helper to show status messages
  function showStatus(message, duration = 2000) {
    status.textContent = message;
    setTimeout(() => (status.textContent = ''), duration);
  }

  scanBtn.addEventListener('click', async () => {
    showStatus('🔍 Scanning...', 5000);
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        showStatus('❌ No active tab');
        return;
      }

      // tell content script to scan
      chrome.tabs.sendMessage(tab.id, { type: 'scan' }, (response) => {
        if (chrome.runtime.lastError) {
          showStatus('❌ Extension not active on this page', 3000);
          console.warn(chrome.runtime.lastError.message);
          return;
        }
        if (response && response.found) {
          const count = response.count || 0;
          showStatus(`✓ Found ${count} comment${count !== 1 ? 's' : ''}! Click "Suggest" buttons on page`, 4000);
        } else {
          showStatus('ℹ️ No comments detected on this page', 3000);
        }
      });
    } catch (err) {
      console.error(err);
      showStatus('❌ Scan error');
    }
  });
});
