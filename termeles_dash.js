const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbziABd0I2cSep7TveoNoaQZkI5FzxYl4suqSfCR2rD8MXJQNMHPiygbTD8MK0T3Qz40/exec";
const RESZLEG = "production";

const gepAdatbazis = { 
    "Production - Line 1": [ "Conv - Szállítástechnika", "Schenck - Szelepszerelő robot", "TPMS1 - Screwing Station Manual - Atlas Copco", "RMS1 - Tire assembly - Hofmann", "RMM1 - Matching machine - Hofmann", "RFG1 - Tire Inflation - Hofmann", "RSO1 - Bead Seat Optimizer - Hofmann", "RGM1 - Tire Uniformity - Hofmann", "AWS1 - Balancing - Hofmann", "WC1 - Weight cutter - Rameckers", "AGS1 - Weight applicator - KUKA" ], 
    "Production - Line 2": [ "Conv - Szállítástechnika", "WGS2 - Wheel gauging - IEF Werner", "RMS2 - Tire assembly - Hofmann", "RFG2 - Tire Inflation - Hofmann", "AWS2 - Balancing - Hofmann", "WC2 - Weight cutter - Rameckers", "AGS2 - Weight applicator - KUKA", "AWSK1 - Control Balancing - Hofmann", "TPMS writing /reading - ATEQ", "EOL1 - End of Line control - Mabri Vision" ], 
    "Production - Egyedi gépek": [ "MTAM1 - Manual tyre assembly machine - Hofmann", "CUT1 - Bandage Cutting Machine - Cyklop", "HP1 - Hydraulic Press - Strautmann" ], 
    "Magasraktár - High Bay System": [ "RBG 1 - Beewen", "RBG 2 - Beewen", "RBG 3 - Beewen", "Conveyors - Blume/Thepas" ], 
    "Palettázó B&O": [ "Szekventáló robot - B&O" ], 
    "Q-Area": [ "TLIT - Tire leak inspection tank - Corghi", "MTAM2 - Manual tyre assembly machine - Aikido" ], 
    "Facility": [ "Épülettel kapcsolatos dolgok" ], 
    "IT": [ "Szerverek", "Hálózati eszközök (Switch/AP)", "Kliens gépek (PC/Laptop)", "Nyomtatók és szkennerek", "Szoftver és rendszerek", "Egyéb IT eszköz" ], 
    "Compressors": [ "DRAIN - Drain Water Separator - Boge", "COMP1 - Compressor 1 - Boge", "DRY1 - Air Dryer 1 - Beko", "COMP2 - Compressor 2 - Boge", "DRY2 - Air Dryer 2 - Beko", "COMP3 - Compressor 3 - Boge" ], 
    "Aggregátor": [] 
};

let currentActiveTasks = []; 
let globalClosedTasks = []; 
let globalShiftLogs = []; 
let clSablon = []; 
let clNaplo = []; 
let globalPartsList = [];
let targetPartInputId = null;

let REFRESH_INTERVAL_SEC = 300; 
let timer = REFRESH_INTERVAL_SEC; 
let sessionUser = null; 
let sessionRole = null; 
let activeFilter = null;
let autoResetTimeout = null;

let optSound = false; 
let optFlash = true; 
let audioCtx = null; 
let isAlarming = false; 
let knownAdHocIds = new Set(); 
let isFirstLoad = true;
let activeTaskId = null;
let isEditMode = false;

window.onload = function() {
    const szuroKatSelect = document.getElementById('szuroKategoria'); 
    const clDashTerulet = document.getElementById('clDashTerulet');
    if(szuroKatSelect) { 
        for (let kat in gepAdatbazis) { 
            szuroKatSelect.add(new Option(kat, kat)); 
            if(clDashTerulet) clDashTerulet.add(new Option(kat, kat)); 
        } 
    }
    loadUserList(); 
    const savedUser = localStorage.getItem("activeUser"); 
    if(savedUser) { 
        sessionUser = savedUser; 
        sessionRole = localStorage.getItem("activeRole"); 
        extendSession(); 
    } 
    if(optFlash) document.getElementById('btnToggleFlash').classList.add('active-flash');
    fetchDashboardData();
    fetchPartsList();
};

function toLocalISOString(dateObj) { 
    if(isNaN(dateObj)) return ""; 
    const y = dateObj.getFullYear(), m = String(dateObj.getMonth() + 1).padStart(2, '0'), d = String(dateObj.getDate()).padStart(2, '0'); 
    return `${y}-${m}-${d}`; 
}

function switchDashTab(tabId) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active')); 
    document.querySelectorAll('.dash-nav button').forEach(b => b.classList.remove('active'));
    document.getElementById('view-' + tabId).classList.add('active');
    
    let btnMap = { 'nyitott': 'tabNyitott', 'lezart': 'tabLezart', 'checklist': 'tabChecklist' };
    if (btnMap[tabId]) document.getElementById(btnMap[tabId]).classList.add('active');
    
    if (tabId === 'checklist') renderChecklistTab();
    if (tabId === 'lezart') renderClosedTasks();
}

