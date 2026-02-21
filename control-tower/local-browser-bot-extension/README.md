# Delta Local Browser Bot Extension

Runs the domain bot inside your logged-in Chrome session (works with 2FA because it uses your active browser state).

## Install

1. Open Chrome: `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select folder: `control-tower/local-browser-bot-extension`

## Use

1. Open extension popup.
2. Fill:
   - Activation URL (optional, recommended)
   - Domain to paste
   - Robots.txt / Head / Body / Favicon values
3. Click `Run Bot`.
4. Watch live progress in page overlay (bottom-right).

## Notes

- This bot runs in your own browser tab, so your login + 2FA session is reused.
- If a selector changes in Devasks UI, update logic in `popup.js`.
- It does not call Control Tower backend pre/post (custom values, DNS, complete). Keep those steps in Control Tower or add API calls later.
