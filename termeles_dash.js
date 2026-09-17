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

async function loadUserList() { try { const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getUsers" }) }); const r = await res.json(); if (r.status === "success" && r.data.length > 0) { const sel = document.getElementById('clLoginNevSelect'); sel.innerHTML = '<option value="">Válassz a listából...</option>'; r.data.forEach(user => sel.add(new Option(user, user))); const sel2 = document.getElementById('dashLoginNevSelectModal'); if(sel2) { sel2.innerHTML = '<option value="">Válassz...</option>'; r.data.forEach(user => sel2.add(new Option(user, user))); } } } catch(e) {} }
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

function checkMidShiftChecklist() {
    let now = new Date(); let h = now.getHours(); let m = now.getMinutes(); let timeFloat = h + (m/60);
    let currentShift = ""; let todayStr = toLocalISOString(now);
    if (timeFloat >= 6 && timeFloat < 14) currentShift = "Délelőtt (06:00-14:00)"; else if (timeFloat >= 14 && timeFloat < 22) currentShift = "Délután (14:00-22:00)"; else { currentShift = "Éjszaka (22:00-06:00)"; if (timeFloat < 6) { let yest = new Date(now); yest.setDate(yest.getDate()-1); todayStr = toLocalISOString(yest); } }
    let hasLog = clNaplo.some(l => l.datum === todayStr && l.muszak === currentShift);
    let isPastMid = false;
    if (currentShift.includes("Délelőtt") && timeFloat >= 10.0) isPastMid = true;
    if (currentShift.includes("Délután") && timeFloat >= 18.0) isPastMid = true;
    if (currentShift.includes("Éjszaka") && timeFloat >= 2.0 && timeFloat < 6.0) isPastMid = true;
    if (isPastMid && !hasLog && clSablon.length > 0) { document.getElementById('checklistAlarmBanner').style.display = 'block'; document.body.classList.add('flash-red'); } 
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

    let sT = document.getElementById('clDashTerulet').value;
    let sG = document.getElementById('clDashGep').value;

    // CSAK az ALFELADATOKAT (amiknek van szülője) szűrjük a műszak és gyakoriság szerint
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
        document.getElementById('checklistStatusContainer').innerHTML = `<div style="color:var(--text-muted); text-align:center;">Jelenleg (erre a szűrésre / műszakra) nincs aktív feladat.</div>`;
        document.getElementById('checklistQuestionsContainer').style.display = 'none';
        return;
    }

    document.getElementById('checklistStatusContainer').innerHTML = "";
    document.getElementById('checklistQuestionsContainer').style.display = 'block';

    let organizedTasks = [];
    let mainTasks = clSablon.filter(t => !t.szuloId);

    // Csak azokat a főfeladatokat rakjuk be a listába, amikhez tartozik érvényes (megjelenítendő) alfeladat!
    mainTasks.forEach(mt => {
        let activeChildren = validSubtasks.filter(ct => ct.szuloId === mt.id);
        if (activeChildren.length > 0) {
            organizedTasks.push(mt);
            activeChildren.forEach(ct => organizedTasks.push(ct));
        }
    });
    
    // Árva alfeladatok, ha esetleg letörölték a szülőjüket
    let orphans = validSubtasks.filter(ct => !mainTasks.find(mt => mt.id === ct.szuloId));
    organizedTasks.push(...orphans);

    let html = "";
    organizedTasks.forEach((q) => {
        let isMain = !q.szuloId;
        let gTxt = q.gep ? ` / ${q.gep}` : "";
        
        if (isMain) {
            // FEJLÉC (Gombok és megjegyzések nélkül)
            html += `
            <div style="background:var(--surface); padding:15px; border-radius:8px; margin-bottom:15px; border:2px solid var(--pri-info); border-left: 6px solid var(--pri-info);">
                <div style="font-size:12px; font-weight:bold; color:var(--text-muted); margin-bottom:5px;">FŐ FELADAT [${q.terulet||'Általános'}${gTxt}]</div>
                <div style="font-size:20px; font-weight:bold; color:var(--text-main); margin:0;">${q.kerdes}</div>
            </div>`;
        } else {
            // ALFELADATOK (Ezeket kell ellenőrizni, beljebb tolva)
            let extraHtml = "";
            if (q.utasitas) { extraHtml += `<div style="margin-bottom:10px; font-size:14px; color:var(--pri-high);">ℹ️ <b>Utasítás:</b> ${q.utasitas}</div>`; }
            if (q.kep) { 
                let imgUrl = q.kep; let m = q.kep.match(/d\/([a-zA-Z0-9_-]+)/) || q.kep.match(/id=([^&]+)/);
                if(m && q.kep.includes("drive.google.com")) { imgUrl = `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`; }
                extraHtml += `<div style="margin-bottom:10px;"><img src="${imgUrl}" style="max-width:100%; max-height:200px; border-radius:6px; border:1px solid var(--border); cursor:pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.3);" onclick="window.open('${q.kep}', '_blank')"></div>`; 
            }
            if (q.fajl) { 
                let fNev = q.fajlNev ? q.fajlNev : "📄 Csatolt Fájl Megnyitása";
                extraHtml += `<div style="margin-bottom:15px;"><a href="${q.fajl}" target="_blank" style="display:inline-block; background:var(--pri-info); color:white; padding:6px 12px; border-radius:4px; text-decoration:none; font-size:13px; font-weight:bold;">${fNev}</a></div>`; 
            }

            html += `
            <div style="background:var(--bg-dark); padding:15px; border-radius:8px; margin-bottom:15px; border-left: 4px solid var(--pri-obs); margin-left:40px;" class="cl-question-block" data-terulet="${q.terulet}" data-gep="${q.gep}" data-kerdes="${q.kerdes}">
                <div style="font-size:16px; margin-bottom:10px; color:var(--text-main); font-weight:bold;">↳ ${q.kerdes}</div>
                ${extraHtml}
                <div style="display:flex; gap:15px; flex-wrap:wrap; margin-bottom:10px;">
                    <label style="cursor:pointer; display:flex; align-items:center; gap:8px; font-size:16px; font-weight:bold; color:var(--pri-normal); background:var(--surface); padding:8px 15px; border-radius:6px; border:1px solid var(--pri-normal);"><input type="radio" name="clRad_${q.id}" value="OK" style="width:20px; height:20px;"> OK</label>
                    <label style="cursor:pointer; display:flex; align-items:center; gap:8px; font-size:16px; font-weight:bold; color:var(--pri-crit); background:var(--surface); padding:8px 15px; border-radius:6px; border:1px solid var(--pri-crit);"><input type="radio" name="clRad_${q.id}" value="NOK" style="width:20px; height:20px;"> NOK</label>
                    <label style="cursor:pointer; display:flex; align-items:center; gap:8px; font-size:16px; font-weight:bold; color:var(--text-muted); background:var(--surface); padding:8px 15px; border-radius:6px; border:1px solid var(--text-muted);"><input type="radio" name="clRad_${q.id}" value="N.A." style="width:20px; height:20px;"> N.A.</label>
                </div>
                <input type="text" class="dash-input cl-comment" placeholder="Megjegyzés (Nem kötelező, de NOK esetén jegy nyílik belőle)..." style="margin-bottom:0;">
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
    // Csak a tényleges kérdéseket (alfeladatokat) vizsgáljuk
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

function processData(allTasks) {
    currentActiveTasks = []; globalClosedTasks = []; let hasNewAdHoc = false;
    allTasks.forEach(t => { 
        let isPrev = String(t.id).startsWith("PREV-") || String(t.id).includes("REC-");
        if(t.statusz !== "Lezárt") {
            if (!String(t.id).includes("PROD-")) return;
            if (isPrev && !String(t.id).toUpperCase().includes("PROD")) return;
            currentActiveTasks.push(t);
            if(String(t.id).startsWith("PROD-KB-")) { if(!isFirstLoad && !knownAdHocIds.has(t.id)) hasNewAdHoc = true; knownAdHocIds.add(t.id); }
        } else {
            if (isPrev && !String(t.id).toUpperCase().includes("PROD")) return;
            globalClosedTasks.push(t);
        }
    });
    if (hasNewAdHoc && !isAlarming) triggerAlert();
    isFirstLoad = false; renderGrid(currentActiveTasks);
}

function renderGrid(renderTasks) {
    const grid = document.getElementById('taskGrid');
    if (renderTasks.length === 0) { grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; margin-top: 100px;"><div style="font-size: 60px; margin-bottom: 20px;">🎉</div><h2 style="color: var(--pri-normal);">Nincs aktív feladat ebben a nézetben.</h2></div>`; return; }
    let normalTasks = renderTasks.filter(t => !String(t.id).startsWith("PREV-") && !String(t.id).includes("REC-")); let prevTasks = renderTasks.filter(t => String(t.id).startsWith("PREV-") || String(t.id).includes("REC-"));
    const w = { "Termelésleállás": 4, "Magas prioritás": 3, "Normál": 2, "Megfigyelés alatt": 1.5, "Informatív": 1 };
    const sorter = (a, b) => { if (a.statusz === "Folyamatban" && b.statusz !== "Folyamatban") return -1; if (a.statusz !== "Folyamatban" && b.statusz === "Folyamatban") return 1; let pD = (w[String(b.prioritas)] || 0) - (w[String(a.prioritas)] || 0); if (pD !== 0) return pD; return new Date(a.idopont) - new Date(b.idopont); };
    normalTasks.sort(sorter); prevTasks.sort(sorter);
    let html = "";
    if (normalTasks.length > 0) { html += `<div class="section-title">🚨 Aktuális Hibák és Feladatok</div>`; normalTasks.forEach(task => { html += generateCardHtml(task); }); }
    if (prevTasks.length > 0) { html += `<div class="section-title" style="margin-top:40px; color: var(--pri-info); border-color: var(--pri-info);">🔁 Tervezett Termelési Feladatok</div>`; prevTasks.forEach(task => { html += generateCardHtml(task); }); }
    grid.innerHTML = html;
}

function getFilteredClosedTasks() {
    const srEl = document.getElementById('szuroReszleg'); const sr = srEl ? srEl.value : "";
    const skEl = document.getElementById('szuroKategoria'), sgEl = document.getElementById('szuroGep'), stEl = document.getElementById('filterDatumTol'), siEl = document.getElementById('filterDatumIg'), ismEl = document.getElementById('szuroLezartIsmetlodo');
    const sk = skEl ? skEl.value : "", sg = sgEl ? sgEl.value : "", st = stEl ? stEl.value : "", si = siEl ? siEl.value : "", ism = ismEl ? ismEl.value : "";
    const szovEl = document.getElementById('szuroLezartSzoveg'); const szov = szovEl ? szovEl.value.toLowerCase() : "";

    return globalClosedTasks.filter(t => { 
        let matchReszleg = true; if(sr === "termeles") matchReszleg = String(t.id).includes("PROD-"); else if(sr === "karbantartas") matchReszleg = !String(t.id).includes("PROD-");
        const d = String(t.idopont || "").substring(0, 10); let gepNev = (sg === "-") ? sk : sk + " - " + sg; let matchKat = sk ? (String(t.gep || "").startsWith(sk+" - ") || t.gep===sk) : true; let matchGep = sg ? t.gep===gepNev : true; let matchTol = st ? d>=st : true; let matchIg = si ? d<=si : true;
        let matchIsm = true; const isPrev = String(t.id || "").startsWith("PREV-"); if (ism === "normal") matchIsm = !isPrev; if (ism === "ismetlodo") matchIsm = isPrev;
        let matchSzoveg = szov ? (String(t.hiba).toLowerCase().includes(szov) || String(t.megoldas).toLowerCase().includes(szov) || String(t.gep).toLowerCase().includes(szov) || String(t.felhasznalo).toLowerCase().includes(szov)) : true;
        return matchReszleg && matchKat && matchGep && matchTol && matchIg && matchIsm && matchSzoveg; 
    });
}

function renderClosedTasks() { const f = getFilteredClosedTasks(); const c = document.getElementById('closedTaskGrid'); if(!c) return; if(f.length===0){c.innerHTML="<div style='grid-column:1/-1; text-align:center;'>Nincs találat.</div>"; return;} let h = ""; f.forEach(t => h += generateCardHtml(t)); c.innerHTML = h; }

function generateCardHtml(t) {
    const timeStr = new Date(t.idopont).toLocaleTimeString('hu-HU', {hour: '2-digit', minute:'2-digit'}); const dateStr = new Date(t.idopont).toLocaleDateString('hu-HU', {month:'short', day:'numeric'});
    let eC = ""; const pLower = String(t.prioritas).toLowerCase();
    if(t.statusz==="Lezárt") { eC="closed"; } else { if(pLower.includes("leállás")) {eC="Termelésleállás";} else if(pLower.includes("magas")) {eC="Magas";} else if(pLower.includes("megfigyelés")) {eC="Megfigyelés";} else if(pLower.includes("informatív")) {eC="Informatív";} if(t.statusz==="Folyamatban") eC="Folyamatban"; }
    let inP = t.statusz === "Folyamatban" ? `<div class="in-progress-bar"><span>⚙️</span> <b>${t.felelos}</b> éppen dolgozik rajta</div>` : "";
    let prevIcon = (String(t.id).startsWith("PREV-") || String(t.id).includes("REC-")) ? "🔁 " : ""; let reszlegIcon = String(t.id).includes("PROD-") ? "🏭 " : "🔧 ";
    if (t.statusz !== "Lezárt") {
        return `<div class="card ${eC}" onclick="openModal('${t.id}')"><div class="card-header"><span style="color: var(--text-muted); font-size: 13px; font-weight:bold;">${dateStr} - ${timeStr}</span></div><div class="machine-name">${reszlegIcon}${prevIcon}${t.gep}</div>${inP}<div class="issue-desc" style="white-space:pre-wrap;">${t.hiba}</div><div class="meta-footer"><div>Beküldte: <b>${t.felhasznalo}</b></div><div style="color: var(--text-muted); font-size:11px;">Részletek / Kezelés 👆</div></div></div>`;
    } else {
        let dtTxt = t.downtime ? ` (Kiesés: ${t.downtime} perc)` : "";
        return `<div class="card closed" onclick="openModal('${t.id}')"><div class="card-header"><span class="badge badge-closed">Lezárt</span><span style="color: var(--text-muted); font-size: 13px; font-weight:bold;">${dateStr} - ${timeStr}</span></div><div class="machine-name">${reszlegIcon}${prevIcon}${t.gep}</div><div class="issue-desc" style="white-space:pre-wrap;">${t.hiba}</div><div style="margin-bottom:10px; color:var(--pri-normal);"><b>Megoldás:</b><br>${String(t.megoldas||"").replace(/\n/g, '<br>')} <span style="color:var(--text-muted);">(${t.ido||0} perc${dtTxt})</span></div><div class="meta-footer"><div>Beküldte: <b>${t.felhasznalo}</b></div><div style="color: var(--text-muted); font-size:11px;">Részletek 👆</div></div></div>`;
    }
}

function triggerAlert() { isAlarming = true; if(optFlash) document.body.classList.add('flash-red'); if(optSound && audioCtx) playAlarmSound(); document.getElementById('ackAlertBtn').style.display = 'block'; }
function stopAlert() { isAlarming = false; document.body.classList.remove('flash-red'); document.getElementById('ackAlertBtn').style.display = 'none'; }
function playAlarmSound() { if (!audioCtx) return; let playBeep = (time) => { const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.connect(gain); gain.connect(audioCtx.destination); osc.type = 'square'; osc.frequency.setValueAtTime(800, audioCtx.currentTime + time); osc.frequency.setValueAtTime(1200, audioCtx.currentTime + time + 0.1); gain.gain.setValueAtTime(0.3, audioCtx.currentTime + time); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + time + 0.5); osc.start(audioCtx.currentTime + time); osc.stop(audioCtx.currentTime + time + 0.5); }; for(let i = 0; i < 10; i++) playBeep(i); }
function toggleSound() { optSound = !optSound; const btn = document.getElementById('btnToggleSound'); if(optSound) { btn.innerText = "🔊 Hang: BE"; btn.classList.add('active-sound'); const AudioContext = window.AudioContext || window.webkitAudioContext; if(AudioContext && !audioCtx) audioCtx = new AudioContext(); if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } else { btn.innerText = "🔇 Néma"; btn.classList.remove('active-sound'); } }
function toggleFlash() { optFlash = !optFlash; const btn = document.getElementById('btnToggleFlash'); if(optFlash) { btn.innerText = "🔴 Villogás: BE"; btn.classList.add('active-flash'); } else { btn.innerText = "⚪ Villogás: KI"; btn.classList.remove('active-flash'); } }

let activeTaskId = null;
function extendSession() { if(sessionUser) { document.getElementById('activeUserBadge').style.display = 'flex'; document.getElementById('dashUserName').innerText = sessionUser; populateNavDropdown(); refreshModalActionPanel(); } }
async function dashLoginModal() { const n = document.getElementById('dashLoginNevSelectModal').value !== "" ? document.getElementById('dashLoginNevSelectModal').value : document.getElementById('dashLoginNevModal').value; const j = document.getElementById('dashLoginPinModal').value; const stat = document.getElementById('dashLoginStatusModal'); if(!n || !j) { stat.innerText = "Add meg a PIN-t!"; return; } stat.innerText = "Ellenőrzés..."; try { const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "login", nev: n, jelszo: await hashPassword(j) }) }); const r = await res.json(); if(r.status === "success") { sessionUser = n; sessionRole = r.role || "production"; extendSession(); document.getElementById('dashLoginPinModal').value = ""; stat.innerText = ""; } else { stat.innerText = r.message; } } catch(e) { stat.innerText = "Hiba!"; } }
function dashLogout() { 
    sessionUser = null; 
    sessionRole = null; 
    localStorage.removeItem("activeUser"); 
    localStorage.removeItem("activeRole"); 
    document.getElementById('activeUserBadge').style.display = 'none'; 
    refreshModalActionPanel(); 
}
function checkDashLoginCustom(sel) { if(sel.value === "custom") { sel.style.display = 'none'; document.getElementById('dashLoginNevModal').style.display = 'block'; document.getElementById('dashLoginNevModal').focus(); } else { document.getElementById('dashLoginNevModal').value = sel.value; } }
function refreshModalActionPanel() { if(!activeTaskId) return; const task = currentActiveTasks.find(t => t.id === activeTaskId) || globalClosedTasks.find(t => t.id === activeTaskId); if(!task) return; if (sessionUser) { document.getElementById('dashLoginFormModal').style.display = 'none'; if (task.statusz !== "Lezárt") { document.getElementById('dashTaskActions').style.display = 'block'; const btnStart = document.getElementById('btnDashStart'); if(task.statusz === "Folyamatban") btnStart.style.display = 'none'; else btnStart.style.display = 'block'; } else { document.getElementById('dashTaskActions').style.display = 'none'; } } else { document.getElementById('dashLoginFormModal').style.display = 'block'; document.getElementById('dashTaskActions').style.display = 'none'; } }