function frissitSzuroGepek() { 
    const k = document.getElementById('szuroKategoria').value; 
    const s = document.getElementById('szuroGep'); 
    s.innerHTML = '<option value="">Összes gép...</option>'; 
    if (k && gepAdatbazis[k]) { 
        if (gepAdatbazis[k].length === 0) { s.add(new Option("Nincs alegység", "-")); } 
        else { s.add(new Option("— Teljes sor / Általános —", "-")); gepAdatbazis[k].forEach(g => s.add(new Option(g, g))); } 
    } 
    renderClosedTasks(); 
}

function frissitDashGep() { 
    const k = document.getElementById('clDashTerulet').value; 
    const s = document.getElementById('clDashGep'); 
    s.innerHTML = '<option value="">Általános / Összes gép...</option>'; 
    if (k && gepAdatbazis[k]) { gepAdatbazis[k].forEach(g => s.add(new Option(g, g))); } 
    renderChecklistTab(); 
}

async function loadUserList() { 
    try { 
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getUsers" }) }); 
        const r = await res.json(); 
        if (r.status === "success" && r.data.length > 0) { 
            const sel = document.getElementById('clLoginNevSelect'); 
            if(sel) {
                sel.innerHTML = '<option value="">Név kiválasztása...</option>'; 
                r.data.forEach(user => sel.add(new Option(user, user))); 
            }
            const sel2 = document.getElementById('dashLoginNevSelectModal'); 
            if(sel2) { 
                sel2.innerHTML = '<option value="">Válassz...</option>'; 
                r.data.forEach(user => sel2.add(new Option(user, user))); 
            } 
        } 
    } catch(e) {} 
}

async function hashPassword(p) { 
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p)); 
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''); 
}

setInterval(() => { 
    document.getElementById('clockDisplay').innerText = new Date().toLocaleTimeString('hu-HU'); 
}, 1000);

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
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getAllData", reszleg: RESZLEG }) }); 
        const result = await res.json();
        if(result.status === "success") { 
            clSablon = result.data.checklistSablon || []; 
            clNaplo = result.data.checklistNaplo || [];
            globalShiftLogs = result.data.shiftLogs || [];
            processData(result.data.tasks); 
            checkMidShiftChecklist();
            if(document.getElementById('view-checklist').classList.contains('active')) renderChecklistTab();
        } 
    } catch (e) { console.error(e); }
}

// 4. PONT: ÉJSZAKAI MŰSZAKBAN ÉS HÉTVÉGÉN NINCS CHECKLIST RIASZTÁS
function checkMidShiftChecklist() {
    let now = new Date(); 
    let h = now.getHours(); 
    let m = now.getMinutes(); 
    let timeFloat = h + (m/60);
    let currentShift = ""; 
    let todayStr = toLocalISOString(now);

    let isWeekend = (now.getDay() === 0 || now.getDay() === 6);
    if (isWeekend) {
        document.getElementById('checklistAlarmBanner').style.display = 'none'; 
        document.body.classList.remove('flash-red');
        return;
    }

    if (timeFloat >= 6 && timeFloat < 14) currentShift = "Délelőtt (06:00-14:00)"; 
    else if (timeFloat >= 14 && timeFloat < 22) currentShift = "Délután (14:00-22:00)"; 
    else {
        // Éjszaka a checklistet nem keressük és nem riasztunk
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
        if(optFlash) document.body.classList.add('flash-red'); 
    } else { 
        document.getElementById('checklistAlarmBanner').style.display = 'none'; 
        document.body.classList.remove('flash-red'); 
    }
}

