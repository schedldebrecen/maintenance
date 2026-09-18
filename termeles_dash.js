const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbziABd0I2cSep7TveoNoaQZkI5FzxYl4suqSfCR2rD8MXJQNMHPiygbTD8MK0T3Qz40/exec";
const RESZLEG = "production";

let globalShiftLogs = []; let globalSchedule = [];
let clSablon = []; let clNaplo = []; 
let REFRESH_INTERVAL_SEC = 300; let timer = REFRESH_INTERVAL_SEC; 
let sessionUser = null; let sessionRole = null; 

window.onload = function() {
    loadUserList(); 
    const savedUser = localStorage.getItem("activeUser"); 
    if(savedUser) { sessionUser = savedUser; sessionRole = localStorage.getItem("activeRole"); extendSession(); } 
    fetchDashboardData();
}

function toLocalISOString(dateObj) { if(isNaN(dateObj)) return ""; const y = dateObj.getFullYear(), m = String(dateObj.getMonth() + 1).padStart(2, '0'), d = String(dateObj.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }

async function loadUserList() { try { const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getUsers" }) }); const r = await res.json(); if (r.status === "success" && r.data.length > 0) { const sel = document.getElementById('clLoginNevSelect'); sel.innerHTML = '<option value="">Válassz a listából...</option>'; r.data.forEach(user => sel.add(new Option(user, user))); } } catch(e) {} }
async function hashPassword(p) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p)); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''); }

setInterval(() => { document.getElementById('clockDisplay').innerText = new Date().toLocaleTimeString('hu-HU'); }, 1000);
setInterval(() => { 
    timer--; 
    if (timer <= 0) { timer = REFRESH_INTERVAL_SEC; fetchDashboardData(); } 
    document.getElementById('countdownDisplay').innerText = timer; 
    document.getElementById('progressBar').style.width = (((REFRESH_INTERVAL_SEC - timer) / REFRESH_INTERVAL_SEC) * 100) + "%"; 
}, 1000);

async function fetchDashboardData() {
    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getAllData", reszleg: RESZLEG }) }); const result = await res.json();
        if(result.status === "success") { 
            clSablon = result.data.checklistSablon || []; clNaplo = result.data.checklistNaplo || [];
            globalShiftLogs = result.data.shiftLogs || [];
            globalSchedule = result.data.schedule || [];
            updateMissingBanner();
            checkMidShiftChecklist();
            renderChecklistTab();
        } 
    } catch (e) { console.error(e); }
}

function updateMissingBanner() {
    let missingLogs = []; let missingChecklists = [];
    let curr = new Date("2026-09-16T00:00:00"); let now = new Date();
    
    while (curr <= now) {
        let dStr = toLocalISOString(curr);
        let shifts = [
            { name: "Délelőtt (06:00-14:00)", short: "Délelőtt", endH: 14, endOffset: 0 },
            { name: "Délután (14:00-22:00)", short: "Délután", endH: 22, endOffset: 0 },
            { name: "Éjszaka (22:00-06:00)", short: "Éjszaka", endH: 6, endOffset: 1 }
        ];

        shifts.forEach(sh => {
            let endT = new Date(dStr + "T00:00:00");
            endT.setDate(endT.getDate() + sh.endOffset);
            endT.setHours(sh.endH, 0, 0, 0);

            if (now >= endT) {
                let hasWorkers = globalSchedule.some(s => s.datum === dStr && s.tipus.includes(sh.short) && s.user !== "__UGYELET__");
                if (hasWorkers) {
                    let hasLog = globalShiftLogs.some(l => {
                        let logD = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10);
                        return logD === dStr && l.muszak === sh.name && !l.hianyzo;
                    });
                    if (!hasLog) missingLogs.push(`${dStr} - ${sh.short}`);

                    let hasCl = clNaplo.some(c => c.datum === dStr && c.muszak === sh.name);
                    if (!hasCl && clSablon.length > 0) missingChecklists.push(`${dStr} - ${sh.short}`);
                }
            }
        });
        curr.setDate(curr.getDate() + 1);
    }

    let banner = document.getElementById('currentShiftStatusBanner');
    if (banner) {
        if (missingLogs.length === 0 && missingChecklists.length === 0) {
            banner.style.display = 'none';
        } else {
            banner.style.display = 'block';
            let html = "";
            if (missingLogs.length > 0) html += `<div style="margin-bottom:10px;"><b>❌ Hiányzó Műszaknaplók:</b><br>${missingLogs.join(', ')}</div>`;
            if (missingChecklists.length > 0) html += `<div><b>❌ Hiányzó Checklisták:</b><br>${missingChecklists.join(', ')}</div>`;
            document.getElementById('missingDocsList').innerHTML = html;
        }
    }
}

