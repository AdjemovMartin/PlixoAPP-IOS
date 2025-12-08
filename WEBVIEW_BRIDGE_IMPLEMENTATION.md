# WebView Bridge Implementation

## Purpose
Handle messages sent from the Plixo.bg website when it’s loaded inside the WebView app.  
This allows features like “Open in Safari” to work natively on iOS and Android.

---

## Message Format (from website)
The website sends messages via the standard `window.ReactNativeWebView.postMessage()` API in JSON format:

```json
{
  "type": "OPEN_EXTERNAL",
  "url": "https://plixo.bg/wallet"
}
# WebView Bridge Implementation

## Purpose
Handle messages sent from the Plixo.bg website when it’s loaded inside the WebView app.  
This allows features like “Open in Safari” to work natively on iOS and Android.

---

## Message Format (from website)
The website sends messages via the standard `window.ReactNativeWebView.postMessage()` API in JSON format:

```json
{
  "type": "OPEN_EXTERNAL",
  "url": "https://plixo.bg/wallet"
}