// 6. PONT: CHECKLIST MEGJELENÍTÉSE, MÁR KITÖLTÖTT ÁLLAPOT, MÓDOSÍTÁS GOMB ÉS VISSZATÖLTŐDŐ GOMBOK
function renderChecklistTab() {
    let now = new Date(); 
    let h = now.getHours(); 
    let timeFloat = h + (now.getMinutes()/60);
    let currentShift = ""; 
    let todayStr = toLocalISOString(now);
    
    if (timeFloat >= 6 && timeFloat < 14) currentShift = "Délelőtt (06:00-14:00)"; 
    else if (timeFloat >= 14 && timeFloat < 22) currentShift = "Délután (14:00-22:00)"; 
    else { 
        currentShift = "Éjszaka (22:00-06:00)"; 
        if (timeFloat < 6) { 
            let yest = new Date(now); 
            yest.setDate(yest.getDate()-1); 
            todayStr = toLocalISOString(yest); 
        } 
    }
    
    let currentShiftShort = currentShift.split(" ")[0]; 
    let logicalDateObj = new Date(now); 
    if (timeFloat < 6) logicalDateObj.setDate(logicalDateObj.getDate()-1);
    let dayOfWeekArr = ["Vasárnap", "Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat"];
    let todayDayName = dayOfWeekArr[logicalDateObj.getDay()];
    let isWeekday = (logicalDateObj.getDay() >= 1 && logicalDateObj.getDay() <= 5);

    document.getElementById('clMuszakNev').innerText = todayStr + " | " + currentShift;

    let existingLog = clNaplo.find(l => l.datum === todayStr && l.muszak === currentShift);
    let savedAnswers = {};
    if (existingLog && existingLog.eredmenyek) {
        try {
            let parsed = typeof existingLog.eredmenyek === 'string' ? JSON.parse(existingLog.eredmenyek) : existingLog.eredmenyek;
            parsed.forEach(p => {
                savedAnswers[p.kerdes] = { valasz: p.valasz, megjegyzes: p.megjegyzes || "" };
            });
        } catch(e) {}
    }

    let statusContainer = document.getElementById('checklistStatusContainer');
    let questionsContainer = document.getElementById('checklistQuestionsContainer');

    if (existingLog && !isEditMode) {
        statusContainer.innerHTML = `
            <div style="background:#d1fae5; color:#065f46; padding:15px 20px; border-radius:8px; border:2px solid #10b981; display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
                <div>
                    <span style="font-size:16px;">✅ <b>${existingLog.kitolto}</b> már elvégezte az aktuális műszak ellenőrzőlistáját!</span>
                </div>
                <button onclick="enableChecklistEdit()" style="background:#0284c7; color:white; border:none; padding:8px 18px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:14px; width:auto; margin:0;">✏️ Módosítás</button>
            </div>
        `;
        questionsContainer.style.display = 'none';
        return;
    } else if (existingLog && isEditMode) {
        statusContainer.innerHTML = `
            <div style="background:#fef3c7; color:#92400e; padding:12px 18px; border-radius:8px; border:2px solid #f59e0b; display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <span>⚠️ <b>Módosítási mód:</b> Az alábbi korábbi válaszok módosíthatók és újra beküldhetők.</span>
                <button onclick="cancelChecklistEdit()" style="background:#64748b; color:white; border:none; padding:6px 14px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; width:auto; margin:0;">Mégsem</button>
            </div>
        `;
        questionsContainer.style.display = 'block';
    } else {
        statusContainer.innerHTML = "";
        questionsContainer.style.display = 'block';
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
        statusContainer.innerHTML += `<div style="color:var(--text-muted); text-align:center; padding:20px;">Jelenleg (erre a szűrésre / műszakra) nincs aktív feladat.</div>`;
        questionsContainer.style.display = 'none';
        return;
    }

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

            let margin = q.szuloId ? 20 : 0; 
            let borderStyle = q.szuloId ? "border-left: 3px solid var(--pri-obs);" : "border:1px solid var(--border);";
            let faIkon = q.szuloId ? "↳ " : "";

            // Korábbi válasz visszatöltése
            let prevAns = savedAnswers[q.kerdes] || { valasz: "", megjegyzes: "" };
            let checkedOK = prevAns.valasz === "OK" ? "checked" : "";
            let checkedNOK = prevAns.valasz === "NOK" ? "checked" : "";
            let checkedNA = prevAns.valasz === "N.A." ? "checked" : "";

            html += `
            <div style="background:var(--bg-dark); padding:10px; border-radius:6px; margin-bottom:10px; border:1px solid var(--border); ${borderStyle} margin-left:${margin}px;" class="cl-question-block" data-terulet="${q.terulet}" data-gep="${q.gep}" data-kerdes="${q.kerdes}">
                <div style="font-size:11px; font-weight:bold; color:var(--pri-info); margin-bottom:4px; display:${q.szuloId ? 'none' : 'block'};">[${q.terulet||'Általános'}${gTxt}]</div>
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

function enableChecklistEdit() {
    isEditMode = true;
    renderChecklistTab();
}

function cancelChecklistEdit() {
    isEditMode = false;
    renderChecklistTab();
}

async function verifyAndSubmitChecklist() {
    let now = new Date(); 
    let h = now.getHours(); 
    let timeFloat = h + (now.getMinutes()/60);
    let currentShift = ""; 
    let todayStr = toLocalISOString(now);
    
    if (timeFloat >= 6 && timeFloat < 14) currentShift = "Délelőtt (06:00-14:00)"; 
    else if (timeFloat >= 14 && timeFloat < 22) currentShift = "Délután (14:00-22:00)"; 
    else { 
        currentShift = "Éjszaka (22:00-06:00)"; 
        if (timeFloat < 6) { 
            let yest = new Date(now); 
            yest.setDate(yest.getDate()-1); 
            todayStr = toLocalISOString(yest); 
        } 
    }

    const nev = document.getElementById('clLoginNevSelect').value; 
    const pin = document.getElementById('clLoginPin').value; 
    const stat = document.getElementById('clLoginStatus');
    if(!nev || !pin) { stat.innerText = "Válaszd ki a neved és add meg a PIN kódod!"; return; }

    let eredmenyek = []; 
    let blocks = document.querySelectorAll('.cl-question-block');
    for (let i = 0; i < blocks.length; i++) {
        let block = blocks[i]; 
        let terulet = block.getAttribute('data-terulet'); 
        let gep = block.getAttribute('data-gep'); 
        let kerdes = block.getAttribute('data-kerdes');
        let radios = block.querySelectorAll('input[type="radio"]'); 
        let val = null;
        for(let r of radios) { if(r.checked) val = r.value; }
        if(!val) { stat.innerText = `Hiba: Kérlek minden kérdésre válaszolj!`; return; }
        let megjegyzes = block.querySelector('.cl-comment').value.trim();
        eredmenyek.push({ kerdes: kerdes, terulet: terulet, gep: gep, valasz: val, megjegyzes: megjegyzes });
    }

    stat.innerText = "Hitelesítés és mentés folyamatban...";
    try {
        const resLogin = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "login", nev: nev, jelszo: await hashPassword(pin) }) }); 
        const rLogin = await resLogin.json(); 
        if(rLogin.status !== "success") { stat.innerText = "Hibás PIN kód!"; return; }
        
        let hibak = eredmenyek.filter(e => e.valasz === 'NOK');
        if(hibak.length > 0) { 
            if(!confirm(`⚠️ FIGYELEM!\n\n${hibak.length} db NOK választ adtál meg. A rendszer ezekből automatikusan hibajegyeket fog nyitni a Karbantartás felé.\n\nBiztosan elküldöd?`)) { 
                stat.innerText=""; 
                return; 
            } 
        }

        const payload = { 
            action: "saveShiftChecklist", 
            datum: todayStr, 
            muszak: currentShift, 
            felhasznalo: nev, 
            eredmenyek: eredmenyek, 
            hibak: hibak 
        };
        const resSave = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) }); 
        const rSave = await resSave.json();
        
        if(rSave.status === "success") {
            stat.style.color = "var(--pri-normal)"; 
            stat.innerText = "Sikeres mentés / felülírás!"; 
            document.getElementById('clLoginPin').value = "";
            isEditMode = false;
            fetchDashboardData(); 
        } else { 
            stat.innerText = rSave.message; 
        }
    } catch(e) { 
        stat.innerText = "Hálózati hiba!"; 
    }
}

// KPI ÉS FELADATOK FELDOLGOZÁSA A FALIÚJSÁGHOZ
function processData(allTasks) {
    currentActiveTasks = []; 
    globalClosedTasks = []; 
    let hasNewAdHoc = false;
    let cCrit = 0, cHigh = 0, cProg = 0, cInfo = 0;

    allTasks.forEach(t => { 
        let isPrev = String(t.id).startsWith("PREV-") || String(t.id).includes("REC-");
        if(t.statusz !== "Lezárt") {
            if (!String(t.id).includes("PROD-")) return;
            if (isPrev && !String(t.id).toUpperCase().includes("PROD")) return;
            
            currentActiveTasks.push(t);
            const pLower = String(t.prioritas).toLowerCase();
            if(pLower.includes("leállás")) cCrit++;
            if(pLower.includes("magas")) cHigh++;
            if(t.statusz === "Folyamatban") cProg++;
            if(pLower.includes("informatív") || pLower.includes("megfigyelés")) cInfo++;

            if(String(t.id).startsWith("PROD-KB-")) { 
                if(!isFirstLoad && !knownAdHocIds.has(t.id)) hasNewAdHoc = true; 
                knownAdHocIds.add(t.id); 
            }
        } else {
            if (isPrev && !String(t.id).toUpperCase().includes("PROD")) return;
            globalClosedTasks.push(t);
        }
    });

    if (hasNewAdHoc && !isAlarming) triggerAlert();
    isFirstLoad = false;

    if(document.getElementById('kpiCrit')) document.getElementById('kpiCrit').innerText = cCrit; 
    if(document.getElementById('kpiHigh')) document.getElementById('kpiHigh').innerText = cHigh;
    if(document.getElementById('kpiProg')) document.getElementById('kpiProg').innerText = cProg; 
    if(document.getElementById('kpiInfo')) document.getElementById('kpiInfo').innerText = cInfo; 
    if(document.getElementById('kpiTotal')) document.getElementById('kpiTotal').innerText = currentActiveTasks.length - cInfo;

    renderGrid(currentActiveTasks);
}

function setDashboardFilter(filterType) {
    if (activeFilter === filterType) activeFilter = null; else activeFilter = filterType;
    document.querySelectorAll('.kpi-card').forEach(el => el.classList.remove('active-filter'));
    if (activeFilter) document.getElementById('kpiCard-' + activeFilter).classList.add('active-filter');
    else document.getElementById('kpiCard-Total').classList.add('active-filter');

    if (autoResetTimeout) clearTimeout(autoResetTimeout);
    if (activeFilter !== null) autoResetTimeout = setTimeout(() => { setDashboardFilter(null); }, 45000);
    
    renderGrid(currentActiveTasks);
}

function renderGrid(renderTasks) {
    const grid = document.getElementById('taskGrid');
    if(!grid) return;
    
    let filteredTasks = renderTasks;
    if (activeFilter === 'Crit') filteredTasks = renderTasks.filter(t => String(t.prioritas).toLowerCase().includes("leállás"));
    else if (activeFilter === 'High') filteredTasks = renderTasks.filter(t => String(t.prioritas).toLowerCase().includes("magas"));
    else if (activeFilter === 'Prog') filteredTasks = renderTasks.filter(t => t.statusz === "Folyamatban");
    else if (activeFilter === 'Info') filteredTasks = renderTasks.filter(t => String(t.prioritas).toLowerCase().includes("informatív") || String(t.prioritas).toLowerCase().includes("megfigyelés"));
    else if (activeFilter === null) filteredTasks = renderTasks.filter(t => !String(t.prioritas).toLowerCase().includes("informatív") && !String(t.prioritas).toLowerCase().includes("megfigyelés"));

    if (filteredTasks.length === 0) { 
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; margin-top: 60px;"><div style="font-size: 50px; margin-bottom: 15px;">🎉</div><h2 style="color: var(--pri-normal);">Nincs aktív termelési feladat.</h2></div>`; 
        return; 
    }
    
    let normalTasks = filteredTasks.filter(t => !String(t.id).startsWith("PREV-") && !String(t.id).includes("REC-")); 
    let prevTasks = filteredTasks.filter(t => String(t.id).startsWith("PREV-") || String(t.id).includes("REC-"));
    
    const w = { "Termelésleállás": 4, "Magas prioritás": 3, "Normál": 2, "Megfigyelés alatt": 1.5, "Informatív": 1 };
    const sorter = (a, b) => { 
        if (a.statusz === "Folyamatban" && b.statusz !== "Folyamatban") return -1; 
        if (a.statusz !== "Folyamatban" && b.statusz === "Folyamatban") return 1; 
        let pD = (w[String(b.prioritas)] || 0) - (w[String(a.prioritas)] || 0); 
        if (pD !== 0) return pD; 
        return new Date(a.idopont) - new Date(b.idopont); 
    };
    normalTasks.sort(sorter); 
    prevTasks.sort(sorter);
    
    let html = "";
    if (normalTasks.length > 0) { 
        html += `<div class="section-title">🚨 Aktuális Hibák és Feladatok</div>`; 
        normalTasks.forEach(task => { html += generateCardHtml(task); }); 
    }
    if (prevTasks.length > 0) { 
        html += `<div class="section-title" style="margin-top:40px; color: var(--pri-info); border-color: var(--pri-info);">🔁 Tervezett Termelési Feladatok</div>`; 
        prevTasks.forEach(task => { html += generateCardHtml(task); }); 
    }
    grid.innerHTML = html;
}

