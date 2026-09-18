const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbziABd0I2cSep7TveoNoaQZkI5FzxYl4suqSfCR2rD8MXJQNMHPiygbTD8MK0T3Qz40/exec";
const RESZLEG = "production";

const gepAdatbazis = { "Production - Line 1": [ "Conv - Szállítástechnika", "Schenck - Szelepszerelő robot", "TPMS1 - Screwing Station Manual - Atlas Copco", "RMS1 - Tire assembly - Hofmann", "RMM1 - Matching machine - Hofmann", "RFG1 - Tire Inflation - Hofmann", "RSO1 - Bead Seat Optimizer - Hofmann", "RGM1 - Tire Uniformity - Hofmann", "AWS1 - Balancing - Hofmann", "WC1 - Weight cutter - Rameckers", "AGS1 - Weight applicator - KUKA" ], "Production - Line 2": [ "Conv - Szállítástechnika", "WGS2 - Wheel gauging - IEF Werner", "RMS2 - Tire assembly - Hofmann", "RFG2 - Tire Inflation - Hofmann", "AWS2 - Balancing - Hofmann", "WC2 - Weight cutter - Rameckers", "AGS2 - Weight applicator - KUKA", "AWSK1 - Control Balancing - Hofmann", "TPMS writing /reading - ATEQ", "EOL1 - End of Line control - Mabri Vision" ], "Production - Egyedi gépek": [ "MTAM1 - Manual tyre assembly machine - Hofmann", "CUT1 - Bandage Cutting Machine - Cyklop", "HP1 - Hydraulic Press - Strautmann" ], "Magasraktár - High Bay System": [ "RBG 1 - Beewen", "RBG 2 - Beewen", "RBG 3 - Beewen", "Conveyors - Blume/Thepas" ], "Palettázó B&O": [ "Szekventáló robot - B&O" ], "Q-Area": [ "TLIT - Tire leak inspection tank - Corghi", "MTAM2 - Manual tyre assembly machine - Aikido" ], "Facility": [ "Épülettel kapcsolatos dolgok" ], "IT": [ "Szerverek", "Hálózati eszközök (Switch/AP)", "Kliens gépek (PC/Laptop)", "Nyomtatók és szkennerek", "Szoftver és rendszerek", "Egyéb IT eszköz" ], "Compressors": [ "DRAIN - Drain Water Separator - Boge", "COMP1 - Compressor 1 - Boge", "DRY1 - Air Dryer 1 - Beko", "COMP2 - Compressor 2 - Boge", "DRY2 - Air Dryer 2 - Beko", "COMP3 - Compressor 3 - Boge" ], "Aggregátor": [] };
const huHolidays = ["2026-01-01", "2026-03-15", "2026-04-03", "2026-04-06", "2026-05-01", "2026-05-25", "2026-08-20", "2026-10-23", "2026-11-01", "2026-12-24", "2026-12-25", "2026-12-26"]; const huWorkWeekends = ["2026-08-08", "2026-12-12"];

let currentActiveTasks = []; let globalClosedTasks = []; let globalShiftLogs = []; let expectedApprovers = [];
let clSablon = []; let clNaplo = []; 
let REFRESH_INTERVAL_SEC = 300; let timer = REFRESH_INTERVAL_SEC; 
let sessionUser = null; let sessionRole = null; 
let optSound = false; let optFlash = false; let audioCtx = null; let isAlarming = false; let knownAdHocIds = new Set(); let isFirstLoad = true;

window.onload = function() {
    const szuroKatSelect = document.getElementById('szuroKategoria'); const clDashTerulet = document.getElementById('clDashTerulet');
    if(szuroKatSelect) { for (let kat in gepAdatbazis) { szuroKatSelect.add(new Option(kat, kat)); if(clDashTerulet) clDashTerulet.add(new Option(kat, kat)); } }
    loadUserList(); const savedUser = localStorage.getItem("activeUser"); if(savedUser) { sessionUser = savedUser; sessionRole = localStorage.getItem("activeRole"); extendSession(); } fetchDashboardData();
}

