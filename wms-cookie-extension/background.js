/* WMS Cookie Sync — local only.
   Reads the session cookies your Chrome holds for wms.gjirafamall.com (including
   HttpOnly ones, via the chrome.cookies API) and pushes them to the local agent
   at http://localhost:8790/wms/cookie. Runs whenever the cookie changes, on
   start, and every 5 minutes — so the agent always has a fresh, valid cookie
   and you never paste it manually again. Nothing is sent anywhere except your
   own localhost agent. */
const WMS_URL = 'https://wms.gjirafamall.com/';
const AGENT   = 'http://localhost:8790/wms/cookie';

let lastHeader = '';

async function pushCookies() {
  try {
    const cookies = await chrome.cookies.getAll({ url: WMS_URL });
    if (!cookies || !cookies.length) return;
    const header = cookies.map(c => c.name + '=' + c.value).join('; ');
    if (header.length < 40) return;          // not logged in yet
    if (header === lastHeader) return;        // no change → skip
    const res = await fetch(AGENT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: header })
    });
    if (res && res.ok) { lastHeader = header; console.log('[wms-cookie-sync] pushed', header.length, 'chars'); }
  } catch (e) { /* agent not running yet — will retry on next tick */ }
}

chrome.runtime.onInstalled.addListener(() => pushCookies());
chrome.runtime.onStartup.addListener(() => pushCookies());
chrome.cookies.onChanged.addListener(ch => {
  const d = (ch.cookie && ch.cookie.domain) || '';
  if (d.indexOf('gjirafamall.com') !== -1) pushCookies();
});
chrome.alarms.create('wms-cookie-sync', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'wms-cookie-sync') pushCookies(); });