function getFilteredClosedTasks() {
    const srEl = document.getElementById('szuroReszleg'); const sr = srEl ? srEl.value : "";
    const skEl = document.getElementById('szuroKategoria'), sgEl = document.getElementById('szuroGep'), stEl = document.getElementById('filterDatumTol'), siEl = document.getElementById('filterDatumIg'), ismEl = document.getElementById('szuroLezartIsmetlodo');
    const sk = skEl ? skEl.value : "", sg = sgEl ? sgEl.value : "", st = stEl ? stEl.value : "", si = siEl ? siEl.value : "", ism = ismEl ? ismEl.value : "";
    const szovEl = document.getElementById('szuroLezartSzoveg'); const szov = szovEl ? szovEl.value.toLowerCase() : "";

    return globalClosedTasks.filter(t => { 
        let matchReszleg = true; 
        if(sr === "termeles") matchReszleg = String(t.id).includes("PROD-"); 
        else if(sr === "karbantartas") matchReszleg = !String(t.id).includes("PROD-");

        const d = String(t.idopont || "").substring(0, 10); 
        let gepNev = (sg === "-") ? sk : sk + " - " + sg; 
        let matchKat = sk ? (String(t.gep || "").startsWith(sk+" - ") || t.gep===sk) : true; 
        let matchGep = sg ? t.gep===gepNev : true; 
        let matchTol = st ? d>=st : true; 
        let matchIg = si ? d<=si : true;
        let matchIsm = true; 
        const isPrev = String(t.id || "").startsWith("PREV-"); 
        if (ism === "normal") matchIsm = !isPrev; 
        if (ism === "ismetlodo") matchIsm = isPrev;
        let matchSzoveg = szov ? (String(t.hiba).toLowerCase().includes(szov) || String(t.megoldas).toLowerCase().includes(szov) || String(t.gep).toLowerCase().includes(szov) || String(t.felhasznalo).toLowerCase().includes(szov)) : true;
        
        return matchReszleg && matchKat && matchGep && matchTol && matchIg && matchIsm && matchSzoveg; 
    });
}