function openModal(taskId) { 
    activeTaskId = taskId; 
    const task = currentActiveTasks.find(t => t.id === taskId) || globalClosedTasks.find(t => t.id === taskId); 
    if (!task) return; 
    
    let prevIcon = (String(task.id).startsWith("PREV-") || String(task.id).includes("REC-")) ? "🔁 " : ""; 
    let reszlegIcon = String(task.id).includes("PROD-") ? "🏭 " : "🔧 "; 
    
    document.getElementById('modalTitle').innerText = reszlegIcon + prevIcon + task.gep; 
    document.getElementById('modalSubtitle').innerText = task.hiba; 
    
    let pB = "badge-normal"; 
    const pLower = String(task.prioritas).toLowerCase(); 
    if(task.statusz === "Lezárt") pB = "badge-closed"; 
    else if(pLower.includes("leállás")) pB = "badge-crit"; 
    else if(pLower.includes("magas")) pB = "badge-high"; 
    else if(pLower.includes("megfigyelés")) pB = "badge-obs"; 
    else if(pLower.includes("informatív")) pB = "badge-info"; 
    
    let prioSpan = document.getElementById('modalPrio'); 
    prioSpan.className = `badge ${pB}`; 
    prioSpan.innerText = task.prioritas; 
    prioSpan.style.display = 'inline-block'; 
    
    let details = `<p style="margin:5px 0;"><b>Státusz:</b> <span style="color:var(--pri-info);">${task.statusz}</span></p><p style="margin:5px 0;"><b>Rögzítette:</b> ${task.felhasznalo} <span style="color:var(--text-muted); font-size:13px;">(${new Date(task.idopont).toLocaleString('hu-HU')})</span></p>`; 
    
    if (task.checklist) {
        let items = String(task.checklist).split('\n').filter(i => i.trim() !== "").map(i => `<li style="margin-bottom:4px;">${i}</li>`).join('');
        details += `<div style="background:#0f172a; border:1px solid var(--border); padding:15px; border-radius:6px; margin-top:15px; color:#cbd5e1;"><strong style="color:var(--pri-normal); font-size:16px;">📝 Teendők / Checklist:</strong><ul style="margin:10px 0 0 0; padding-left:20px;">${items}</ul></div>`;
    }

    if (task.statusz === 'Folyamatban') details += `<div style="background: rgba(139, 92, 246, 0.2); padding:10px; border-radius:6px; color:#a78bfa; margin-top:15px; border:1px solid var(--pri-prog);">👷 <b>${task.felelos}</b> dolgozik rajta</div>`; 
    if (task.statusz === 'Lezárt') details += `<div style="background: rgba(16, 185, 129, 0.2); padding:10px; border-radius:6px; color:#10b981; margin-top:15px; border:1px solid var(--pri-normal);">✅ <b>Megoldás:</b><br>${task.megoldas}</div>`; 
    
    document.getElementById('modalDetails').innerHTML = details; 
    document.getElementById('dashMegoldas').value = ""; 
    document.getElementById('dashIdo').value = ""; 
    document.getElementById('dashDowntime').value = ""; 
    
    refreshModalActionPanel(); 
    document.getElementById('taskModal').style.display = "flex"; 
    
    if(sessionUser) extendSession(); 
}

