const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbziABd0I2cSep7TveoNoaQZkI5FzxYl4suqSfCR2rD8MXJQNMHPiygbTD8MK0T3Qz40/exec";

const gepAdatbazis = {
    "Production - Line 1": [ "Conv - Szállítástechnika", "Schenck - Szelepszerelő robot", "TPMS1 - Screwing Station Manual - Atlas Copco", "RMS1 - Tire assembly - Hofmann", "RMM1 - Matching machine - Hofmann", "RFG1 - Tire Inflation - Hofmann", "RSO1 - Bead Seat Optimizer - Hofmann", "RGM1 - Tire Uniformity - Hofmann", "AWS1 - Balancing - Hofmann", "WC1 - Weight cutter - Rameckers", "AGS1 - Weight applicator - KUKA" ],
    "Production - Line 2": [ "Conv - Szállítástechnika", "WGS2 - Wheel gauging - IEF Werner", "RMS2 - Tire assembly - Hofmann", "RFG2 - Tire Inflation - Hofmann", "AWS2 - Balancing - Hofmann", "WC2 - Weight cutter - Rameckers", "AGS2 - Weight applicator - KUKA", "AWSK1 - Control Balancing - Hofmann", "TPMS writing /reading - ATEQ", "EOL1 - End of Line control - Mabri Vision" ],
    "Production - Egyedi gépek": [ "MTAM1 - Manual tyre assembly machine - Hofmann", "CUT1 - Bandage Cutting Machine - Cyklop", "HP1 - Hydraulic Press - Strautmann" ],
    "Magasraktár - High Bay System": [ "RBG 1 - Beewen", "RBG 2 - Beewen", "RBG 3 - Beewen", "Conveyors - Blume/Thepas" ],
    "Palettázó B&O": [ "Szekventáló robot - B&O" ],
    "Q-Area": [ "TLIT - Tire leak inspection tank - Corghi", "MTAM2 - Manual tyre assembly machine - Aikido" ],
    "Facility": [ "Épülettel kapcsolatos dolgok" ],
    "IT": [ "Szerverek", "Hálózati eszközök (Switch/AP)", "Kliens gépek (PC/Laptop)", "Nyomtatók és szkennerek", "Szoftver és rendszerek", "FacilityIT eszköz" ],
    "Compressors": [ "DRAIN - Drain Water Separator - Boge", "COMP1 - Compressor 1 - Boge", "DRY1 - Air Dryer 1 - Beko", "COMP2 - Compressor 2 - Boge", "DRY2 - Air Dryer 2 - Beko", "COMP3 - Compressor 3 - Boge" ],
    "Aggregátor": [] 
};

const huHolidays = ["2026-01-01", "2026-03-15", "2026-04-03", "2026-04-06", "2026-05-01", "2026-05-25", "2026-08-20", "2026-10-23", "2026-11-01", "2026-12-24", "2026-12-25", "2026-12-26"];
const huWorkWeekends = ["2026-08-08", "2026-12-12"];

const REFRESH_INTERVAL_SEC = 120; 
let timer = REFRESH_INTERVAL_SEC;
let currentActiveTasks = [];
let globalClosedTasks = [];
let globalSchedule = [];
let globalShiftLogs = [];
let globalBaseWorkers = [];
let globalExtraWorkers = [];
let expectedApprovers = [];
let activeFilter = null; 
let autoResetTimeout = null;

let optSound = false;
let optFlash = true; // Villogás alapértelmezetten BE
let audioCtx = null;
let isAlarming = false;
let knownAdHocIds = new Set();
let isFirstLoad = true;
let sessionUser = null;
let sessionRole = null;
let activeTaskId = null; 

let globalPartsList = [];
let targetPartInputId = null;

window.onload = function() {
    const szuroKatSelect = document.getElementById('szuroKategoria');
    if(szuroKatSelect) { for (let kat in gepAdatbazis) { szuroKatSelect.add(new Option(kat, kat)); } }
    loadUserList();
    const savedUser = localStorage.getItem("activeUser");
    if(savedUser) { sessionUser = savedUser; sessionRole = localStorage.getItem("activeRole"); extendSession(); }
    
    if(optFlash) document.getElementById('btnToggleFlash').classList.add('active-flash');

    fetchDashboardData();
    fetchPartsList(); 
}