function renderClosedTasks() { 
    const f = getFilteredClosedTasks(); 
    const c = document.getElementById('closedTaskGrid'); 
    if(!c) return; 
    if(f.length===0){
        c.innerHTML="<div style='grid-column:1/-1; text-align:center;'>Nincs a keresésnek megfelelő lezárt feladat.</div>"; 
        return;
    } 
    let h = ""; 
    f.forEach(t => h += generateCardHtml(t)); 
    c.innerHTML = h; 
}

function generateCardHtml(t) {
    const timeStr = new Date(t.idopont).toLocaleTimeString('hu-HU', {hour: '2-digit', minute:'2-digit'}); 
    const dateStr = new Date(t.idopont).toLocaleDateString('hu-HU', {month:'short', day:'numeric'});
    let bC = "badge-normal", eC = ""; 
    const pLower = String(t.prioritas).toLowerCase();
    
    if(t.statusz==="Lezárt") { bC="badge-closed"; eC="closed"; } 
    else { 
        if(pLower.includes("leállás")) { bC="badge-crit"; eC="Termelésleállás"; } 
        else if(pLower.includes("magas")) { bC="badge-high"; eC="Magas"; } 
        else if(pLower.includes("megfigyelés")) { bC="badge-obs"; eC="Megfigyelés"; } 
        else if(pLower.includes("informatív")) { bC="badge-info"; eC="Informatív"; } 
        if(t.statusz==="Folyamatban") eC="Folyamatban"; 
    }
    
    let inP = t.statusz === "Folyamatban" ? `<div class="in-progress-bar"><span>⚙️</span> <b>${t.felelos}</b> éppen dolgozik rajta</div>` : "";
    let prevIcon = (String(t.id).startsWith("PREV-") || String(t.id).includes("REC-")) ? "🔁 " : ""; 
    let reszlegIcon = String(t.id).includes("PROD-") ? "🏭 " : "🔧 ";
    
    if (t.statusz !== "Lezárt") {
        return `<div class="card ${eC}" onclick="openModal('${t.id}')">
            <div class="card-header"><span class="badge ${bC}">${t.prioritas}</span><span style="color: var(--text-muted); font-size: 13px; font-weight:bold;">${dateStr} - ${timeStr}</span></div>
            <div class="machine-name">${reszlegIcon}${prevIcon}${t.gep}</div>
            ${inP}
            <div class="issue-desc" style="white-space:pre-wrap;">${t.hiba}</div>
            <div class="meta-footer"><div>Beküldte: <b>${t.felhasznalo}</b></div><div style="color: var(--text-muted); font-size:11px;">Részletek / Kezelés 👆</div></div>
        </div>`;
    } else {
        let dtTxt = t.downtime ? ` (Kiesés: ${t.downtime} perc)` : "";
        return `<div class="card closed" onclick="openModal('${t.id}')">
            <div class="card-header"><span class="badge badge-closed">Lezárt</span><span style="color: var(--text-muted); font-size: 13px; font-weight:bold;">${dateStr} - ${timeStr}</span></div>
            <div class="machine-name">${reszlegIcon}${prevIcon}${t.gep}</div>
            <div class="issue-desc" style="white-space:pre-wrap;">${t.hiba}</div>
            <div style="margin-bottom:10px; color:var(--pri-normal);"><b>Megoldás:</b><br>${String(t.megoldas||"").replace(/\n/g, '<br>')} <span style="color:var(--text-muted);">(${t.ido||0} perc${dtTxt})</span></div>
            <div class="meta-footer"><div>Beküldte: <b>${t.felhasznalo}</b></div><div style="color: var(--text-muted); font-size:11px;">Részletek 👆</div></div>
        </div>`;
    }
}

