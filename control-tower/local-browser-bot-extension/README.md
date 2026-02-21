# Delta Local Browser Bot Extension

Runs the domain bot inside your logged-in Chrome session (works with 2FA because it uses your active browser state).

## Install

1. Open Chrome: `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select folder: `control-tower/local-browser-bot-extension`

## Use

Option A (manual from popup):
1. Open extension popup.
2. Fill:
   - Activation URL (optional, recommended)
   - Domain to paste
   - Robots.txt / Head / Body / Favicon values
3. Click `Run Bot`.
4. Watch live progress in page overlay (bottom-right).

Option B (triggered from Control Tower `Run Domain Bot` button):
1. Reload the extension in `chrome://extensions` after every extension code change.
2. Keep Control Tower open in Chrome (localhost/render/vercel URL).
3. Click `Run Domain Bot` in the project UI.
4. The extension bridge receives the command and executes on `app.devasks.com` in your logged-in session.
5. You will see the live overlay in Devasks and the progress logs in Control Tower.

## Notes

- This bot runs in your own browser tab, so your login + 2FA session is reused.
- If a selector changes in Devasks UI, update logic in `popup.js`.
- Control Tower pre/post (custom values, DNS upsert/delete, complete) is still handled by the project flow.