function toLocalISOString(dateObj) { if(isNaN(dateObj)) return ""; const y = dateObj.getFullYear(), m = String(dateObj.getMonth() + 1).padStart(2, '0'), d = String(dateObj.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }

function switchDashTab(tabId) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active')); document.querySelectorAll('.dash-nav button').forEach(b => b.classList.remove('active'));
    document.getElementById('view-' + tabId).classList.add('active');
    let btnMap = { 'nyitott': 'tabNyitott', 'lezart': 'tabLezart', 'checklist': 'tabChecklist' };
    if (btnMap[tabId]) document.getElementById(btnMap[tabId]).classList.add('active');
    if (tabId === 'checklist') renderChecklistTab();
}

function frissitSzuroGepek() { const k = document.getElementById('szuroKategoria').value; const s = document.getElementById('szuroGep'); s.innerHTML = '<option value="">Összes gép...</option>'; if (k && gepAdatbazis[k]) { if (gepAdatbazis[k].length === 0) { s.add(new Option("Nincs alegység", "-")); } else { s.add(new Option("— Teljes sor / Általános —", "-")); gepAdatbazis[k].forEach(g => s.add(new Option(g, g))); } } renderClosedTasks(); }
function frissitDashGep() { const k = document.getElementById('clDashTerulet').value; const s = document.getElementById('clDashGep'); s.innerHTML = '<option value="">Általános / Összes gép...</option>'; if (k && gepAdatbazis[k]) { gepAdatbazis[k].forEach(g => s.add(new Option(g, g))); } renderChecklistTab(); }

async function loadUserList() { try { const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getUsers" }) }); const r = await res.json(); if (r.status === "success" && r.data.length > 0) { const sel = document.getElementById('clLoginNevSelect'); if(sel) { sel.innerHTML = '<option value="">Válassz a listából...</option>'; r.data.forEach(user => sel.add(new Option(user, user))); } const sel2 = document.getElementById('dashLoginNevSelectModal'); if(sel2) { sel2.innerHTML = '<option value="">Válassz...</option>'; r.data.forEach(user => sel2.add(new Option(user, user))); } } } catch(e) {} }
async function hashPassword(p) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p)); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''); }

setInterval(() => { document.getElementById('clockDisplay').innerText = new Date().toLocaleTimeString('hu-HU'); }, 1000);
setInterval(() => { 
    timer--; 
    if (timer <= 0) { 
        timer = REFRESH_INTERVAL_SEC; 
        if (!document.getElementById('view-checklist').classList.contains('active')) {
            fetchDashboardData(); 
        }
    } 
    document.getElementById('countdownDisplay').innerText = timer; 
    document.getElementById('progressBar').style.width = (((REFRESH_INTERVAL_SEC - timer) / REFRESH_INTERVAL_SEC) * 100) + "%"; 
}, 1000);

async function fetchDashboardData() {
    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getAllData", reszleg: RESZLEG }) }); const result = await res.json();
        if(result.status === "success") { 
            clSablon = result.data.checklistSablon || []; clNaplo = result.data.checklistNaplo || [];
            processData(result.data.tasks); 
            checkMidShiftChecklist();
            if(document.getElementById('view-checklist').classList.contains('active')) renderChecklistTab();
        } 
    } catch (e) { console.error(e); }
}

// 4. PONT: CSAK HÉTKÖZNAP DÉLELŐTTI ÉS DÉLUTÁNI MŰSZAKBAN KÉRJE A CHECKLISTÁT (ÉJSZAKA ÉS HÉTVÉGE KIZÁRVA)
function checkMidShiftChecklist() {
    let now = new Date(); let h = now.getHours(); let m = now.getMinutes(); let timeFloat = h + (m/60);
    let currentShift = ""; let todayStr = toLocalISOString(now);
    
    let isWeekend = (now.getDay() === 0 || now.getDay() === 6);
    if (isWeekend) {
        document.getElementById('checklistAlarmBanner').style.display = 'none'; 
        document.body.classList.remove('flash-red');
        return;
    }

    if (timeFloat >= 6 && timeFloat < 14) currentShift = "Délelőtt (06:00-14:00)"; 
    else if (timeFloat >= 14 && timeFloat < 22) currentShift = "Délután (14:00-22:00)"; 
    else {
        // Éjszakai műszakban nem kell checklist riasztás!
        document.getElementById('checklistAlarmBanner').style.display = 'none'; 
        document.body.classList.remove('flash-red');
        return;
    }

    let hasLog = clNaplo.some(l => l.datum === todayStr && l.muszak === currentShift);
    let isPastMid = false;
    if (currentShift.includes("Délelőtt") && timeFloat >= 10.0) isPastMid = true;
    if (currentShift.includes("Délután") && timeFloat >= 18.0) isPastMid = true;

    if (isPastMid && !hasLog && clSablon.length > 0) { 
        document.getElementById('checklistAlarmBanner').style.display = 'block'; 
        document.body.classList.add('flash-red'); 
    } else { 
        document.getElementById('checklistAlarmBanner').style.display = 'none'; 
        document.body.classList.remove('flash-red'); 
    }
}

