## Someone is wrong on the internet! ![Extension Icon](icons/icon-32.png)

A browser extension that automatically scans web pages for comment sections, identifies potentially problematic comments using simple heuristics, and generates witty AI-powered replies to help you engage with internet discussions more effectively (and humorously).

### Features

- **Smart Comment Detection**: Automatically finds comment sections on web pages using both generic and site-specific selectors
- **Shadow DOM Support**: Works with modern sites that use shadow DOM (like derstandard.at)
- **AI-Powered Replies**: Generates contextual, witty responses using OpenAI-compatible APIs
- **Multi-language Support**: Supports English, Chinese, Hindi, Spanish, French, German, Arabic, Japanese, Russian, Italian and Swedish
- **Multiple Tone Options**: Choose between funny, sarcastic, or mild response tones
- **Site Management**: Enable/disable the extension per website
- **Response Caching**: Avoids duplicate API calls for similar comments
- **Privacy Controls**: Configurable API settings with local storage

### Files Structure
- `manifest.json` - Extension manifest (Manifest V3)
- `src/content.js` - Content script that scans pages, detects comments, and injects UI elements
- `src/background.js` - Service worker handling AI reply generation with multi-language support
- `src/popup.html` / `src/popup.js` - Extension popup with settings and controls
- `src/sites.json` - Site-specific comment selectors configuration
- `src/styles.css` - Styling for popup and injected elements

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

### Configuration & Setup

**Setting up AI Integration:**
1. Open the extension popup and expand the configuration section
2. Enter your OpenAI API key (or compatible service key)
3. Optionally configure:
   - API Base URL (defaults to `https://api.openai.com`)
   - AI Model (defaults to `gpt-4o-mini`)
   - Default tone (funny, sarcastic, or mild)
4. Save your settings

**Using the Extension:**
1. Navigate to any website with comments
2. Click "Scan page for comments" in the extension popup
3. The extension will highlight detected comments and show a "most problematic" one
4. Click "Suggest reply" on any highlighted comment to generate an AI response
5. Choose your preferred tone and language for the response
6. Copy the generated reply or use it as inspiration

**Site Management:**
- Toggle the extension on/off for specific websites using the site controls in the popup
- The extension remembers your preferences per site

Security & privacy notes:
- The extension stores the API key in `chrome.storage.local` on your machine. Do not commit or share your key.
- When you request a generated reply, page content (the selected comment) will be sent to the configured API endpoint. Only enable the key if you consent to that behavior.

If you'd like, I can implement a small server-side proxy so the API key never resides on the client and to add usage controls — tell me if you want that.

### Current Capabilities

**Comment Detection:**
- Supports generic comment selectors (role="comment", .comment classes, etc.)
- Site-specific selectors for known platforms (derstandard.at implemented)
- Shadow DOM traversal for modern web components
- Configurable via `sites.json` for easy extension

**AI Reply Generation:**
- Multi-language support (9 languages with localized prompts)
- Three tone options with language-appropriate translations
- Response caching to minimize API usage
- Contextual prompts that understand comment content

**User Interface:**
- Clean popup with collapsible configuration
- Real-time feedback and status updates
- Visual highlighting of detected comments
- Easy-to-use reply generation buttons

### Technical Details

- **Manifest V3** compatible for modern browser requirements
- **Service Worker** architecture for reliable background processing
- **Shadow DOM** support for sites using web components
- **Cross-site compatibility** with fallback selectors
- **Local storage** for secure API key management
- **Response caching** to optimize API usage and costs

### Development Notes

The extension uses simple but effective heuristics to identify potentially problematic comments:
- Comments with inflammatory language get higher scores
- Very short comments (likely low-effort) are prioritized
- Extremely long comments are deprioritized to focus on quick responses

Site-specific selectors can be easily added to `sites.json` to improve detection on new platforms.