function checkMidShiftChecklist() {
    let now = new Date(); let h = now.getHours(); let m = now.getMinutes(); let timeFloat = h + (m/60);
    let currentShift = ""; let todayStr = toLocalISOString(now);
    if (timeFloat >= 6 && timeFloat < 14) currentShift = "Délelőtt (06:00-14:00)"; else if (timeFloat >= 14 && timeFloat < 22) currentShift = "Délután (14:00-22:00)"; else { currentShift = "Éjszaka (22:00-06:00)"; if (timeFloat < 6) { let yest = new Date(now); yest.setDate(yest.getDate()-1); todayStr = toLocalISOString(yest); } }
    
    let hasChecklist = clNaplo.some(l => l.datum === todayStr && l.muszak === currentShift);
    let isPastMid = false;
    if (currentShift.includes("Délelőtt") && timeFloat >= 10.0) isPastMid = true;
    if (currentShift.includes("Délután") && timeFloat >= 18.0) isPastMid = true;
    if (currentShift.includes("Éjszaka") && timeFloat >= 2.0 && timeFloat < 6.0) isPastMid = true;
    
    if (isPastMid && !hasChecklist && clSablon.length > 0) { document.getElementById('checklistAlarmBanner').style.display = 'block'; document.body.classList.add('flash-red'); } 
    else { document.getElementById('checklistAlarmBanner').style.display = 'none'; document.body.classList.remove('flash-red'); }
}