// 6. PONT: MEGNÉZZÜK, HOGY VAN-E MÁR KITÖLTÖTT NAPLÓ, HA IGEN, VISSZATÖLTJÜK ÉS MÓDOSÍTÁS GOMBOT ADUNK
function renderChecklistTab() {
    let now = new Date(); let h = now.getHours(); let timeFloat = h + (now.getMinutes()/60);
    let currentShift = ""; let todayStr = toLocalISOString(now);
    if (timeFloat >= 6 && timeFloat < 14) currentShift = "Délelőtt (06:00-14:00)"; 
    else if (timeFloat >= 14 && timeFloat < 22) currentShift = "Délután (14:00-22:00)"; 
    else { 
        currentShift = "Éjszaka (22:00-06:00)"; 
        if (timeFloat < 6) { let yest = new Date(now); yest.setDate(yest.getDate()-1); todayStr = toLocalISOString(yest); } 
    }
    
    let currentShiftShort = currentShift.split(" ")[0]; 
    let logicalDateObj = new Date(now); if (timeFloat < 6) logicalDateObj.setDate(logicalDateObj.getDate()-1);
    let dayOfWeekArr = ["Vasárnap", "Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat"];
    let todayDayName = dayOfWeekArr[logicalDateObj.getDay()];
    let isWeekday = (logicalDateObj.getDay() >= 1 && logicalDateObj.getDay() <= 5);

    document.getElementById('clMuszakNev').innerText = todayStr + " | " + currentShift;

    // Megkeressük, hogy erre a napra és műszakra van-e már kitöltött napló
    let existingLog = clNaplo.find(l => l.datum === todayStr && l.muszak === currentShift);
    let savedAnswers = {};
    if (existingLog && existingLog.eredmenyek) {
        try {
            let parsed = JSON.parse(existingLog.eredmenyek);
            parsed.forEach(p => {
                savedAnswers[p.kerdes] = { valasz: p.valasz, megjegyzes: p.megjegyzes };
            });
        } catch(e) {}
    }

    let statusContainer = document.getElementById('checklistStatusContainer');
    if (existingLog) {
        statusContainer.innerHTML = `<div style="background:#d1fae5; color:#065f46; padding:12px 15px; border-radius:6px; margin-bottom:20px; font-weight:bold; border:1px solid #34d399; display:flex; justify-content:space-between; align-items:center;">
            <span>✅ ${existingLog.kitolto} már kitöltötte ezt a műszaki checklistát! Alább módosíthatod a válaszokat.</span>
            <span style="background:#065f46; color:white; padding:4px 8px; border-radius:4px; font-size:12px;">Módosítás Mód</span>
        </div>`;
    } else {
        statusContainer.innerHTML = "";
    }

    let sT = document.getElementById('clDashTerulet').value;
    let sG = document.getElementById('clDashGep').value;

    let validSubtasks = clSablon.filter(q => {
        if (!q.szuloId) return false;
        let freq = String(q.gyakorisag || "").trim();
        let isFreqMatch = (freq === "Minden nap" || freq === todayDayName || (freq === "Minden hétköznap" && isWeekday));
        let isShiftMatch = (q.muszakok && String(q.muszakok).includes(currentShiftShort));
        let isAreaMatch = sT ? (q.terulet === sT) : true;
        let isMachMatch = sG ? (q.gep === sG) : true;
        return isFreqMatch && isShiftMatch && isAreaMatch && isMachMatch;
    });

    if (validSubtasks.length === 0) {
        statusContainer.innerHTML += `<div style="color:var(--text-muted); text-align:center;">Jelenleg (erre a szűrésre / műszakra) nincs aktív feladat.</div>`;
        document.getElementById('checklistQuestionsContainer').style.display = 'none';
        return;
    }

    document.getElementById('checklistQuestionsContainer').style.display = 'block';

    let organizedTasks = [];
    let mainTasks = clSablon.filter(t => !t.szuloId);

    mainTasks.forEach(mt => {
        let activeChildren = validSubtasks.filter(ct => ct.szuloId === mt.id);
        if (activeChildren.length > 0) {
            organizedTasks.push(mt);
            activeChildren.forEach(ct => organizedTasks.push(ct));
        }
    });
    
    let orphans = validSubtasks.filter(ct => !mainTasks.find(mt => mt.id === ct.szuloId));
    organizedTasks.push(...orphans);

    let html = "";
    organizedTasks.forEach((q) => {
        let isMain = !q.szuloId;
        let gTxt = q.gep ? ` / ${q.gep}` : "";
        
        if (isMain) {
            html += `
            <div style="background:var(--surface); padding:8px 12px; border-radius:6px; margin-bottom:10px; border:1px solid var(--pri-info); border-left: 5px solid var(--pri-info);">
                <div style="font-size:11px; font-weight:bold; color:var(--text-muted); margin-bottom:2px; text-transform:uppercase;">Fő feladat [${q.terulet||'Általános'}${gTxt}]</div>
                <div style="font-size:15px; font-weight:bold; color:var(--text-main); margin:0;">${q.kerdes}</div>
            </div>`;
        } else {
            let extraHtml = "";
            if (q.utasitas) { extraHtml += `<div style="margin-bottom:8px; font-size:12px; color:var(--pri-high); line-height:1.2;">ℹ️ <b>Utasítás:</b> ${q.utasitas}</div>`; }
            if (q.kep) { 
                let imgUrl = q.kep; let m = q.kep.match(/d\/([a-zA-Z0-9_-]+)/) || q.kep.match(/id=([^&]+)/);
                let viewUrl = q.kep;
                if(m && q.kep.includes("drive.google.com")) { 
                    imgUrl = `https://lh3.googleusercontent.com/d/${m[1]}`; 
                    viewUrl = `https://drive.google.com/file/d/${m[1]}/view`;
                }
                let fallbackHtml = `<a href="${viewUrl}" target="_blank" style="display:inline-block; background:var(--pri-obs); color:white; padding:4px 10px; border-radius:4px; text-decoration:none; font-size:12px; font-weight:bold;">📷 Kép megnyitása</a>`;
                let safeFallback = fallbackHtml.replace(/"/g, '&quot;');
                extraHtml += `<div style="margin-bottom:8px;"><img src="${imgUrl}" loading="lazy" style="max-width:100%; max-height:150px; border-radius:4px; border:1px solid var(--border); cursor:pointer;" onclick="window.open('${viewUrl}', '_blank')" onerror="this.outerHTML='${safeFallback}'"></div>`; 
            }
            if (q.fajl) { 
                let fNev = q.fajlNev ? q.fajlNev : "📄 Megnyitás";
                extraHtml += `<div style="margin-bottom:10px;"><a href="${q.fajl}" target="_blank" style="display:inline-block; background:var(--pri-info); color:white; padding:4px 10px; border-radius:4px; text-decoration:none; font-size:12px; font-weight:bold;">${fNev}</a></div>`; 
            }

            let margin = q.isChild ? 20 : 0; 
            let borderStyle = q.isChild ? "border-left: 3px solid var(--pri-obs);" : "border:1px solid var(--border);";
            let faIkon = q.isChild ? "↳ " : "";

            // Korábbi válaszok visszatöltése a checkboxokba és megjegyzésbe
            let prevAns = savedAnswers[q.kerdes] || { valasz: "", megjegyzes: "" };
            let checkedOK = prevAns.valasz === "OK" ? "checked" : "";
            let checkedNOK = prevAns.valasz === "NOK" ? "checked" : "";
            let checkedNA = prevAns.valasz === "N.A." ? "checked" : "";

            html += `
            <div style="background:var(--bg-dark); padding:10px; border-radius:6px; margin-bottom:10px; border:1px solid var(--border); ${borderStyle} margin-left:${margin}px;" class="cl-question-block" data-terulet="${q.terulet}" data-gep="${q.gep}" data-kerdes="${q.kerdes}">
                <div style="font-size:11px; font-weight:bold; color:var(--pri-info); margin-bottom:4px; display:${q.isChild ? 'none' : 'block'};">[${q.terulet||'Általános'}${gTxt}]</div>
                <div style="font-size:14px; margin-bottom:8px; color:var(--text-main); font-weight:bold; line-height:1.2;">${faIkon}${q.kerdes}</div>
                ${extraHtml}
                <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
                    <label style="cursor:pointer; display:flex; align-items:center; gap:4px; font-size:12px; font-weight:bold; color:var(--pri-normal); background:var(--surface); padding:4px 10px; border-radius:4px; border:1px solid var(--pri-normal); width:fit-content;"><input type="radio" name="clRad_${q.id}" value="OK" ${checkedOK} style="width:14px; height:14px; margin:0;"> OK</label>
                    <label style="cursor:pointer; display:flex; align-items:center; gap:4px; font-size:12px; font-weight:bold; color:var(--pri-crit); background:var(--surface); padding:4px 10px; border-radius:4px; border:1px solid var(--pri-crit); width:fit-content;"><input type="radio" name="clRad_${q.id}" value="NOK" ${checkedNOK} style="width:14px; height:14px; margin:0;"> NOK</label>
                    <label style="cursor:pointer; display:flex; align-items:center; gap:4px; font-size:12px; font-weight:bold; color:var(--text-muted); background:var(--surface); padding:4px 10px; border-radius:4px; border:1px solid var(--text-muted); width:fit-content;"><input type="radio" name="clRad_${q.id}" value="N.A." ${checkedNA} style="width:14px; height:14px; margin:0;"> N.A.</label>
                </div>
                <input type="text" class="dash-input cl-comment" value="${prevAns.megjegyzes}" placeholder="Megjegyzés (Nem kötelező)..." style="margin-bottom:0; padding:6px; font-size:12px;">
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
            stat.style.color = "var(--pri-normal)"; stat.innerText = "Sikeres mentés / felülírás!"; document.getElementById('clLoginPin').value = "";
            fetchDashboardData(); 
        } else { stat.innerText = rSave.message; }
    } catch(e) { stat.innerText = "Hálózati hiba!"; }
}

function processData(allTasks) {
    currentActiveTasks = []; globalClosedTasks = []; 
    allTasks.forEach(t => { 
        let isPrev = String(t.id).startsWith("PREV-") || String(t.id).includes("REC-");
        if(t.statusz !== "Lezárt") {
            if (!String(t.id).includes("PROD-")) return;
            if (isPrev && !String(t.id).toUpperCase().includes("PROD")) return;
            currentActiveTasks.push(t);
        } else {
            if (isPrev && !String(t.id).toUpperCase().includes("PROD")) return;
            globalClosedTasks.push(t);
        }
    });
}

function populateNavDropdown() {
    const nav = document.getElementById('appNavDropdown');
    if(!nav) return;
    nav.innerHTML = '<option value="" disabled selected>☰ Navigáció</option>';
    nav.add(new Option("📱 Termelés App", "production.html"));
    nav.add(new Option("📺 Termelés Faliújság", "dashboard_prod.html"));
    nav.add(new Option("🔧 Karbantartás App", "index.html"));
    nav.add(new Option("📺 Karbantartás Faliújság", "dashboard.html"));
}

function toggleNotifications() { const c = document.getElementById('notifToggle').checked; localStorage.setItem("notificationsEnabled", c ? "true" : "false"); }
async function saveSettings() { showToast("Mentve!"); }