// RIASZTÁSOK ÉS HANGOK
function triggerAlert() { 
    isAlarming = true; 
    if(optFlash) document.body.classList.add('flash-red'); 
    if(optSound && audioCtx) playAlarmSound(); 
    document.getElementById('ackAlertBtn').style.display = 'block'; 
}
function stopAlert() { 
    isAlarming = false; 
    document.body.classList.remove('flash-red'); 
    document.getElementById('ackAlertBtn').style.display = 'none'; 
}
function playAlarmSound() { 
    if (!audioCtx) return; 
    let playBeep = (time) => { 
        const osc = audioCtx.createOscillator(); 
        const gain = audioCtx.createGain(); 
        osc.connect(gain); 
        gain.connect(audioCtx.destination); 
        osc.type = 'square'; 
        osc.frequency.setValueAtTime(800, audioCtx.currentTime + time); 
        osc.frequency.setValueAtTime(1200, audioCtx.currentTime + time + 0.1); 
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime + time); 
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + time + 0.5); 
        osc.start(audioCtx.currentTime + time); 
        osc.stop(audioCtx.currentTime + time + 0.5); 
    }; 
    for(let i = 0; i < 10; i++) playBeep(i); 
}
function toggleSound() { 
    optSound = !optSound; 
    const btn = document.getElementById('btnToggleSound'); 
    if(optSound) { 
        btn.innerText = "🔊"; 
        btn.classList.add('active-sound'); 
        const AudioContext = window.AudioContext || window.webkitAudioContext; 
        if(AudioContext && !audioCtx) audioCtx = new AudioContext(); 
        if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); 
    } else { 
        btn.innerText = "🔇"; 
        btn.classList.remove('active-sound'); 
    } 
}
function toggleFlash() { 
    optFlash = !optFlash; 
    const btn = document.getElementById('btnToggleFlash'); 
    if(optFlash) { 
        btn.innerText = "🔴"; 
        btn.classList.add('active-flash'); 
    } else { 
        btn.innerText = "⚪"; 
        btn.classList.remove('active-flash'); 
        document.body.classList.remove('flash-red');
    } 
}

// ALKATRÉSZ KERESŐ
async function fetchPartsList() {
    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getPartsList" }) });
        const r = await res.json();
        if(r.status === "success") {
            globalPartsList = r.data || [];
        }
    } catch(e) {}
}