// --- ÚJ RÉSZLETES Kereső (Dashboardhoz) ---
async function fetchPartsList() {
    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getPartsList" }) });
        const r = await res.json();
        if(r.status === "success") {
            globalPartsList = r.data || [];
            if(document.getElementById('partsListContainer')) {
                document.getElementById('partsListContainer').innerHTML = "<div style='padding:10px; text-align:center; color:var(--text-muted);'>Alkatrészek sikeresen betöltve. Kezdj el gépelni a kereséshez!</div>";
            }
        }
    } catch(e) { console.error("Hiba az alkatrészlista betöltésekor", e); }
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
// --- VÉGE AZ ALKATRÉSZ KERESŐNEK ---

function isWorkDay(dObj) {
    let dStr = toLocalISOString(dObj);
    if (huWorkWeekends.includes(dStr)) return true; 
    if (huHolidays.includes(dStr)) return false;    
    let day = dObj.getDay(); return day !== 0 && day !== 6;                  
}

function switchDashTab(tabId) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.dash-nav button').forEach(b => b.classList.remove('active'));
    if(tabId === 'nyitott') { document.getElementById('view-nyitott').classList.add('active'); document.getElementById('tabNyitott').classList.add('active'); } 
    else if (tabId === 'lezart') { document.getElementById('view-lezart').classList.add('active'); document.getElementById('tabLezart').classList.add('active'); renderClosedTasks(); } 
    else if (tabId === 'beosztas') { document.getElementById('view-beosztas').classList.add('active'); document.getElementById('tabBeosztas').classList.add('active'); renderScheduleDash(); }
}

function frissitSzuroGepek() { 
    const k = document.getElementById('szuroKategoria').value; const s = document.getElementById('szuroGep'); 
    s.innerHTML = '<option value="">Összes gép...</option>'; 
    if (k && gepAdatbazis[k]) { 
        if (gepAdatbazis[k].length === 0) { s.add(new Option("Nincs alegység", "-")); } 
        else { s.add(new Option("— Teljes sor / Általános —", "-")); gepAdatbazis[k].forEach(g => s.add(new Option(g, g))); } 
    } renderClosedTasks(); 
}

async function loadUserList() {
    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getUsers" }) }); const r = await res.json();
        if (r.status === "success" && r.data.length > 0) {
            const sel = document.getElementById('dashLoginNevSelect');
            sel.innerHTML = '<option value="">Válassz a listából...</option>';
            r.data.forEach(user => sel.add(new Option(user, user)));
            sel.add(new Option("--- Facility(kézi megadás) ---", "custom"));
        } else {
            document.getElementById('dashLoginNevSelect').style.display = 'none';
            document.getElementById('dashLoginNev').style.display = 'block';
        }
    } catch(e) { document.getElementById('dashLoginNevSelect').style.display = 'none'; document.getElementById('dashLoginNev').style.display = 'block'; }
}

function checkDashLoginCustom(sel) {
    if(sel.value === "custom") { sel.style.display = 'none'; document.getElementById('dashLoginNev').style.display = 'block'; document.getElementById('dashLoginNev').focus(); } 
    else { document.getElementById('dashLoginNev').value = sel.value; }
}

// CSAK IKONOK!
function toggleSound() {
    optSound = !optSound; const btn = document.getElementById('btnToggleSound');
    if(optSound) { btn.innerText = "🔊"; btn.classList.add('active-sound'); const AudioContext = window.AudioContext || window.webkitAudioContext; if(AudioContext && !audioCtx) audioCtx = new AudioContext(); if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } 
    else { btn.innerText = "🔇"; btn.classList.remove('active-sound'); }
}

function toggleFlash() {
    optFlash = !optFlash; const btn = document.getElementById('btnToggleFlash');
    if(optFlash) { btn.innerText = "🔴"; btn.classList.add('active-flash'); } 
    else { btn.innerText = "⚪"; btn.classList.remove('active-flash'); document.body.classList.remove('flash-red'); }
}

