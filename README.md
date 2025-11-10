# Someone is wrong on the internet! ![Extension Icon](icons/icon-32.png)

A browser extension that automatically scans web pages for comment sections and generates witty AI-powered replies to help you engage with internet discussions more effectively (and humorously).

## Installation

### Chrome / Edge / Brave
1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable "Developer mode"
3. Click "Load unpacked" and select this project folder
4. Navigate to a supported website and click "Scan page for comments" in the extension popup

### Firefox
1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select the `manifest.json` file from this project
4. Test on a supported website

> **Note**: Firefox has partial MV3 support. Service worker behavior may differ from Chrome.

## Configuration

### AI Integration Setup
1. Open the extension popup and expand the configuration section
2. Enter your OpenAI API key (or compatible service key)
3. Optionally configure:
   - API Base URL (defaults to `https://api.openai.com`)
   - AI Model (defaults to `gpt-4o-mini`)
   - Default tone (funny, sarcastic, or mild)
4. Save your settings

## Usage
1. Navigate to a supported website (see `sites.json` for the list)
2. Click "Scan page for comments" in the extension popup
3. The extension will highlight detected comments on supported sites
4. Generate replies by:
   - Clicking "Suggest reply" on highlighted comments, or
   - Right-clicking text and selecting "Generate gotcha reply"
5. Choose your preferred tone and language
6. Copy the generated reply or use it as inspiration

## Supported Sites

**Currently working:**
- derstandard.at (Austrian news site)

**Implemented but untested:**
- reddit.com
- news.ycombinator.com (Hacker News)
- youtube.com
- twitter.com / x.com
- disqus.com

To add new sites, edit `src/sites.json` with appropriate CSS selectors.

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.

## Contributing

To add support for new sites, edit `src/sites.json` with appropriate CSS selectors for comment detection.