function renderChecklistTab() {
    let now = new Date(); let h = now.getHours(); let timeFloat = h + (now.getMinutes()/60);
    let currentShift = ""; let todayStr = toLocalISOString(now);
    if (timeFloat >= 6 && timeFloat < 14) currentShift = "Délelőtt (06:00-14:00)"; else if (timeFloat >= 14 && timeFloat < 22) currentShift = "Délután (14:00-22:00)"; else { currentShift = "Éjszaka (22:00-06:00)"; if (timeFloat < 6) { let yest = new Date(now); yest.setDate(yest.getDate()-1); todayStr = toLocalISOString(yest); } }
    
    let currentShiftShort = currentShift.split(" ")[0]; 
    let logicalDateObj = new Date(now); if (timeFloat < 6) logicalDateObj.setDate(logicalDateObj.getDate()-1);
    let dayOfWeekArr = ["Vasárnap", "Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat"];
    let todayDayName = dayOfWeekArr[logicalDateObj.getDay()];
    let isWeekday = (logicalDateObj.getDay() >= 1 && logicalDateObj.getDay() <= 5);

    document.getElementById('clMuszakNev').innerText = todayStr + " | " + currentShift;

    let validSubtasks = clSablon.filter(q => {
        if (!q.szuloId) return false;
        let freq = String(q.gyakorisag || "").trim();
        let isFreqMatch = (freq === "Minden nap" || freq === todayDayName || (freq === "Minden hétköznap" && isWeekday));
        let isShiftMatch = (q.muszakok && String(q.muszakok).includes(currentShiftShort));
        return isFreqMatch && isShiftMatch;
    });

    if (validSubtasks.length === 0) {
        document.getElementById('checklistStatusContainer').innerHTML = `<div style="color:var(--text-muted); text-align:center; padding: 20px;">Jelenleg (erre a műszakra) nincs aktív feladat.</div>`;
        document.getElementById('checklistQuestionsContainer').style.display = 'none';
        return;
    }

    document.getElementById('checklistStatusContainer').innerHTML = "";
    document.getElementById('checklistQuestionsContainer').style.display = 'block';

    let organizedTasks = [];
    let mainTasks = clSablon.filter(t => !t.szuloId);

    mainTasks.forEach(mt => {
        let activeChildren = validSubtasks.filter(ct => ct.szuloId === mt.id);
        if (activeChildren.length > 0) { organizedTasks.push(mt); activeChildren.forEach(ct => organizedTasks.push(ct)); }
    });
    
    let orphans = validSubtasks.filter(ct => !mainTasks.find(mt => mt.id === ct.szuloId));
    organizedTasks.push(...orphans);

    let html = `
    <div class="cl-header-row">
        <div>Terület / Gép</div>
        <div>Ellenőrzendő Feladat</div>
        <div>Utasítás / Leírás</div>
        <div>Referencia</div>
        <div>Eredmény & Megjegyzés</div>
    </div>`;

    organizedTasks.forEach((q) => {
        let isMain = !q.szuloId;
        let gTxt = q.gep ? ` / ${q.gep}` : "";
        
        if (isMain) {
            html += `<div class="cl-row cl-main-row"><div style="grid-column: 1 / -1;">📂 ${q.terulet||'Általános'}${gTxt} - ${q.kerdes}</div></div>`;
        } else {
            let extraHtml = "";
            if (q.kep) { 
                let imgUrl = q.kep; let m = q.kep.match(/d\/([a-zA-Z0-9_-]+)/) || q.kep.match(/id=([^&]+)/);
                let viewUrl = q.kep;
                if(m && q.kep.includes("drive.google.com")) { imgUrl = `https://lh3.googleusercontent.com/d/${m[1]}`; viewUrl = `https://drive.google.com/file/d/${m[1]}/view`; }
                let fallbackHtml = `<a href="${viewUrl}" target="_blank" style="display:inline-block; background:var(--pri-obs); color:white; padding:4px 10px; border-radius:4px; text-decoration:none; font-size:12px; font-weight:bold;">📷 Kép megnyitása</a>`;
                let safeFallback = fallbackHtml.replace(/"/g, '&quot;');
                extraHtml += `<img src="${imgUrl}" loading="lazy" style="max-width:100%; max-height:100px; border-radius:4px; border:1px solid var(--border); cursor:pointer; margin-bottom:5px;" onclick="window.open('${viewUrl}', '_blank')" onerror="this.outerHTML='${safeFallback}'"><br>`; 
            }
            if (q.fajl) { 
                let fNev = q.fajlNev ? q.fajlNev : "📄 Dokumentum megnyitása";
                extraHtml += `<a href="${q.fajl}" target="_blank" style="display:inline-block; background:var(--pri-info); color:white; padding:4px 10px; border-radius:4px; text-decoration:none; font-size:12px; font-weight:bold;">${fNev}</a>`; 
            }
            let faIkon = q.isChild ? "↳ " : "";
            html += `
            <div class="cl-row cl-question-block" data-terulet="${q.terulet}" data-gep="${q.gep}" data-kerdes="${q.kerdes}">
                <div class="cl-col"><span class="cl-col-title">Terület / Gép</span><div style="font-size:12px; font-weight:bold; color:var(--pri-info);">[${q.terulet||'Általános'}${gTxt}]</div></div>
                <div class="cl-col"><span class="cl-col-title">Feladat</span><div style="font-size:14px; color:var(--text-main); font-weight:bold;">${faIkon}${q.kerdes}</div></div>
                <div class="cl-col"><span class="cl-col-title">Utasítás</span><div style="font-size:12px; color:var(--text-muted); line-height: 1.4;">${q.utasitas || '-'}</div></div>
                <div class="cl-col"><span class="cl-col-title">Referencia</span><div>${extraHtml || '-'}</div></div>
                <div class="cl-col">
                    <span class="cl-col-title">Eredmény & Megjegyzés</span>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:5px;">
                        <label style="cursor:pointer; display:flex; align-items:center; gap:4px; font-size:12px; font-weight:bold; color:var(--pri-normal); background:var(--surface); padding:4px 10px; border-radius:4px; border:1px solid var(--pri-normal); flex:1; justify-content:center;"><input type="radio" name="clRad_${q.id}" value="OK" style="width:14px; height:14px; margin:0;"> OK</label>
                        <label style="cursor:pointer; display:flex; align-items:center; gap:4px; font-size:12px; font-weight:bold; color:var(--pri-crit); background:var(--surface); padding:4px 10px; border-radius:4px; border:1px solid var(--pri-crit); flex:1; justify-content:center;"><input type="radio" name="clRad_${q.id}" value="NOK" style="width:14px; height:14px; margin:0;"> NOK</label>
                        <label style="cursor:pointer; display:flex; align-items:center; gap:4px; font-size:12px; font-weight:bold; color:var(--text-muted); background:var(--surface); padding:4px 10px; border-radius:4px; border:1px solid var(--text-muted); flex:1; justify-content:center;"><input type="radio" name="clRad_${q.id}" value="N.A." style="width:14px; height:14px; margin:0;"> N.A.</label>
                    </div>
                    <input type="text" class="dash-input cl-comment" placeholder="Megjegyzés (Nem kötelező)..." style="margin:0; padding:6px; font-size:12px; width: 100%; box-sizing: border-box;">
                </div>
            </div>`;
        }
    });
    document.getElementById('clQuestionsList').innerHTML = html;
}

async function verifyAndSubmitChecklist() {
    let now = new Date(); let h = now.getHours(); let timeFloat = h + (now.getMinutes()/60);
    let currentShift = ""; let todayStr = toLocalISOString(now);
    if (timeFloat >= 6 && timeFloat < 14) currentShift = "Délelőtt (06:00-14:00)"; else if (timeFloat >= 14 && timeFloat < 22) currentShift = "Délután (14:00-22:00)"; else { currentShift = "Éjszaka (22:00-06:00)"; if (timeFloat < 6) { let yest = new Date(now); yest.setDate(yest.getDate()-1); todayStr = toLocalISOString(yest); } }

    const nev = document.getElementById('clLoginNevSelect').value; const pin = document.getElementById('clLoginPin').value; const stat = document.getElementById('clLoginStatus');
    if(!nev || !pin) { stat.innerText = "Válaszd ki a neved és add meg a PIN kódod!"; return; }

    let eredmenyek = []; 
    let blocks = document.querySelectorAll('.cl-question-block');
    for (let i = 0; i < blocks.length; i++) {
        let block = blocks[i]; let terulet = block.getAttribute('data-terulet'); let gep = block.getAttribute('data-gep'); let kerdes = block.getAttribute('data-kerdes');
        let radios = block.querySelectorAll('input[type="radio"]'); let val = null;
        for(let r of radios) { if(r.checked) val = r.value; }
        if(!val) { stat.innerText = `Hiba: Kérlek minden kérdésre válaszolj!`; return; }
        let megjegyzes = block.querySelector('.cl-comment').value.trim();
        eredmenyek.push({ kerdes: kerdes, terulet: terulet, gep: gep, valasz: val, megjegyzes: megjegyzes });
    }

    stat.innerText = "Hitelesítés és mentés...";
    try {
        const resLogin = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "login", nev: nev, jelszo: await hashPassword(pin) }) }); 
        const rLogin = await resLogin.json(); if(rLogin.status !== "success") { stat.innerText = "Hibás PIN kód!"; return; }
        let hibak = eredmenyek.filter(e => e.valasz === 'NOK');
        if(hibak.length > 0) { if(!confirm(`⚠️ FIGYELEM!\n\n${hibak.length} db NOK választ adtál meg. A rendszer ezekből automatikusan hibajegyeket fog nyitni a Karbantartás felé.\n\nBiztosan elküldöd?`)) { stat.innerText=""; return; } }

        const payload = { action: "saveShiftChecklist", datum: todayStr, muszak: currentShift, felhasznalo: nev, eredmenyek: eredmenyek, hibak: hibak };
        const resSave = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) }); const rSave = await resSave.json();
        if(rSave.status === "success") {
            stat.style.color = "var(--pri-normal)"; stat.innerText = "Sikeres mentés!"; document.getElementById('clLoginPin').value = "";
            let radiosToClear = document.querySelectorAll('.cl-question-block input[type="radio"]'); radiosToClear.forEach(r => r.checked = false);
            let commentsToClear = document.querySelectorAll('.cl-comment'); commentsToClear.forEach(c => c.value = "");
            fetchDashboardData(); 
        } else { stat.innerText = rSave.message; }
    } catch(e) { stat.innerText = "Hálózati hiba!"; }
}

function extendSession() { if(sessionUser) { document.getElementById('activeUserBadge').style.display = 'flex'; document.getElementById('dashUserName').innerText = sessionUser; populateNavDropdown(); } }
function dashLogout() { sessionUser = null; sessionRole = null; localStorage.removeItem("activeUser"); localStorage.removeItem("activeRole"); document.getElementById('activeUserBadge').style.display = 'none'; }
function populateNavDropdown() { const nav = document.getElementById('appNavDropdown'); if(!nav) return; nav.innerHTML = '<option value="" disabled selected>☰ Navigáció</option>'; nav.add(new Option("📱 Termelés App", "production.html")); nav.add(new Option("📺 Termelés Faliújság", "dashboard_prod.html")); nav.add(new Option("🔧 Karbantartás App", "index.html")); nav.add(new Option("📺 Karbantartás Faliújság", "dashboard.html")); }