function triggerAlert() { isAlarming = true; if(optFlash) document.body.classList.add('flash-red'); if(optSound && audioCtx) playAlarmSound(); document.getElementById('ackAlertBtn').style.display = 'block'; }
function stopAlert() { isAlarming = false; document.body.classList.remove('flash-red'); document.getElementById('ackAlertBtn').style.display = 'none'; }
function playAlarmSound() { if (!audioCtx) return; let playBeep = (time) => { const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.connect(gain); gain.connect(audioCtx.destination); osc.type = 'square'; osc.frequency.setValueAtTime(800, audioCtx.currentTime + time); osc.frequency.setValueAtTime(1200, audioCtx.currentTime + time + 0.1); gain.gain.setValueAtTime(0.3, audioCtx.currentTime + time); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + time + 0.5); osc.start(audioCtx.currentTime + time); osc.stop(audioCtx.currentTime + time + 0.5); }; for(let i = 0; i < 10; i++) playBeep(i); }

function toLocalISOString(dateObj) { if(isNaN(dateObj)) return ""; const y = dateObj.getFullYear(), m = String(dateObj.getMonth() + 1).padStart(2, '0'), d = String(dateObj.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }
async function hashPassword(p) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p)); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''); }

setInterval(() => { document.getElementById('clockDisplay').innerText = new Date().toLocaleTimeString('hu-HU'); }, 1000);
setInterval(() => { timer--; if (timer <= 0) { timer = REFRESH_INTERVAL_SEC; fetchDashboardData(); } document.getElementById('countdownDisplay').innerText = timer; document.getElementById('progressBar').style.width = (((REFRESH_INTERVAL_SEC - timer) / REFRESH_INTERVAL_SEC) * 100) + "%"; }, 1000);

function updateShiftAlertBanner() {
    let alertHtml = "";
    let now = new Date();
    let todayStr = toLocalISOString(now);
    let h = now.getHours();
    
    if (now.getDay() >= 1 && now.getDay() <= 5) {
        let upcomingWarning = "";
        if (h === 13) {
            let hasLog = globalShiftLogs.some(l => {
                let logD = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10);
                return logD === todayStr && String(l.muszak).includes("Délelőtt");
            });
            if (!hasLog) upcomingWarning = "⏰ FIGYELEM! Egy óra múlva vége a délelőtti műszaknak! Ne felejtsd el megírni a műszaknaplót!";
        } else if (h === 21) {
            let hasLog = globalShiftLogs.some(l => {
                let logD = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10);
                return logD === todayStr && String(l.muszak).includes("Délután");
            });
            if (!hasLog) upcomingWarning = "⏰ FIGYELEM! Egy óra múlva vége a délutáni műszaknak! Ne felejtsd el megírni a műszaknaplót!";
        }

        if (upcomingWarning) {
            alertHtml += `<div style="background:var(--pri-high); color:var(--surface); padding:10px 15px; border-radius:6px; font-size:16px; font-weight:bold; box-shadow:0 0 15px rgba(245, 158, 11,0.8); margin-bottom:15px; text-align:center; animation: blink 1.5s infinite;">${upcomingWarning}</div>`;
        }
    }
    
    let bannerDiv = document.getElementById('shiftAlertBanner');
    if(bannerDiv) bannerDiv.innerHTML = alertHtml;
}

async function fetchDashboardData() {
    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getAllData", reszleg: "dashboard" }) });
        const result = await res.json();
        if(result.status === "success") { 
            globalSchedule = result.data.schedule || [];
            globalBaseWorkers = result.data.baseWorkers || [];
            globalExtraWorkers = result.data.extraWorkers || [];
            globalShiftLogs = result.data.shiftLogs || [];
            expectedApprovers = result.data.expectedApprovers || [];
            
            checkMissingShiftLogsAndApprovals();
            processData(result.data.tasks); 
            
            if(document.getElementById('view-beosztas').classList.contains('active')) renderScheduleDash();
            if(document.getElementById('view-lezart').classList.contains('active')) renderClosedTasks();
        } 
    } catch (e) { console.error("Hiba:", e); }
}

