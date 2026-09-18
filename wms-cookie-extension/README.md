# WMS Cookie Sync — shtojcë lokale për Chrome

E zgjidh përgjithmonë problemin e cookie-s që skadon. Sa kohë je i loguar në
**wms.gjirafamall.com** në Chrome, kjo shtojcë ia dërgon cookie-n e sesionit
agjentit lokal (`http://localhost:8790/wms/cookie`) **vetvetiu** — sa herë ndryshon,
në nisje, dhe çdo 5 minuta. Agjenti ka gjithmonë cookie të freskët; **nuk ripaste-on kurrë më**.

Gjithçka mbetet në PC-në tënd (localhost). Asgjë s'shkon jashtë.

## Instalimi (një herë)

1. Në Chrome hap: `chrome://extensions`
2. Sipër djathtas ndiz **Developer mode** (Mënyra e zhvilluesit).
3. Kliko **Load unpacked** (Ngarko të pazbërthyer).
4. Zgjidh dosjen: **`D:\Warehouse\wms-cookie-extension`**
5. Sigurohu që je **i loguar në wms.gjirafamall.com** në Chrome (hape një herë).

Gati. Që tani, agjenti merr cookie-n e freskët automatikisht.

## Si ta verifikosh

- Në `chrome://extensions`, te "WMS Cookie Sync" → **service worker** → Console:
  duhet të shohësh `[wms-cookie-sync] pushed N chars`.
- Ose te terminali i agjentit: `cookie auto-updated from extension (N chars)`.
- App-i te **WMS Data & Performance** duhet të tregojë 🟢 dhe të mos dalë më "Cookie ka skaduar".

## Shënime

- Kërkon leje: `cookies` (për të lexuar cookie-n e WMS-it, edhe HttpOnly) dhe akses te
  `wms.gjirafamall.com` + `localhost:8790`. Asgjë tjetër.
- Nuk anashkalon autentikimin: Chrome bën login-in normalisht; shtojca vetëm lexon
  cookie-n ekzistuese dhe ia jep agjentit tënd lokal.
- Nëse dil nga WMS (logout), cookie-ja bëhet e pavlefshme — logohu sërish dhe rifreskohet.