function openPartsModal(inputId) {
    targetPartInputId = inputId;
    if(document.getElementById('partsSearchInput')) document.getElementById('partsSearchInput').value = "";
    renderPartsList(globalPartsList.slice(0, 50)); 
    if(document.getElementById('partsModal')) {
        document.getElementById('partsModal').style.display = "flex";
        document.getElementById('partsSearchInput').focus();
    }
}

function closePartsModal(force=false) {
    if(force || (event && event.target.id === 'partsModal')) {
        if(document.getElementById('partsModal')) document.getElementById('partsModal').style.display = "none";
        targetPartInputId = null;
    }
}

function filterPartsList() {
    let q = document.getElementById('partsSearchInput').value.toLowerCase().trim();
    if(!q) { renderPartsList(globalPartsList.slice(0, 50)); return; }
    let filtered = globalPartsList.filter(p => 
        p.id.toLowerCase().includes(q) || 
        p.name.toLowerCase().includes(q) || 
        (p.manuf && p.manuf.toLowerCase().includes(q)) || 
        (p.machSup && p.machSup.toLowerCase().includes(q))
    );
    renderPartsList(filtered.slice(0, 100)); 
}

function renderPartsList(list) {
    let c = document.getElementById('partsListContainer');
    if(!c) return;
    let validList = list.filter(p => p.qty > 0); 
    if(validList.length === 0) { c.innerHTML = "<div style='padding:20px; text-align:center; color:var(--text-muted);'>Nincs készleten a keresett alkatrészből!</div>"; return; }
    
    let h = "";
    validList.forEach(p => {
        h += `<div style="padding:12px 10px; border-bottom:1px solid #cbd5e1; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="selectPart('${p.id}')" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='transparent'">
            <div style="flex:1; padding-right:10px;">
                <div style="font-weight:bold; color:var(--primary); font-size:14px; margin-bottom:2px;">${p.name}</div>
                <div style="font-size:13px; color:var(--text-main); font-family:monospace; font-weight:bold;">Cikkszám: ${p.id}</div>
                <div style="font-size:12px; color:var(--text-muted); margin-top:6px; line-height:1.4;">
                    <b>Gyártó:</b> ${p.manuf || '-'} <br>
                    <b>Gépbeszállító:</b> ${p.machSup || '-'} <br>
                    <b>Raktárhely:</b> <span style="color:var(--pri-normal); font-weight:bold;">${p.loc || '-'}</span>
                </div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:16px; font-weight:bold; color:var(--pri-crit); margin-bottom:5px;">${p.qty} db</div>
                <button style="background:var(--pri-info); color:white; border:none; padding:6px 12px; border-radius:4px; font-size:12px; cursor:pointer; font-weight:bold;">Kiválaszt</button>
            </div>
        </div>`;
    });
    c.innerHTML = h;
}

function selectPart(id) {
    if(targetPartInputId) {
        let el = document.getElementById(targetPartInputId);
        if(el) el.value = id;
    }
    closePartsModal(true);
}

function addAlkatreszRow() {
    const container = document.getElementById('alkatreszekContainer');
    const row = document.createElement('div');
    row.className = "alkatresz-sor";
    row.style.cssText = "display:flex; gap:8px; margin-bottom:5px; align-items:center;";
    let rId = Math.floor(Math.random()*100000);
    row.innerHTML = `
        <div style="flex:3; display:flex; margin:0; border: 1px solid var(--border); border-radius:4px; overflow:hidden;">
            <input type="text" id="dashAlkCikk_${rId}" class="dash-input alk-cikkszam" placeholder="Cikkszám" style="flex:1; margin:0; font-size:13px; padding:6px; border:none; outline:none; min-width:80px;">
            <button type="button" onclick="openPartsModal('dashAlkCikk_${rId}')" style="background:var(--pri-obs); color:white; border:none; padding:0 8px; cursor:pointer; font-size:14px; width:36px; display:flex; align-items:center; justify-content:center;">🔍</button>
        </div>
        <input type="number" class="dash-input alk-db" placeholder="Db" style="flex:1; margin:0; font-size:13px; padding:6px; min-width:40px;">
        <button type="button" onclick="this.parentElement.remove()" style="background:#ef4444; color:white; border:none; width:32px; height:32px; border-radius:4px; cursor:pointer; font-weight:bold; padding:0; display:flex; justify-content:center; align-items:center;">✕</button>
    `;
    container.appendChild(row);
}

// MODAL ÉS LEZÁRÁS
function extendSession() { 
    if(sessionUser) { 
        document.getElementById('activeUserBadge').style.display = 'flex'; 
        document.getElementById('dashUserName').innerText = sessionUser; 
        populateNavDropdown(); 
        refreshModalActionPanel(); 
    } 
}