function checkMissingShiftLogsAndApprovals() {
    let missingLogs = [];
    let startD = new Date(2026, 8, 1, 0, 0, 0); 
    let now = new Date();
    let curr = new Date(startD);
    let alertHtml = "";

    updateShiftAlertBanner();
    
    while (curr <= now) {
        let day = curr.getDay();
        if (day >= 1 && day <= 5) {
            let dStr = toLocalISOString(curr);
            let shift1End = new Date(curr); shift1End.setHours(14,0,0,0);
            if (now >= shift1End) {
                if (!globalShiftLogs.some(l => { let logD = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10); return logD === dStr && String(l.muszak).includes("Délelőtt"); })) {
                    missingLogs.push(`${dStr} Délelőtt`);
                }
            }
            let shift2End = new Date(curr); shift2End.setHours(22,0,0,0);
            if (now >= shift2End) {
                if (!globalShiftLogs.some(l => { let logD = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10); return logD === dStr && String(l.muszak).includes("Délután"); })) {
                    missingLogs.push(`${dStr} Délután`);
                }
            }
        }
        curr.setDate(curr.getDate() + 1); curr.setHours(0,0,0,0);
    }

    let pendingLogUsers = new Set();
    let expectedApproversClean = expectedApprovers.map(a => String(a).toLowerCase().trim());

    globalShiftLogs.forEach(l => {
        let logD = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10);
        if (logD >= "2026-09-01") { 
            let szamonKerheto = false;
            let logDateObj = new Date(logD + "T00:00:00");
            let muszakVégeH = 0;
            if(String(l.muszak).includes("Délelőtt")) muszakVégeH = 14;
            else if(String(l.muszak).includes("Délután")) muszakVégeH = 22;
            else if(String(l.muszak).includes("Éjszaka")) muszakVégeH = 6; 
            
            let vegeIdopont = new Date(logDateObj);
            if (muszakVégeH === 6) vegeIdopont.setDate(vegeIdopont.getDate() + 1);
            vegeIdopont.setHours(muszakVégeH, 0, 0, 0);

            if (now >= vegeIdopont) { szamonKerheto = true; }

            if (szamonKerheto && !l.hianyzo) {
                let approvers = l.jovahagyok ? String(l.jovahagyok).split(",").map(x=>x.trim()).filter(x=>x) : [];
                let approversLower = approvers.map(x=>x.toLowerCase());
                
                let expectedForThisLog = expectedApproversClean.filter(a => {
                    let sched = globalSchedule.find(s => s.datum === logD && s.user.toLowerCase() === a);
                    if (sched && sched.tipus.includes('Szabadság')) return false; return true;
                });

                let missing = expectedForThisLog.filter(a => !approversLower.includes(a));
                missing.forEach(u => pendingLogUsers.add(u));
            }
        }
    });

    if (pendingLogUsers.size > 0) {
        // Mivel az expectedApprovers a dashboard backend ágán eleve csak a karbantartókat tartalmazza
        let maintMissing = Array.from(pendingLogUsers).filter(u => expectedApproversClean.includes(u));
        if (maintMissing.length > 0) {
            let displayNames = maintMissing.map(u => expectedApprovers.find(ea => String(ea).toLowerCase().trim() === u) || u);
            alertHtml += `<div style="background:var(--pri-high); color:var(--surface); padding:8px 15px; border-radius:6px; font-size:14px; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.3); margin-bottom:10px;">⚠️ Műszaknapló jóváhagyás hiányzik a következő karbantartóktól: ${displayNames.join(', ')}</div>`;
        }
    }

    if (missingLogs.length > 0) {
        alertHtml += `<div style="background:var(--pri-crit); color:white; padding:15px 15px; border-radius:6px; font-size:18px; font-weight:bold; box-shadow:0 0 15px rgba(239, 68, 68, 0.8); margin-bottom:10px; border:2px solid white; text-align:center; animation: flashRedAnim 1s infinite;">🚨 PÓTOLD A MŰSZAKNAPLÓT: ${missingLogs.join(', ')}</div>`;
    }

    const alertDiv = document.getElementById('shiftAlertBanner');
    if (alertDiv) {
        let origHtml = alertDiv.innerHTML;
        if(origHtml.includes('Egy óra múlva vége')) { alertHtml = origHtml + alertHtml; }
        alertDiv.innerHTML = alertHtml;
    }
}

