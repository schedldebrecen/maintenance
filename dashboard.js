const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbziABd0I2cSep7TveoNoaQZkI5FzxYl4suqSfCR2rD8MXJQNMHPiygbTD8MK0T3Qz40/exec";
const RESZLEG = "dashboard";

let currentActiveTasks = []; 
let globalClosedTasks = []; 
let globalShiftLogs = []; 
let expectedApprovers = []; 
let globalSchedule = [];
let REFRESH_INTERVAL_SEC = 300; 
let timer = REFRESH_INTERVAL_SEC; 
let sessionUser = null; 
let sessionRole = null; 
let optSound = false; 
let optFlash = false; 
let audioCtx = null; 
let isAlarming = false; 
let knownAdHocIds = new Set(); 
let isFirstLoad = true;

window.onload = function() {
    loadUserList(); 
    const savedUser = localStorage.getItem("activeUser"); 
    if(savedUser) { 
        sessionUser = savedUser; 
        sessionRole = localStorage.getItem("activeRole"); 
        extendSession(); 
    } 
    populateNavDropdown();
    fetchDashboardData();
}

async function loadUserList() { 
    try { 
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getUsers" }) }); 
        const r = await res.json(); 
        if (r.status === "success" && r.data.length > 0) { 
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

setInterval(() => { document.getElementById('clockDisplay').innerText = new Date().toLocaleTimeString('hu-HU'); }, 1000);
setInterval(() => { 
    timer--; 
    if (timer <= 0) { timer = REFRESH_INTERVAL_SEC; fetchDashboardData(); } 
    document.getElementById('countdownDisplay').innerText = timer; 
    document.getElementById('progressBar').style.width = (((REFRESH_INTERVAL_SEC - timer) / REFRESH_INTERVAL_SEC) * 100) + "%"; 
}, 1000);

async function fetchDashboardData() {
    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getAllData", reszleg: RESZLEG }) }); 
        const result = await res.json();
        if(result.status === "success") { 
            globalShiftLogs = result.data.shiftLogs || [];
            expectedApprovers = result.data.expectedApprovers || [];
            globalSchedule = result.data.schedule || [];
            processData(result.data.tasks); 
            checkMissingShiftLogsAndApprovals();
        } 
    } catch (e) { console.error(e); }
}

function checkMissingShiftLogsAndApprovals() {
    let missingLogs = [];
    let pendingLogUsers = new Set();
    let expectedApproversClean = expectedApprovers.map(a => String(a).toLowerCase().trim());
    let now = new Date();

    globalShiftLogs.forEach(l => {
        if (l.hianyzo) {
            missingLogs.push(`${l.datum} ${l.muszak}`);
        } else {
            let logD = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10);
            if (logD >= "2026-09-01") { 
                let szamonKerheto = false;
                let logDateObj = new Date(logD + "T00:00:00");
                let muszakVegeH = 0;
                if(String(l.muszak).includes("Délelőtt")) muszakVegeH = 14;
                else if(String(l.muszak).includes("Délután")) muszakVegeH = 22;
                else if(String(l.muszak).includes("Éjszaka")) muszakVegeH = 6; 
                
                let vegeIdopont = new Date(logDateObj);
                if (muszakVegeH === 6) vegeIdopont.setDate(vegeIdopont.getDate() + 1);
                vegeIdopont.setHours(muszakVegeH, 0, 0, 0);

                if (now >= vegeIdopont) { szamonKerheto = true; }

                if (szamonKerheto) {
                    let approvers = l.jovahagyok ? String(l.jovahagyok).split(",").map(x=>x.trim()).filter(x=>x) : [];
                    let approversLower = approvers.map(x=>x.toLowerCase());
                    
                    // Szigorú szűrés: Csak akkor várjuk el a jóváhagyást a karbantartótól, 
                    // ha az adott napon be volt osztva dolgozni (és nem szabadságon volt)
                    let expectedForThisLog = expectedApproversClean.filter(a => {
                        let sched = globalSchedule.find(s => s.datum === logD && String(s.user).toLowerCase().trim() === a && !String(s.tipus).includes("Szabadság"));
                        return sched !== undefined;
                    });
                    
                    let missing = expectedForThisLog.filter(a => !approversLower.includes(a));
                    missing.forEach(u => pendingLogUsers.add(u));
                }
            }
        }
    });

    let alertHtml = "";
    if (pendingLogUsers.size > 0) {
        let displayNames = Array.from(pendingLogUsers).map(u => expectedApprovers.find(ea => String(ea).toLowerCase().trim() === u) || u);
        alertHtml += `<div style="background:var(--pri-high); color:var(--surface); padding:8px 15px; border-radius:6px; font-size:14px; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.3); margin-bottom:10px;">⚠️ Műszaknapló jóváhagyás hiányzik a következőktől: ${displayNames.join(', ')}</div>`;
    }

    if (missingLogs.length > 0) {
        alertHtml += `<div style="background:var(--pri-crit); color:white; padding:15px 15px; border-radius:6px; font-size:18px; font-weight:bold; box-shadow:0 0 15px rgba(239, 68, 68, 0.8); margin-bottom:10px; border:2px solid white; text-align:center; animation: flashRedAnim 1s infinite;">🚨 HIÁNYZÓ MŰSZAKNAPLÓK (BEOSZTÁS ALAPJÁN): ${missingLogs.join(', ')}</div>`;
    }

    const alertDiv = document.getElementById('shiftAlertBanner');
    if (alertDiv) {
        alertDiv.innerHTML = alertHtml;
    }
}

function processData(allTasks) {
    currentActiveTasks = []; globalClosedTasks = []; 
    let cCrit = 0, cHigh = 0, cProg = 0, cInfo = 0; let hasNewAdHoc = false;
    allTasks.forEach(t => { 
        let isPrev = String(t.id).startsWith("PREV-") || String(t.id).includes("REC-");
        if(t.prioritas === "Igen") t.prioritas = "Magas prioritás";
        if(t.prioritas === "Nem") t.prioritas = "Normál";

        if(t.statusz !== "Lezárt") {
            if (isPrev && String(t.id).toUpperCase().includes("PROD")) return;
            currentActiveTasks.push(t);
            
            const pLower = String(t.prioritas).toLowerCase();
            if(pLower.includes("leállás")) cCrit++;
            if(pLower.includes("magas")) cHigh++;
            if(t.statusz === "Folyamatban") cProg++;
            if(pLower.includes("informatív") || pLower.includes("megfigyelés")) cInfo++;
            
            if(!String(t.id).startsWith("PREV-") && !String(t.id).includes("REC-") && !pLower.includes("informatív") && !pLower.includes("megfigyelés")) {
                if(!isFirstLoad && !knownAdHocIds.has(t.id)) hasNewAdHoc = true; 
                knownAdHocIds.add(t.id);
            }
        } else {
            if (isPrev && String(t.id).toUpperCase().includes("PROD")) return;
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

let activeFilterPrio = null;
function setDashboardFilter(prio) {
    if (activeFilterPrio === prio) activeFilterPrio = null; else activeFilterPrio = prio;
    document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active-filter'));
    if (activeFilterPrio) document.getElementById('kpiCard-' + prio).classList.add('active-filter'); else document.getElementById('kpiCard-Total').classList.add('active-filter');
    if (!activeFilterPrio) { renderGrid(currentActiveTasks); return; }
    let filtered = currentActiveTasks.filter(t => {
        const pLower = String(t.prioritas).toLowerCase();
        if (activeFilterPrio === 'Crit' && pLower.includes("leállás")) return true;
        if (activeFilterPrio === 'High' && pLower.includes("magas")) return true;
        if (activeFilterPrio === 'Info' && (pLower.includes("informatív") || pLower.includes("megfigyelés"))) return true;
        if (activeFilterPrio === 'Prog' && t.statusz === "Folyamatban") return true;
        return false;
    });
    renderGrid(filtered);
}

function renderGrid(renderTasks) {
    const grid = document.getElementById('taskGrid'); if(!grid) return;
    if (renderTasks.length === 0) { grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; margin-top: 100px;"><div style="font-size: 60px; margin-bottom: 20px;">🎉</div><h2 style="color: var(--pri-normal);">Nincs aktív feladat ebben a nézetben.</h2></div>`; return; }
    let normalTasks = renderTasks.filter(t => !String(t.id).startsWith("PREV-") && !String(t.id).includes("REC-")); let prevTasks = renderTasks.filter(t => String(t.id).startsWith("PREV-") || String(t.id).includes("REC-"));
    const w = { "Termelésleállás": 4, "Magas prioritás": 3, "Normál": 2, "Megfigyelés alatt": 1.5, "Informatív": 1 };
    const sorter = (a, b) => { if (a.statusz === "Folyamatban" && b.statusz !== "Folyamatban") return -1; if (a.statusz !== "Folyamatban" && b.statusz === "Folyamatban") return 1; let pD = (w[String(b.prioritas)] || 0) - (w[String(a.prioritas)] || 0); if (pD !== 0) return pD; return new Date(a.idopont) - new Date(b.idopont); };
    normalTasks.sort(sorter); prevTasks.sort(sorter);
    let html = "";
    if (normalTasks.length > 0) { html += `<div class="section-title">🚨 Aktuális Hibák és Feladatok</div>`; normalTasks.forEach(task => { html += generateCardHtml(task); }); }
    if (prevTasks.length > 0) { html += `<div class="section-title" style="margin-top:40px; color: var(--pri-info); border-color: var(--pri-info);">🔁 Tervezett Karbantartások (Ismétlődő)</div>`; prevTasks.forEach(task => { html += generateCardHtml(task); }); }
    grid.innerHTML = html;
}

function generateCardHtml(t) {
    const timeStr = new Date(t.idopont).toLocaleTimeString('hu-HU', {hour: '2-digit', minute:'2-digit'}); const dateStr = new Date(t.idopont).toLocaleDateString('hu-HU', {month:'short', day:'numeric'});
    let eC = ""; const pLower = String(t.prioritas).toLowerCase(); let bC = "badge-normal";
    const pr = String(t.prioritas).replace(" prioritás", "").replace("ással járó", "");
    
    if(t.statusz==="Lezárt") { eC="closed"; bC="badge-closed"; } else { if(pLower.includes("leállás")) {eC="Termelésleállás"; bC="badge-crit";} else if(pLower.includes("magas")) {eC="Magas"; bC="badge-high";} else if(pLower.includes("megfigyelés")) {eC="Megfigyelés"; bC="badge-obs";} else if(pLower.includes("informatív")) {eC="Informatív"; bC="badge-info";} if(t.statusz==="Folyamatban") eC="Folyamatban"; }
    let inP = t.statusz === "Folyamatban" ? `<div class="in-progress-bar"><span>⚙️</span> <b>${t.felelos}</b> éppen dolgozik rajta</div>` : "";
    let prevIcon = (String(t.id).startsWith("PREV-") || String(t.id).includes("REC-")) ? "🔁 " : ""; let reszlegIcon = String(t.id).includes("PROD-") ? "🏭 " : "🔧 ";
    return `<div class="card ${eC}" onclick="openModal('${t.id}')"><div class="card-header"><span class="badge ${bC}">${pr}</span><span style="color: var(--text-muted); font-size: 13px; font-weight:bold;">${dateStr} - ${timeStr}</span></div><div class="machine-name">${reszlegIcon}${prevIcon}${t.gep}</div>${inP}<div class="issue-desc" style="white-space:pre-wrap;">${t.hiba}</div><div class="meta-footer"><div>Beküldte: <b>${t.felhasznalo}</b></div><div style="color: var(--text-muted); font-size:11px;">Részletek / Kezelés 👆</div></div></div>`;
}

function triggerAlert() { isAlarming = true; if(optFlash) document.body.classList.add('flash-red'); if(optSound && audioCtx) playAlarmSound(); document.getElementById('ackAlertBtn').style.display = 'block'; }
function stopAlert() { isAlarming = false; document.body.classList.remove('flash-red'); document.getElementById('ackAlertBtn').style.display = 'none'; }
function playAlarmSound() { if (!audioCtx) return; let playBeep = (time) => { const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.connect(gain); gain.connect(audioCtx.destination); osc.type = 'square'; osc.frequency.setValueAtTime(800, audioCtx.currentTime + time); osc.frequency.setValueAtTime(1200, audioCtx.currentTime + time + 0.1); gain.gain.setValueAtTime(0.3, audioCtx.currentTime + time); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + time + 0.5); osc.start(audioCtx.currentTime + time); osc.stop(audioCtx.currentTime + time + 0.5); }; for(let i = 0; i < 10; i++) playBeep(i); }
function toggleSound() { optSound = !optSound; const btn = document.getElementById('btnToggleSound'); if(optSound) { btn.innerText = "🔊"; btn.classList.add('active-sound'); const AudioContext = window.AudioContext || window.webkitAudioContext; if(AudioContext && !audioCtx) audioCtx = new AudioContext(); if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } else { btn.innerText = "🔇"; btn.classList.remove('active-sound'); } }
function toggleFlash() { optFlash = !optFlash; const btn = document.getElementById('btnToggleFlash'); if(optFlash) { btn.innerText = "🔴"; btn.classList.add('active-flash'); } else { btn.innerText = "⚪"; btn.classList.remove('active-flash'); document.body.classList.remove('flash-red'); } }

let activeTaskId = null;
function extendSession() { if(sessionUser) { document.getElementById('activeUserBadge').style.display = 'flex'; document.getElementById('dashUserName').innerText = sessionUser; refreshModalActionPanel(); } }

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
        } else { stat.innerText = r.message; } 
    } catch(e) { stat.innerText = "Hiba!"; } 
}

function dashLogout() { 
    sessionUser = null; 
    sessionRole = null; 
    localStorage.removeItem("activeUser"); 
    localStorage.removeItem("activeRole"); 
    document.getElementById('activeUserBadge').style.display = 'none'; 
    window.location.href = window.location.pathname; 
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
    await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "startTask", id: activeTaskId, felhasznalo: sessionUser }) }); 
    fetchDashboardData(); closeModal(true); 
}