function closeModal(force = false) { if(force === true || event.target.id === 'taskModal') { document.getElementById('taskModal').style.display = "none"; activeTaskId = null; } if(sessionUser) extendSession(); }
async function dashStartTask() { if(!sessionUser || !activeTaskId) return; document.getElementById('btnDashStart').innerText = "Feldolgozás..."; await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "startTask", id: activeTaskId, felhasznalo: sessionUser }) }); fetchDashboardData(); closeModal(true); }
async function dashCloseTask() { if(!sessionUser || !activeTaskId) return; const m = document.getElementById(`dashMegoldas`).value, i = document.getElementById(`dashIdo`).value, dt = document.getElementById(`dashDowntime`).value; if(!m) return alert("A Megoldás mező kitöltése kötelező!"); await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "closeTask", id: activeTaskId, megoldas: m, ido: i, downtime: dt, lezarta: sessionUser }) }); fetchDashboardData(); closeModal(true); }
function populateNavDropdown() {
    const nav = document.getElementById('appNavDropdown');
    if(!nav) return;
    nav.innerHTML = '<option value="" disabled selected>☰ Navigáció</option>';
    const r = sessionRole || localStorage.getItem("activeRole") || "";
    
    if (r === "production" || r === "admin" || r === "superuser") {
        nav.add(new Option("📱 Termelés App", "production.html"));
        nav.add(new Option("📺 Termelés Faliújság", "dashboard_prod.html"));
    }
    if (r === "maintenance" || r === "admin" || r === "superuser") {
        nav.add(new Option("🔧 Karbantartás App", "index.html"));
        nav.add(new Option("📺 Karbantartás Faliújság", "dashboard.html"));
    }
}