async function dashLoginModal() { 
    const n = document.getElementById('dashLoginNevSelectModal').value !== "" ? document.getElementById('dashLoginNevSelectModal').value : document.getElementById('dashLoginNevModal').value; 
    const j = document.getElementById('dashLoginPinModal').value; 
    const stat = document.getElementById('dashLoginStatusModal'); 
    if(!n || !j) { stat.innerText = "Add meg a PIN-t!"; return; } 
    stat.innerText = "Ellenőrzés..."; 
    try { 
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "login", nev: n, jelszo: await hashPassword(j) }) }); 
        const r = await res.json(); 
        if(r.status === "success") { 
            sessionUser = n; 
            sessionRole = r.role || "production"; 
            extendSession(); 
            document.getElementById('dashLoginPinModal').value = ""; 
            stat.innerText = ""; 
        } else { 
            stat.innerText = r.message; 
        } 
    } catch(e) { 
        stat.innerText = "Hiba!"; 
    } 
}

function dashLogout() { 
    sessionUser = null; 
    sessionRole = null; 
    localStorage.removeItem("activeUser"); 
    localStorage.removeItem("activeRole"); 
    document.getElementById('activeUserBadge').style.display = 'none'; 
    refreshModalActionPanel(); 
}

function checkDashLoginCustom(sel) { 
    if(sel.value === "custom") { 
        sel.style.display = 'none'; 
        document.getElementById('dashLoginNevModal').style.display = 'block'; 
        document.getElementById('dashLoginNevModal').focus(); 
    } else { 
        document.getElementById('dashLoginNevModal').value = sel.value; 
    } 
}

function refreshModalActionPanel() { 
    if(!activeTaskId) return; 
    const task = currentActiveTasks.find(t => t.id === activeTaskId) || globalClosedTasks.find(t => t.id === activeTaskId); 
    if(!task) return; 
    if (sessionUser) { 
        document.getElementById('dashLoginFormModal').style.display = 'none'; 
        if (task.statusz !== "Lezárt") { 
            document.getElementById('dashTaskActions').style.display = 'block'; 
            const btnStart = document.getElementById('btnDashStart'); 
            if(task.statusz === "Folyamatban") btnStart.style.display = 'none'; else btnStart.style.display = 'block'; 
        } else { 
            document.getElementById('dashTaskActions').style.display = 'none'; 
        } 
    } else { 
        document.getElementById('dashLoginFormModal').style.display = 'block'; 
        document.getElementById('dashTaskActions').style.display = 'none'; 
    } 
}

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
    
    const alkContainer = document.getElementById('alkatreszekContainer');
    if(alkContainer) {
        alkContainer.innerHTML = `
            <div class="alkatresz-sor" style="display:flex; gap:8px; margin-bottom:5px; align-items:center;">
                <div style="flex:3; display:flex; margin:0; border: 1px solid var(--border); border-radius:4px; overflow:hidden;">
                    <input type="text" id="dashAlkCikk_0" class="dash-input alk-cikkszam" placeholder="Cikkszám" style="flex:1; margin:0; font-size:13px; padding:6px; border:none; outline:none; min-width:80px;">
                    <button type="button" onclick="openPartsModal('dashAlkCikk_0')" style="background:var(--pri-obs); color:white; border:none; padding:0 8px; cursor:pointer; font-size:14px; width:36px; display:flex; align-items:center; justify-content:center;">🔍</button>
                </div>
                <input type="number" class="dash-input alk-db" placeholder="Db" style="flex:1; margin:0; font-size:13px; padding:6px; min-width:40px;">
            </div>
        `;
    }

    refreshModalActionPanel(); 
    document.getElementById('taskModal').style.display = "flex"; 
    if(sessionUser) extendSession(); 
}

function closeModal(force = false) { 
    if(force === true || event.target.id === 'taskModal') { 
        document.getElementById('taskModal').style.display = "none"; 
        activeTaskId = null; 
    } 
    if(sessionUser) extendSession(); 
}

async function dashStartTask() { 
    if(!sessionUser || !activeTaskId) return; 
    document.getElementById('btnDashStart').innerText = "Feldolgozás..."; 
    await fetch(SCRIPT_URL, { 
        method: "POST", 
        body: JSON.stringify({ action: "startTask", id: activeTaskId, felhasznalo: sessionUser }) 
    }); 
    fetchDashboardData(); 
    closeModal(true); 
}

async function dashCloseTask() { 
    if(!sessionUser || !activeTaskId) return; 
    const m = document.getElementById(`dashMegoldas`).value;
    const i = document.getElementById(`dashIdo`).value;
    const dt = document.getElementById(`dashDowntime`).value; 

    let alkatreszekTomb = [];
    document.querySelectorAll('.alkatresz-sor').forEach(sor => {
        let cz = sor.querySelector('.alk-cikkszam').value.trim();
        let db = sor.querySelector('.alk-db').value.trim();
        if(cz && db) {
            alkatreszekTomb.push({ cikkszam: cz, db: parseInt(db) || 1 });
        }
    });

    if(!m) return alert("A Megoldás mező kitöltése kötelező!"); 
    
    await fetch(SCRIPT_URL, { 
        method: "POST", 
        body: JSON.stringify({ 
            action: "closeTask", 
            id: activeTaskId, 
            megoldas: m, 
            ido: i, 
            downtime: dt, 
            lezarta: sessionUser,
            alkatreszek: alkatreszekTomb
        }) 
    }); 
    fetchDashboardData(); 
    closeModal(true); 
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