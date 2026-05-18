---
"extforge": patch
---

messaging: always drain `chrome.runtime.lastError`

When a receiver disconnects mid-flight (service worker respawn, tab
closed, no listener), `chrome.runtime.sendMessage` resolves with
`undefined` and Chrome writes "Could not establish connection." to
`chrome.runtime.lastError`. If the property is never read, Chrome logs
an "Unchecked runtime.lastError" warning to the user's console.

`sendMessage` and `sendMessageToTab` now read `lastError` after every
call (success or failure) and include its message in the thrown error
when no reply was received.