function processData(allTasks) {
    currentActiveTasks = [];
    globalClosedTasks = [];
    let hasNewAdHoc = false;
    let cCrit = 0, cHigh = 0, cProg = 0, cInfo = 0;

    allTasks.forEach(t => {
        let isPrev = String(t.id).startsWith("PREV-") || String(t.id).includes("REC-");
        if (isPrev && String(t.id).toUpperCase().includes("PROD")) return;

        if(t.prioritas === "Igen") t.prioritas = "Magas prioritás";
        if(t.prioritas === "Nem") t.prioritas = "Normál";
        
        if(t.statusz !== "Lezárt") {
            currentActiveTasks.push(t);
            const pLower = String(t.prioritas).toLowerCase();
            if(pLower.includes("leállás")) cCrit++;
            if(pLower.includes("magas")) cHigh++;
            if(t.statusz === "Folyamatban") cProg++;
            if(pLower.includes("informatív") || pLower.includes("megfigyelés")) cInfo++;
            
            if(String(t.id).startsWith("KB-")) {
                if(!isFirstLoad && !knownAdHocIds.has(t.id)) hasNewAdHoc = true;
                knownAdHocIds.add(t.id);
            }
        } else {
            globalClosedTasks.push(t);
        }
    });

    if (hasNewAdHoc && !isAlarming) triggerAlert();
    isFirstLoad = false;

    document.getElementById('kpiCrit').innerText = cCrit; 
    document.getElementById('kpiHigh').innerText = cHigh;
    document.getElementById('kpiProg').innerText = cProg; 
    document.getElementById('kpiInfo').innerText = cInfo; 
    document.getElementById('kpiTotal').innerText = currentActiveTasks.length - cInfo;

    renderGrid(currentActiveTasks);
}

function getFilteredClosedTasks() {
    const srEl = document.getElementById('szuroReszleg'); const sr = srEl ? srEl.value : "";
    const skEl = document.getElementById('szuroKategoria'), sgEl = document.getElementById('szuroGep'), stEl = document.getElementById('filterDatumTol'), siEl = document.getElementById('filterDatumIg');
    const sk = skEl ? skEl.value : "", sg = sgEl ? sgEl.value : "", st = stEl ? stEl.value : "", si = siEl ? siEl.value : "";
    const szovEl = document.getElementById('szuroLezartSzoveg'); const szov = szovEl ? szovEl.value.toLowerCase() : "";

    return globalClosedTasks.filter(t => { 
        let matchReszleg = true;
        if(sr === "termeles") matchReszleg = String(t.id).includes("PROD-");
        else if(sr === "karbantartas") matchReszleg = !String(t.id).includes("PROD-");

        const d = String(t.idopont || "").substring(0, 10); let gepNev = (sg === "-") ? sk : sk + " - " + sg;
        let matchKat = sk ? (String(t.gep || "").startsWith(sk+" - ") || t.gep===sk) : true; let matchGep = sg ? t.gep===gepNev : true; let matchTol = st ? d>=st : true; let matchIg = si ? d<=si : true;
        let matchSzoveg = szov ? (String(t.hiba).toLowerCase().includes(szov) || String(t.megoldas).toLowerCase().includes(szov) || String(t.gep).toLowerCase().includes(szov) || String(t.felhasznalo).toLowerCase().includes(szov)) : true;

        return matchReszleg && matchKat && matchGep && matchTol && matchIg && matchSzoveg; 
    });
}

function renderClosedTasks() {
    const f = getFilteredClosedTasks(); const c = document.getElementById('closedTaskGrid'); if(!c) return;
    if(f.length===0){c.innerHTML="<div style='grid-column:1/-1; text-align:center;'>Nincs a keresésnek megfelelő lezárt feladat.</div>"; return;} 
    let h = ""; f.forEach(t => h += generateCardHtml(t)); c.innerHTML = h;
}

