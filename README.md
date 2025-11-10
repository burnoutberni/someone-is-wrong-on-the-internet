## Someone is wrong on the internet! (PoC)

This is a minimal proof-of-concept browser extension that scans pages for comment sections and identifies a likely "most stupid" comment (very simple heuristics). It can generate a suggested gotcha-style reply using an AI provider (OpenAI-compatible integration included as a PoC). Replace or configure the API provider and key as needed.

Files of interest:
- `manifest.json` - extension manifest (MV3)
- `src/content.js` - content script that scans the page and adds UI
- `src/background.js` - service worker handling generation requests (calls OpenAI-compatible endpoint if configured)
- `src/popup.html` / `src/popup.js` - popup UI to control scans and store API key and API base URL
- `src/styles.css` - popup and injected styles

How to load (Chrome / Edge / Brave):
1. Open chrome://extensions (or edge://extensions).
2. Enable "Developer mode".
3. Click "Load unpacked" and choose this project folder (`someone-is-wrong-on-the-internet`).
4. Open a website with comments (e.g., news article or forum), open the extension popup and click "Scan page for comments".

How to load and test in Firefox (temporary add-on):
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox` (or open Tools -> Web Developer -> Debug Add-ons).
2. Click "Load Temporary Add-on".
3. In the file chooser, select the `manifest.json` file inside this project folder.
4. The extension will load temporarily; open a page with comments, open the popup, and click "Scan page for comments".

Notes about Firefox and Manifest V3: Firefox has partial support for MV3 features; content scripts and the popup should work for testing. The background service worker behavior may differ between Chrome and Firefox. If you see the background not responding in Firefox, try the injected "Suggest reply" button or test generation in Chrome for full MV3 behavior.

How to enable real AI replies (OpenAI-compatible):
1. Open the extension popup in your browser.
2. Paste your OpenAI API key into the "AI API key" field and click "Save". No key is included in this repository — you must provide your own.
3. By default the extension uses `https://api.openai.com` as the API base. If you prefer a custom proxy or different server, paste its base URL into the "AI API base URL" field and click "Save base".
4. On a page with comments, click "Scan page for comments", then click the injected "Suggest reply" button to generate an AI reply. The background service worker will call the configured endpoint using your saved key.

Security & privacy notes:
- The extension stores the API key in `chrome.storage.local` on your machine. Do not commit or share your key.
- When you request a generated reply, page content (the selected comment) will be sent to the configured API endpoint. Only enable the key if you consent to that behavior.

If you'd like, I can implement a small server-side proxy so the API key never resides on the client and to add usage controls — tell me if you want that.

Notes / next steps:
- Detection heuristics are intentionally simple. For better results, add site-specific selectors or use more advanced NLP heuristics.
- If you want stricter privacy, we can add an explicit consent modal before sending page content off-device.

This is a small demo to iterate from — tell me which next step you want me to implement.