function renderScheduleDash() {
    const c = document.getElementById('dashScheduleContainer');
    let uniqueUsers = new Set([...globalBaseWorkers, ...globalExtraWorkers]);
    uniqueUsers.delete('__UGYELET__'); 
    let allUsers = Array.from(uniqueUsers).sort();
    
    if(allUsers.length === 0) { c.innerHTML = "<div style='text-align:center; padding:30px; color:var(--text-muted);'>Nincs elérhető beosztás adat.</div>"; return; }

    let expectedApproversClean = expectedApprovers.map(a => String(a).toLowerCase().trim());
    
    let maintUsers = allUsers.filter(u => expectedApproversClean.includes(u.toLowerCase()));
    let prodUsers = allUsers.filter(u => !expectedApproversClean.includes(u.toLowerCase()));

    let now = new Date();
    let dayOfWeek = now.getDay() || 7;
    let startDate = new Date(now);
    startDate.setDate(now.getDate() - dayOfWeek + 1 - 7); 
    
    let dates = [];
    for(let i=0; i<21; i++){ let d = new Date(startDate); d.setDate(startDate.getDate() + i); dates.push(d); }
    
    let html = `<table class="sched-table"><thead><tr><th class="sticky-col" style="min-width:160px;">Név / Dátum</th>`;
    dates.forEach(d => {
        let isWorking = isWorkDay(d);
        let bg = !isWorking ? 'background:rgba(255,255,255,0.05); color:#94a3b8;' : '';
        let dStr = d.toLocaleDateString('hu-HU', {month:'short', day:'numeric'});
        let isToday = (toLocalISOString(d) === toLocalISOString(now));
        if(isToday) bg += 'border-bottom:3px solid var(--pri-high); color:var(--pri-high); font-weight:bold;';
        html += `<th style="${bg}">${dStr}</th>`;
    });
    html += `</tr></thead><tbody>`;

    // 1. ÜGYELET
    html += `<tr><td class="sticky-col" style="color:var(--pri-crit);">📞 Ügyeletes</td>`;
    dates.forEach(d => {
        let isWorking = isWorkDay(d);
        let bg = !isWorking ? 'background:rgba(255,255,255,0.05);' : '';
        let dIso = toLocalISOString(d);
        let match = globalSchedule.find(s => s.datum === dIso && s.user === '__UGYELET__');
        html += `<td class="${match ? 'cell-ugy' : ''}" style="${bg}">${match ? match.tipus : ''}</td>`;
    });
    html += `</tr>`;
    
    // 2. KARBANTARTÁS
    if(maintUsers.length > 0) {
        html += `<tr><td colspan="22" style="background:#0f172a; color:var(--pri-info); font-weight:bold; padding:8px 15px; border-bottom:1px solid var(--border);">🔧 Karbantartás</td></tr>`;
        maintUsers.forEach(u => {
            html += `<tr><td class="sticky-col">${u}</td>`;
            dates.forEach(d => {
                let isWorking = isWorkDay(d);
                let bg = !isWorking ? 'background:rgba(255,255,255,0.05);' : '';
                let dIso = toLocalISOString(d);
                let match = globalSchedule.find(s => s.datum === dIso && s.user === u);
                let tipus = match ? match.tipus : ''; let cls = ''; let text = '';
                if(tipus === 'Délelőtt') { cls = 'cell-MS'; text = 'Délelőtt'; }
                else if(tipus === 'Délután') { cls = 'cell-AS'; text = 'Délután'; }
                else if(tipus === 'Éjszaka') { cls = 'cell-NS'; text = 'Éjszaka'; }
                else if(tipus === 'Szabadság') { cls = 'cell-H'; text = 'Szabadság'; }
                else if(tipus === 'Nappal' || tipus === 'Nappali' || tipus === 'Pihenő') { cls = 'cell-O'; text = 'Nappal'; }
                html += `<td class="${cls}" style="${bg}">${text}</td>`;
            });
            html += `</tr>`;
        });
    }

    // 3. TERMELÉS
    if(prodUsers.length > 0) {
        html += `<tr><td colspan="22" style="background:#0f172a; color:var(--pri-high); font-weight:bold; padding:8px 15px; border-bottom:1px solid var(--border); border-top:2px solid var(--border);">🏭 Termelés</td></tr>`;
        prodUsers.forEach(u => {
            html += `<tr><td class="sticky-col">${u}</td>`;
            dates.forEach(d => {
                let isWorking = isWorkDay(d);
                let bg = !isWorking ? 'background:rgba(255,255,255,0.05);' : '';
                let dIso = toLocalISOString(d);
                let match = globalSchedule.find(s => s.datum === dIso && s.user === u);
                let tipus = match ? match.tipus : ''; let cls = ''; let text = '';
                if(tipus === 'Délelőtt') { cls = 'cell-MS'; text = 'Délelőtt'; }
                else if(tipus === 'Délután') { cls = 'cell-AS'; text = 'Délután'; }
                else if(tipus === 'Éjszaka') { cls = 'cell-NS'; text = 'Éjszaka'; }
                else if(tipus === 'Szabadság') { cls = 'cell-H'; text = 'Szabadság'; }
                else if(tipus === 'Nappal' || tipus === 'Nappali' || tipus === 'Pihenő') { cls = 'cell-O'; text = 'Nappal'; }
                html += `<td class="${cls}" style="${bg}">${text}</td>`;
            });
            html += `</tr>`;
        });
    }

    html += `</tbody></table>`;
    c.innerHTML = html;
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
    let filteredTasks = renderTasks;
    
    if (activeFilter === 'Crit') filteredTasks = renderTasks.filter(t => String(t.prioritas).toLowerCase().includes("leállás"));
    else if (activeFilter === 'High') filteredTasks = renderTasks.filter(t => String(t.prioritas).toLowerCase().includes("magas"));
    else if (activeFilter === 'Prog') filteredTasks = renderTasks.filter(t => t.statusz === "Folyamatban");
    else if (activeFilter === 'Info') filteredTasks = renderTasks.filter(t => String(t.prioritas).toLowerCase().includes("informatív") || String(t.prioritas).toLowerCase().includes("megfigyelés"));
    else if (activeFilter === null) filteredTasks = renderTasks.filter(t => !String(t.prioritas).toLowerCase().includes("informatív") && !String(t.prioritas).toLowerCase().includes("megfigyelés"));

    if (filteredTasks.length === 0) { grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; margin-top: 100px;"><div style="font-size: 60px; margin-bottom: 20px;">🎉</div><h2 style="color: var(--pri-normal);">Nincs aktív feladat ebben a nézetben.</h2></div>`; return; }

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
    normalTasks.sort(sorter); prevTasks.sort(sorter);

    let html = "";
    if (normalTasks.length > 0) {
        if(prevTasks.length > 0) html += `<div class="section-title">🚨 Aktuális Hibák és Feladatok</div>`;
        normalTasks.forEach(task => { html += generateCardHtml(task); });
    }
    if (prevTasks.length > 0) {
        html += `<div class="section-title" style="margin-top:40px; color: var(--pri-info); border-color: var(--pri-info);">🔁 Tervezett Karbantartások</div>`;
        prevTasks.forEach(task => { html += generateCardHtml(task); });
    }
    grid.innerHTML = html;
}

function generateCardHtml(t) {
    const timeStr = new Date(t.idopont).toLocaleTimeString('hu-HU', {hour: '2-digit', minute:'2-digit'});
    const dateStr = new Date(t.idopont).toLocaleDateString('hu-HU', {month:'short', day:'numeric'});
    const pr = String(t.prioritas).replace(" prioritás", "").replace("ással járó", "");
    
    let bC = "badge-normal", eC = "";
    const pLower = String(t.prioritas).toLowerCase();

    if(t.statusz==="Lezárt") { bC="badge-closed"; eC="closed"; } 
    else {
        if(pLower.includes("leállás")) {bC="badge-crit"; eC="Termelésleállás";} 
        else if(pLower.includes("magas")) {bC="badge-high"; eC="Magas";} 
        else if(pLower.includes("megfigyelés")) {bC="badge-obs"; eC="Megfigyelés";} 
        else if(pLower.includes("informatív")) {bC="badge-info"; eC="Informatív";}
        if(t.statusz==="Folyamatban") eC="Folyamatban"; 
    }

    let inP = t.statusz === "Folyamatban" ? `<div class="in-progress-bar"><span>⚙️</span> <b>${t.felelos}</b> éppen dolgozik rajta</div>` : "";
    let prevIcon = (String(t.id).startsWith("PREV-") || String(t.id).includes("REC-")) ? "🔁 " : "";
    let reszlegIcon = String(t.id).includes("PROD-") ? "🏭 " : "🔧 ";

    if (t.statusz !== "Lezárt") {
        return `
        <div class="card ${eC}" onclick="openModal('${t.id}')">
            <div class="card-header"><span class="badge ${bC}">${pr}</span><span style="color: var(--text-muted); font-size: 13px; font-weight:bold;">${dateStr} - ${timeStr}</span></div>
            <div class="machine-name">${reszlegIcon}${prevIcon}${t.gep}</div>
            ${inP}
            <div class="issue-desc" style="white-space:pre-wrap;">${t.hiba}</div>
            <div class="meta-footer"><div>Beküldte: <b>${t.felhasznalo}</b></div><div style="color: var(--text-muted); font-size:11px;">Részletek / Kezelés 👆</div></div>
        </div>`;
    } else {
        let dtTxt = t.downtime ? ` (Kiesés: ${t.downtime} perc)` : "";
        return `
        <div class="card closed" onclick="openModal('${t.id}')">
            <div class="card-header"><span class="badge badge-closed">Lezárt</span><span style="color: var(--text-muted); font-size: 13px; font-weight:bold;">${dateStr} - ${timeStr}</span></div>
            <div class="machine-name">${reszlegIcon}${prevIcon}${t.gep}</div>
            <div class="issue-desc" style="white-space:pre-wrap;">${t.hiba}</div>
            <div style="margin-bottom:10px; color:var(--pri-normal);"><b>Megoldás:</b><br>${String(t.megoldas||"").replace(/\n/g, '<br>')} <span style="color:var(--text-muted);">(${t.ido||0} perc${dtTxt})</span></div>
            <div class="meta-footer"><div>Beküldte: <b>${t.felhasznalo}</b></div><div style="color: var(--text-muted); font-size:11px;">Részletek 👆</div></div>
        </div>`;
    }
}

function extendSession() {
    if(sessionUser) {
        document.getElementById('activeUserBadge').style.display = 'flex';
        document.getElementById('dashUserName').innerText = sessionUser;
        refreshModalActionPanel();
        populateNavDropdown();
    }
}

async function dashLogin() {
    const n = document.getElementById('dashLoginNev').value || document.getElementById('dashLoginNevSelect').value;
    const j = document.getElementById('dashLoginPin').value;
    const stat = document.getElementById('dashLoginStatus'); stat.innerText = "Ellenőrzés...";
    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "login", nev: n, jelszo: await hashPassword(j) }) }); 
        const r = await res.json();
        if(r.status === "success") { 
            sessionUser = n; 
            sessionRole = r.role || "production";
            extendSession();
            document.getElementById('dashLoginNev').value = ""; document.getElementById('dashLoginPin').value = "";
            stat.innerText = "";
        } else { stat.innerText = r.message; }
    } catch(e) { stat.innerText = "Hálózati hiba!"; }
}

function dashLogout() { 
    sessionUser = null; 
    sessionRole = null; 
    localStorage.removeItem("activeUser"); 
    localStorage.removeItem("activeRole"); 
    
    document.getElementById('activeUserBadge').style.display = 'none'; 
    refreshModalActionPanel(); 
}

function refreshModalActionPanel() {
    if(!activeTaskId) return;
    const task = currentActiveTasks.find(t => t.id === activeTaskId) || globalClosedTasks.find(t => t.id === activeTaskId);
    if(!task) return;

    if (sessionUser) {
        document.getElementById('dashLoginForm').style.display = 'none';
        if (task.statusz !== "Lezárt") {
            document.getElementById('dashTaskActions').style.display = 'block';
            const btnStart = document.getElementById('btnDashStart');
            if(task.statusz === "Folyamatban") btnStart.style.display = 'none'; else btnStart.style.display = 'block';
        } else {
            document.getElementById('dashTaskActions').style.display = 'none';
        }
    } else {
        document.getElementById('dashLoginForm').style.display = 'block';
        document.getElementById('dashTaskActions').style.display = 'none';
    }
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
    fetchDashboardData(); closeModal(true); 
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