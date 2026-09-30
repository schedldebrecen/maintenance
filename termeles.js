const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbziABd0I2cSep7TveoNoaQZkI5FzxYl4suqSfCR2rD8MXJQNMHPiygbTD8MK0T3Qz40/exec";
const RESZLEG = "production";

const gepAdatbazis = { "Production - Line 1": [ "Conv - Szállítástechnika", "Schenck - Szelepszerelő robot", "TPMS1 - Screwing Station Manual - Atlas Copco", "RMS1 - Tire assembly - Hofmann", "RMM1 - Matching machine - Hofmann", "RFG1 - Tire Inflation - Hofmann", "RSO1 - Bead Seat Optimizer - Hofmann", "RGM1 - Tire Uniformity - Hofmann", "AWS1 - Balancing - Hofmann", "WC1 - Weight cutter - Rameckers", "AGS1 - Weight applicator - KUKA" ], "Production - Line 2": [ "Conv - Szállítástechnika", "WGS2 - Wheel gauging - IEF Werner", "RMS2 - Tire assembly - Hofmann", "RFG2 - Tire Inflation - Hofmann", "AWS2 - Balancing - Hofmann", "WC2 - Weight cutter - Rameckers", "AGS2 - Weight applicator - KUKA", "AWSK1 - Control Balancing - Hofmann", "TPMS writing /reading - ATEQ", "EOL1 - End of Line control - Mabri Vision" ], "Production - Egyedi gépek": [ "MTAM1 - Manual tyre assembly machine - Hofmann", "CUT1 - Bandage Cutting Machine - Cyklop", "HP1 - Hydraulic Press - Strautmann" ], "Magasraktár - High Bay System": [ "RBG 1 - Beewen", "RBG 2 - Beewen", "RBG 3 - Beewen", "Conveyors - Blume/Thepas" ], "Palettázó B&O": [ "Szekventáló robot - B&O" ], "Q-Area": [ "TLIT - Tire leak inspection tank - Corghi", "MTAM2 - Manual tyre assembly machine - Aikido" ], "Facility": [ "Épülettel kapcsolatos dolgok" ], "IT": [ "Szerverek", "Hálózati eszközök (Switch/AP)", "Kliens gépek (PC/Laptop)", "Nyomtatók és szkennerek", "Szoftver és rendszerek", "Egyéb IT eszköz" ], "Compressors": [ "DRAIN - Drain Water Separator - Boge", "COMP1 - Compressor 1 - Boge", "DRY1 - Air Dryer 1 - Beko", "COMP2 - Compressor 2 - Boge", "DRY2 - Air Dryer 2 - Beko", "COMP3 - Compressor 3 - Boge" ], "Aggregátor": [] };

let globalShiftLogs = []; let globalSchedule = []; let expectedApprovers = []; let globalChecklistSablon = []; let editClSablonId = null;
let currentActiveTasks = []; let globalClosedTasks = []; let muszakValaszthatoFeladatok = []; let selectedShiftTasks = []; let lockdownSelectedTasks = {};

async function secureFetch(payload) {
    if (payload.action !== "login" && payload.action !== "getUsers") { payload.token = localStorage.getItem("sessionToken"); }
    const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.status === "error" && String(data.message).includes("ACCESS_DENIED")) {
        window.isSessionExpired = true; 
        alert("⏳ A biztonsági munkamenet lejárt!\n\nKérlek, jelentkezz be újra a folytatáshoz. Ne aggódj, az eddig beírt adataid nem vesztek el!");
        document.getElementById('appView').style.display = 'none';
        if(document.getElementById('lockdownScreen')) document.getElementById('lockdownScreen').style.display = 'none';
        document.getElementById('loginView').style.display = 'block';
        throw new Error("ACCESS_DENIED");
    }
    return { json: () => Promise.resolve(data) };
}

function showToast(msg, isError = false) { const t = document.getElementById('toastMessage'); t.style.background = isError ? "var(--pri-crit)" : "var(--pri-normal)"; t.innerHTML = isError ? "❌ " + msg : "✅ " + msg; t.style.display = "block"; setTimeout(() => t.style.opacity = "1", 10); setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.style.display = "none", 300); }, 3000); }

window.addEventListener('DOMContentLoaded', () => {
    const teruletSel = document.getElementById('clSablonTerulet'); if (teruletSel) { for (let kat in gepAdatbazis) { teruletSel.add(new Option(kat, kat)); } }
    const md = document.getElementById('muszakDatum'); if(md) { md.value = toLocalISOString(new Date()); md.addEventListener('change', frissitMuszakFeladatok); }
    const mt = document.getElementById('muszakTipus'); if(mt) { mt.addEventListener('change', frissitMuszakFeladatok); }
    if(document.getElementById('clExpTol')) document.getElementById('clExpTol').value = toLocalISOString(new Date());
    if(document.getElementById('clExpIg')) document.getElementById('clExpIg').value = toLocalISOString(new Date());
    loadUserList(); 
});

function toLocalISOString(dateObj) { if(isNaN(dateObj)) return ""; const y = dateObj.getFullYear(), m = String(dateObj.getMonth() + 1).padStart(2, '0'), d = String(dateObj.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }

async function loadUserList() { try { const res = await secureFetch({ action: "getUsers" }); const r = await res.json(); if (r.status === "success" && r.data.length > 0) { const sel = document.getElementById('loginNevSelect'); if(sel) { sel.innerHTML = '<option value="">Válassz a listából...</option>'; r.data.forEach(user => sel.add(new Option(user, user))); sel.add(new Option("--- Egyéb (kézi megadás) ---", "custom")); } } else { document.getElementById('loginNevSelect').style.display = 'none'; document.getElementById('loginNev').style.display = 'block'; } } catch(e) { document.getElementById('loginNevSelect').style.display = 'none'; document.getElementById('loginNev').style.display = 'block'; } }
function checkLoginCustom(sel) { if(sel.value === "custom") { sel.style.display = 'none'; document.getElementById('loginNev').style.display = 'block'; document.getElementById('loginNev').focus(); } else { document.getElementById('loginNev').value = sel.value; } }
async function hashPassword(p) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p)); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''); }

window.onload = async function() {
    const savedUser = localStorage.getItem("activeUser");
    if(savedUser) {
        document.getElementById('currentUserText').innerText = savedUser; let sessionRole = localStorage.getItem("activeRole") || "production";
        if (sessionRole === "admin" || sessionRole === "superuser") { if(document.getElementById('navChecklistAdminTab')) document.getElementById('navChecklistAdminTab').style.display = "block"; }
        document.getElementById('loginView').style.display = 'none'; document.getElementById('appView').style.display = 'block';
        populateNavDropdown(); checkLockdownAndInit();
    } else { document.getElementById('loginView').style.display = 'block'; document.getElementById('appView').style.display = 'none'; }
};

async function checkLockdownAndInit() {
    try {
        const resAll = await secureFetch({ action: "getAllData", reszleg: RESZLEG }); const rAll = await resAll.json();
        if(rAll.status === "success") { 
            globalSchedule = rAll.data.schedule || []; globalShiftLogs = rAll.data.shiftLogs || []; expectedApprovers = rAll.data.expectedApprovers || []; 
            let allTasks = rAll.data.tasks || []; processAppTasks(allTasks); processLockdownDisplay();
        }
    } catch(e) { document.getElementById('appView').style.display = 'block'; loadShiftLogs(); }
}

// --- ÚJ: Műszak Időablak Számoló Algoritmus (Okos dátumkeresővel) ---
function isTaskInShift(t, shiftDateStr, shiftName) {
    if (!shiftDateStr || !shiftName) return false;
    let start = new Date(shiftDateStr + "T00:00:00"); let end = new Date(shiftDateStr + "T00:00:00");
    if (shiftName.includes("Délelőtt")) { start.setHours(6, 0, 0, 0); end.setHours(14, 0, 0, 0); } else if (shiftName.includes("Délután")) { start.setHours(14, 0, 0, 0); end.setHours(22, 0, 0, 0); } else if (shiftName.includes("Éjszaka")) { start.setHours(22, 0, 0, 0); end.setDate(end.getDate() + 1); end.setHours(6, 0, 0, 0); } else { start.setHours(0, 0, 0, 0); end.setDate(end.getDate() + 1); end.setHours(0, 0, 0, 0); }
    if (t.statusz === "Lezárt") {
        let checkDate = new Date(t.startIdopont ? t.startIdopont : t.idopont);
        if (t.megoldas && t.megoldas.includes("✅ [")) {
            let parts = t.megoldas.split("✅ ["); let datePart = parts[parts.length - 1].split("-")[0]; let nums = datePart.match(/\d+/g);
            if (nums && nums.length >= 5) checkDate = new Date(nums[0], nums[1]-1, nums[2], nums[3], nums[4], nums[5] || 0);
        }
        return checkDate >= start && checkDate < end;
    } else { return new Date(t.idopont) < end; }
}

function processAppTasks(allTasks) {
    muszakValaszthatoFeladatok = []; currentActiveTasks = []; globalClosedTasks = [];
    allTasks.forEach(t => { 
        let isPrev = String(t.id).startsWith("PREV-") || String(t.id).includes("REC-");
        let pLower = String(t.prioritas).toLowerCase();
        if (!isPrev && !pLower.includes("informatív")) { muszakValaszthatoFeladatok.push(t); }
        if(t.statusz !== "Lezárt") { currentActiveTasks.push(t); } else { globalClosedTasks.push(t); }
    });
    frissitMuszakFeladatok();
}

function frissitMuszakFeladatok() {
    const datum = document.getElementById('muszakDatum').value;
    const muszakTipus = document.getElementById('muszakTipus') ? document.getElementById('muszakTipus').value : "";
    const container = document.getElementById('muszakTaskContainer');
    if (!container || !datum || !muszakTipus) return;

    selectedShiftTasks = []; 
    let osszes = muszakValaszthatoFeladatok.filter(t => isTaskInShift(t, datum, muszakTipus));

    if (osszes.length === 0) { container.innerHTML = "<div style='color:var(--text-muted); padding:10px;'>Nincs a kiválasztott műszak óráiban lezárt vagy nyitott hiba.</div>"; return; }
    osszes.sort((a,b) => { if(a.statusz !== "Lezárt" && b.statusz === "Lezárt") return -1; if(a.statusz === "Lezárt" && b.statusz !== "Lezárt") return 1; return new Date(b.idopont) - new Date(a.idopont); });

    let html = "";
    osszes.forEach(t => {
        let parts = String(t.idopont).split(/\D+/); let timeStr = parts.length >= 5 ? `${parts[3].padStart(2,'0')}:${parts[4].padStart(2,'0')}` : "00:00";
        let pLower = String(t.prioritas).toLowerCase(); let eC = t.statusz === "Lezárt" ? "closed" : (pLower.includes("leállás") ? "Termelésleállás" : (t.statusz === "Folyamatban" ? "Folyamatban" : (pLower.includes("magas") ? "Magas" : "")));
        const pr = String(t.prioritas).replace(" prioritás", "").replace("ással járó", ""); let pB = "badge-normal"; if(pLower.includes("leállás")) pB = "badge-crit"; else if(pLower.includes("magas")) pB = "badge-high"; else if(pLower.includes("megfigyelés")) pB = "badge-obs"; 
        let cardId = `shiftTaskCard_${t.id}`; let ikon = String(t.id).includes("PROD-") ? "🏭" : (String(t.id).startsWith("PREV-") ? "🔁" : "🔧"); let safeGep = String(t.gep || "-").replace(/'/g, "\\'").replace(/"/g, '&quot;');
        let inProgressHtml = t.statusz === "Folyamatban" ? `<div class="in-progress-bar" style="font-size:11px; padding:4px; margin-bottom:5px;"><span>⚙️</span> <b>${t.felelos}</b> éppen dolgozik rajta</div>` : "";
        let kepekHtml = ""; if (t.kepek) { kepekHtml += `<div style="display:flex; gap:5px; margin-top:8px; margin-bottom:5px; overflow-x:auto;">`; String(t.kepek).split(",").forEach(u => { if(u.trim()) { const m = u.match(/id=([^&]+)/) || u.match(/d\/([a-zA-Z0-9_-]+)/); const imgSrc = m ? `https://lh3.googleusercontent.com/d/${m[1]}` : u.trim(); kepekHtml += `<img src="${imgSrc}" loading="lazy" style="max-height:60px; border-radius:3px; border:1px solid #cbd5e1;">`; } }); kepekHtml += `</div>`; }
        let megoldasHtml = "";
        if (t.statusz === "Lezárt") {
            let dtTxt = t.downtime ? ` | Kiesés: ${t.downtime} perc` : ""; let idoTxt = t.ido ? `${t.ido} perc` : "0 perc";
            megoldasHtml = `<div style="margin-top:8px; font-size:11px; color:var(--pri-normal); background:#f0fdf4; padding:6px; border-radius:4px; border:1px solid #bbf7d0;"><b style="display:block; margin-bottom:2px;">Megoldás:</b>${String(t.megoldas || "").replace(/\n/g, '<br>')}<div style="margin-top:4px; color:var(--text-muted); font-weight:bold;">Javítás: ${idoTxt}${dtTxt}</div></div>`;
        }
        let metaFooter = `<div style="margin-top:8px; font-size:11px; color:var(--text-muted); display:flex; justify-content:space-between; border-top:1px solid var(--border); padding-top:5px;"><div>Beküldte: <b>${t.felhasznalo}</b></div>${t.statusz === "Lezárt" ? `<div>Lezárta: <b>${t.lezarta || "-"}</b></div>` : ''}</div>`;
        html += `<div id="${cardId}" class="card ${eC}" style="cursor:pointer; border: 2px solid #cbd5e1; transition: 0.2s;" onclick="toggleMuszakTask('${t.id}', '${safeGep}', '${t.statusz}')"><div class="card-header"><div style="display:flex; gap:5px; align-items:center;">${t.statusz === "Lezárt" ? `<span class="badge badge-closed">Lezárt</span>` : ''}<span class="badge ${pB}">${pr}</span></div><span style="color: var(--text-muted); font-size: 13px; font-weight:bold;">${timeStr}</span></div><div class="machine-name" style="font-size:14px; margin-bottom:5px;">${ikon} ${t.gep}</div>${inProgressHtml}<div class="issue-desc" style="white-space:pre-wrap; font-size:12px;">${t.hiba}</div>${kepekHtml}${megoldasHtml}${metaFooter}</div>`;
    });
    container.innerHTML = html;
}

function toggleMuszakTask(taskId, gepNeve, statusz) {
    let card = document.getElementById(`shiftTaskCard_${taskId}`); let index = selectedShiftTasks.findIndex(x => x.id === taskId);
    if (index > -1) { selectedShiftTasks.splice(index, 1); card.style.borderColor = "#cbd5e1"; card.style.boxShadow = "none"; card.style.transform = "scale(1)"; } 
    else { selectedShiftTasks.push({ id: taskId, gep: gepNeve, statusz: statusz }); card.style.borderColor = "var(--pri-normal)"; card.style.boxShadow = "0 0 15px rgba(16, 185, 129, 0.4)"; card.style.transform = "scale(1.03)"; }
}

function processLockdownDisplay() {
    const isLocked = evaluateLockdown();
    if (isLocked) { document.getElementById('lockdownScreen').style.display = 'block'; document.getElementById('appView').style.display = 'none'; } 
    else { document.getElementById('lockdownScreen').style.display = 'none'; document.getElementById('appView').style.display = 'block'; const lastTabId = sessionStorage.getItem("activeAppTab"); if(lastTabId) { const btn = document.querySelector(`button[onclick*="'${lastTabId}'"]`); if(btn) btn.click(); else loadShiftLogs(); } else { switchTab('muszakatadasView', document.querySelector(`button[onclick*="'muszakatadasView'"]`)); loadShiftLogs(); } }
}

function generateLockdownTaskHtml(datum, muszak, logKey) {
    let osszes = muszakValaszthatoFeladatok.filter(t => isTaskInShift(t, datum, muszak));
    if (osszes.length === 0) return "<div style='color:var(--text-muted); font-size:12px; padding:5px;'>Nincs a " + muszak + " műszakhoz köthető hiba.</div>";
    osszes.sort((a,b) => { if(a.statusz !== "Lezárt" && b.statusz === "Lezárt") return -1; if(a.statusz === "Lezárt" && b.statusz !== "Lezárt") return 1; return new Date(b.idopont) - new Date(a.idopont); });

    let html = "";
    osszes.forEach(t => {
        let parts = String(t.idopont).split(/\D+/); let timeStr = parts.length >= 5 ? `${parts[3].padStart(2,'0')}:${parts[4].padStart(2,'0')}` : "00:00";
        let pLower = String(t.prioritas).toLowerCase(); let eC = t.statusz === "Lezárt" ? "closed" : (pLower.includes("leállás") ? "Termelésleállás" : (t.statusz === "Folyamatban" ? "Folyamatban" : (pLower.includes("magas") ? "Magas" : "")));
        const pr = String(t.prioritas).replace(" prioritás", "").replace("ással járó", ""); let pB = "badge-normal"; if(pLower.includes("leállás")) pB = "badge-crit"; else if(pLower.includes("magas")) pB = "badge-high"; else if(pLower.includes("megfigyelés")) pB = "badge-obs"; 
        let cardId = `lockdownCard_${logKey}_${t.id}`; let ikon = String(t.id).includes("PROD-") ? "🏭" : (String(t.id).startsWith("PREV-") ? "🔁" : "🔧"); let safeGep = String(t.gep || "-").replace(/'/g, "\\'").replace(/"/g, '&quot;');
        let inProgressHtml = t.statusz === "Folyamatban" ? `<div class="in-progress-bar" style="font-size:11px; padding:4px; margin-bottom:5px;"><span>⚙️</span> <b>${t.felelos}</b> éppen dolgozik rajta</div>` : "";
        let kepekHtml = ""; if (t.kepek) { kepekHtml += `<div style="display:flex; gap:5px; margin-top:8px; margin-bottom:5px; overflow-x:auto;">`; String(t.kepek).split(",").forEach(u => { if(u.trim()) { const m = u.match(/id=([^&]+)/) || u.match(/d\/([a-zA-Z0-9_-]+)/); const imgSrc = m ? `https://lh3.googleusercontent.com/d/${m[1]}` : u.trim(); kepekHtml += `<img src="${imgSrc}" loading="lazy" style="max-height:60px; border-radius:3px; border:1px solid #cbd5e1;">`; } }); kepekHtml += `</div>`; }
        let megoldasHtml = "";
        if (t.statusz === "Lezárt") { let dtTxt = t.downtime ? ` | Kiesés: ${t.downtime} perc` : ""; let idoTxt = t.ido ? `${t.ido} perc` : "0 perc"; megoldasHtml = `<div style="margin-top:8px; font-size:11px; color:var(--pri-normal); background:#f0fdf4; padding:6px; border-radius:4px; border:1px solid #bbf7d0;"><b style="display:block; margin-bottom:2px;">Megoldás:</b>${String(t.megoldas || "").replace(/\n/g, '<br>')}<div style="margin-top:4px; color:var(--text-muted); font-weight:bold;">Javítás: ${idoTxt}${dtTxt}</div></div>`; }
        html += `<div id="${cardId}" class="card ${eC}" style="cursor:pointer; border: 2px solid #cbd5e1; transition: 0.2s; padding:8px;" onclick="toggleLockdownTask('${t.id}', '${safeGep}', '${t.statusz}', '${logKey}')"><div class="card-header"><div style="display:flex; gap:5px; align-items:center;">${t.statusz === "Lezárt" ? `<span class="badge badge-closed">Lezárt</span>` : ''}<span class="badge ${pB}">${pr}</span></div><span style="color: var(--text-muted); font-size: 11px; font-weight:bold;">${timeStr}</span></div><div class="machine-name" style="font-size:12px; margin-bottom:2px;">${ikon} ${t.gep}</div>${inProgressHtml}<div class="issue-desc" style="white-space:pre-wrap; font-size:11px;">${t.hiba}</div>${kepekHtml}${megoldasHtml}</div>`;
    });
    return html;
}

function toggleLockdownTask(taskId, gepNeve, statusz, logKey) {
    let card = document.getElementById(`lockdownCard_${logKey}_${taskId}`); if(!lockdownSelectedTasks[logKey]) lockdownSelectedTasks[logKey] = [];
    let index = lockdownSelectedTasks[logKey].findIndex(x => x.id === taskId);
    if (index > -1) { lockdownSelectedTasks[logKey].splice(index, 1); card.style.borderColor = "#cbd5e1"; card.style.boxShadow = "none"; card.style.transform = "scale(1)"; } 
    else { lockdownSelectedTasks[logKey].push({ id: taskId, gep: gepNeve, statusz: statusz }); card.style.borderColor = "var(--pri-normal)"; card.style.boxShadow = "0 0 10px rgba(16, 185, 129, 0.4)"; card.style.transform = "scale(1.02)"; }
}

function evaluateLockdown() {
    let myUnapprovedCount = 0; let myUnapprovedLogs = []; const currentUser = String(localStorage.getItem("activeUser")).trim().toLowerCase(); let expectedApproversClean = expectedApprovers.map(a => String(a).toLowerCase().trim());
    if (!expectedApproversClean.includes(currentUser)) return false; let now = new Date();
    globalShiftLogs.forEach(l => {
        let logD = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10);
        if (logD >= "2026-09-01") {
            let szamonKerheto = false; let logDateObj = new Date(logD + "T00:00:00"); let muszakVegeH = 0;
            if(String(l.muszak).includes("Délelőtt")) muszakVegeH = 14; else if(String(l.muszak).includes("Délután")) muszakVegeH = 22; else if(String(l.muszak).includes("Éjszaka")) muszakVegeH = 6; 
            let vegeIdopont = new Date(logDateObj); if (muszakVegeH === 6) vegeIdopont.setDate(vegeIdopont.getDate() + 1); vegeIdopont.setHours(muszakVegeH, 0, 0, 0);
            if (now >= vegeIdopont) { szamonKerheto = true; }
            if (szamonKerheto) {
                let amIScheduled = globalSchedule.some(s => s.datum === logD && String(s.user).toLowerCase() === currentUser && !String(s.tipus).includes("Szabadság"));
                if (amIScheduled) { if (l.hianyzo) { myUnapprovedCount++; myUnapprovedLogs.push(l); } else { let approvers = l.jovahagyok ? String(l.jovahagyok).split(',').map(x=>x.trim().toLowerCase()).filter(x=>x) : []; let creatorLower = String(l.felhasznalo).trim().toLowerCase(); if (!approvers.includes(creatorLower)) approvers.push(creatorLower); if (!approvers.includes(currentUser)) { myUnapprovedCount++; myUnapprovedLogs.push(l); } } }
            }
        }
    });

    if (myUnapprovedCount > 0) {
        let listHtml = myUnapprovedLogs.map(l => {
            let logD = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10); const displayDate = new Date(logD).toLocaleDateString('hu-HU', {month:'short', day:'numeric'});
            if (l.hianyzo) {
                let logKey = `${l.datum}_${l.muszak}`; lockdownSelectedTasks[logKey] = []; let taskHtml = generateLockdownTaskHtml(l.datum, l.muszak, logKey);
                return `<div style="background:#fee2e2; padding:15px; border-radius:6px; margin-bottom:10px; border: 1px solid #f87171;"><strong style="font-size:16px; color:var(--pri-crit);">⚠️ HIÁNYZÓ NAPLÓ: ${displayDate} - ${l.muszak}</strong><br><span style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:8px;">A beosztás alapján dolgoztál, de nem rögzítettek naplót. Pótold most!</span><div style="background:white; padding:10px; border-radius:4px; margin-bottom:10px; border:1px solid #cbd5e1;"><div style="display:flex; align-items:center; margin-bottom:10px;"><label style="font-weight:bold; color:var(--primary); font-size:13px; margin-right:10px;">⏳ Állásidő (perc):</label><input type="number" id="hianyzoDowntime_${logKey}" class="dash-input" placeholder="Pl. 45" style="width:80px; margin:0; font-size:13px; padding:4px;"></div><label style="font-weight:bold; color:var(--pri-crit); font-size:12px; display:block; border-top:1px dashed #cbd5e1; padding-top:5px; margin-bottom:5px;">🔗 Mely feladatok okozták a leállást?</label><div class="grid-cards" style="max-height: 200px; overflow-y: auto; padding: 5px; gap:8px;">${taskHtml}</div></div><textarea id="hianyzoSzoveg_${logKey}" rows="2" placeholder="Írd meg a műszaknaplót..." style="margin-bottom:8px; background:white; font-size:14px;"></textarea><button onclick="submitHianyzoNaplo('${l.datum}', '${l.muszak}')" style="background:var(--pri-normal); border:none; color:white; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer; width:auto;">📝 Hiányzó Napló Beküldése</button></div>`;
            } else {
                let safeSzoveg = String(l.szoveg).replace(/</g, "&lt;").replace(/>/g, "&gt;"); safeSzoveg = safeSzoveg.replace(/\[([A-Z0-9-]+)\]/g, `<span style="color:#0284c7; cursor:pointer; text-decoration:underline; font-weight:bold; padding:0 3px;" onclick="window.viewTaskDetails('$1')">🔍 $1</span>`);
                return `<div style="background:#f8fafc; padding:15px; border-radius:6px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:flex-start; border: 1px solid var(--border);"><div style="flex:1; padding-right:15px;"><strong style="font-size:16px;">${displayDate} - <span style="color:var(--pri-info);">${l.muszak}</span></strong><br><span style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:8px;">Írta: ${l.felhasznalo}</span><div style="font-size:14px; color:var(--text-main); white-space:pre-wrap; max-height:150px; overflow-y:auto; padding:5px; background:var(--bg-color); border:1px solid #cbd5e1; border-radius:4px;">${safeSzoveg}</div></div><button id="lockdownApprBtn_${l.id}" onclick="approveShiftLogLockdown('${l.id}')" style="background:var(--pri-normal); border:none; color:white; padding:10px 20px; border-radius:4px; font-weight:bold; cursor:pointer; width:auto; margin-top:25px;">✅ Jóváhagyom</button></div>`;
            }
        }).join('');
        document.getElementById('unapprovedLogsList').innerHTML = listHtml; return true;
    } return false;
}

async function submitHianyzoNaplo(datum, muszak) {
    let logKey = `${datum}_${muszak}`; let szoveg = document.getElementById(`hianyzoSzoveg_${logKey}`).value.trim();
    let downtimeEl = document.getElementById(`hianyzoDowntime_${logKey}`); let downtime = downtimeEl ? downtimeEl.value : null;
    if(!szoveg || downtime === null || downtime === "") { return alert("A napló szövege és az állásidő kitöltése kötelező! (Ha nem volt leállás, írj be 0-t!)"); }
    let extraHeader = ""; if (downtime && downtime > 0) { extraHeader += `⏳ Teljes állásidő a műszakban: ${downtime} perc\n`; }
    if (lockdownSelectedTasks[logKey] && lockdownSelectedTasks[logKey].length > 0) {
        extraHeader += `🔗 Műszakhoz kapcsolódó leállások / hibák:\n`;
        lockdownSelectedTasks[logKey].forEach(task => { let fullTask = muszakValaszthatoFeladatok.find(t => t.id === task.id); let tHiba = fullTask ? fullTask.hiba.replace(/\n/g, ' | ') : ""; let tDowntime = fullTask && fullTask.downtime ? fullTask.downtime : 0; extraHeader += `   - [${task.id}] ${task.gep} - ${tHiba} (Állás: ${tDowntime} perc)\n`; });
    }
    if (extraHeader !== "") { szoveg = extraHeader + "\n" + szoveg; }
    try { const res = await secureFetch({ action: "addShiftLog", reszleg: RESZLEG, datum: datum, muszak: muszak, szoveg: szoveg, felhasznalo: localStorage.getItem("activeUser") }); const r = await res.json(); if(r.status === "success") { showToast("Napló sikeresen rögzítve!"); checkLockdownAndInit(); } else { alert(r.message); } } catch(e) { alert("Hiba a mentés során!"); }
}

async function approveShiftLogLockdown(id) { const btn = document.getElementById('lockdownApprBtn_' + id); if(btn) { btn.disabled = true; btn.innerText = "⏳ Töltés..."; } await secureFetch({ action: "approveShiftLog", reszleg: RESZLEG, id: id, felhasznalo: String(localStorage.getItem("activeUser")).trim() }); showToast("Jóváhagyva!"); checkLockdownAndInit(); }

function switchTab(tId, btn) { document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active')); document.getElementById(tId).classList.add('active'); if(btn) btn.classList.add('active'); sessionStorage.setItem("activeAppTab", tId); }

async function login() { 
    let n = document.getElementById('loginNevSelect').value !== "custom" && document.getElementById('loginNevSelect').value !== "" ? document.getElementById('loginNevSelect').value : document.getElementById('loginNev').value; const j = document.getElementById('loginJelszo').value; if(!n || !j) return alert("Add meg az adatokat!"); 
    document.getElementById('loginStatus').innerText = "Ellenőrzés..."; 
    try { 
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "login", nev: n, jelszo: await hashPassword(j) }) }); const r = await res.json(); 
        if(r.status === "success") { 
            localStorage.setItem("activeUser", n); localStorage.setItem("activeRole", r.role || (typeof RESZLEG !== 'undefined' ? RESZLEG : "production")); localStorage.setItem("sessionToken", r.token); 
            if (window.isSessionExpired && globalShiftLogs.length > 0) { window.isSessionExpired = false; document.getElementById('loginView').style.display = 'none'; document.getElementById('appView').style.display = 'block'; document.getElementById('loginJelszo').value = ''; document.getElementById('loginStatus').innerText = ''; showToast("✅ Sikeres visszajelentkezés! Most már rányomhatsz a Mentés gombra."); } else { location.reload(); }
        } else { document.getElementById('loginStatus').innerText = r.message; } 
    } catch(e) { document.getElementById('loginStatus').innerText = "Hiba!"; } 
}

function logout() { localStorage.removeItem("activeUser"); localStorage.removeItem("activeRole"); localStorage.removeItem("sessionToken"); sessionStorage.clear(); window.location.href = window.location.pathname; }

async function loadShiftLogs() { const c = document.getElementById('shiftLogsContainer'); if(!c) return; c.innerHTML = "Betöltés..."; try { const res = await secureFetch({ action: "getShiftLogs", reszleg: RESZLEG }); const r = await res.json(); if(r.status === "success") { globalShiftLogs = r.data; renderShiftLogs(); } } catch(e) {} }

async function submitShiftLog() {
    const d = document.getElementById('muszakDatum').value; const m = document.getElementById('muszakTipus').value; let s = document.getElementById('muszakSzoveg').value.trim(); const downtime = document.getElementById('muszakDowntime') ? document.getElementById('muszakDowntime').value : null;
    if (!d || !s || downtime === null || downtime === "") { alert("Dátum, szöveg ÉS az állásidő kitöltése kötelező! (Ha nem volt leállás, írj be 0-t!)"); return; }
    const btn = document.getElementById('btnShiftLog'); btn.disabled = true;
    let extraHeader = ""; if (downtime && downtime > 0) { extraHeader += `⏳ Teljes állásidő a műszakban: ${downtime} perc\n`; }
    if (selectedShiftTasks.length > 0) { extraHeader += `🔗 Műszakhoz kapcsolódó leállások / hibák:\n`; selectedShiftTasks.forEach(task => { let fullTask = muszakValaszthatoFeladatok.find(t => t.id === task.id); let tHiba = fullTask ? fullTask.hiba.replace(/\n/g, ' | ') : ""; let tDowntime = fullTask && fullTask.downtime ? fullTask.downtime : 0; extraHeader += `   - [${task.id}] ${task.gep} - ${tHiba} (Állás: ${tDowntime} perc)\n`; }); }
    if (extraHeader !== "") { s = extraHeader + "\n" + s; }
    try { const res = await secureFetch({ action: "addShiftLog", reszleg: RESZLEG, datum: d, muszak: m, szoveg: s, felhasznalo: localStorage.getItem("activeUser") }); const r = await res.json(); if(r.status === "success") { showToast("Napló mentve!"); document.getElementById('muszakSzoveg').value = ''; if(document.getElementById('muszakDowntime')) document.getElementById('muszakDowntime').value = ''; checkLockdownAndInit(); } else { alert(r.message); } } catch(e) {} finally { btn.disabled = false; }
}

function filterShiftLogs() { renderShiftLogs(); }

function renderShiftLogs() {
    const c = document.getElementById('shiftLogsContainer'); if(!c) return;
    const sUser = document.getElementById('szuroMuszakUser').value.toLowerCase(), sTipus = document.getElementById('szuroMuszakTipus').value, sTol = document.getElementById('szuroMuszakDatumTol').value, sIg = document.getElementById('szuroMuszakDatumIg').value;
    let f = globalShiftLogs.filter(l => { let d = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10); return (String(l.felhasznalo).toLowerCase().includes(sUser) || String(l.szoveg).toLowerCase().includes(sUser)) && (sTipus ? String(l.muszak).includes(sTipus) : true) && (sTol ? d >= sTol : true) && (sIg ? d <= sIg : true); });
    if(f.length === 0) { c.innerHTML = "Nincs találat."; return; } let h = "";
    f.forEach(l => {
        let logD = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10); const dateStr = new Date(logD).toLocaleDateString('hu-HU', {month:'short', day:'numeric'});
        let approvers = l.jovahagyok ? String(l.jovahagyok).split(',').map(x=>x.trim()).filter(x=>x) : []; let statusHtml = "";
        if (approvers.length > 0) statusHtml = `<div style="margin-top:10px; font-size:11px; color:var(--pri-normal);"><b style="color:var(--text-muted);">Látta:</b> ${approvers.join(', ')}</div>`; else statusHtml = `<div style="margin-top:10px; font-size:11px; color:var(--pri-crit);">Még senki nem látta!</div>`;
        let safeSzoveg = String(l.szoveg).replace(/</g, "&lt;").replace(/>/g, "&gt;"); safeSzoveg = safeSzoveg.replace(/\[([A-Z0-9-]+)\]/g, `<span style="color:#0284c7; cursor:pointer; text-decoration:underline; font-weight:bold; padding:0 3px;" onclick="window.viewTaskDetails('$1')">🔍 $1</span>`);
        h += `<div class="task-card" style="border-left-color: var(--pri-info);"><div class="task-header"><span class="badge badge-info">${l.muszak}</span><span style="font-weight:bold; color:var(--text-muted);">${dateStr}</span></div><div style="white-space:pre-wrap; font-size:14px; margin-bottom:10px;">${safeSzoveg}</div><div style="font-size:12px; color:var(--text-muted); border-top:1px solid var(--border); padding-top:10px;">Írta: <b>${l.felhasznalo}</b></div>${statusHtml}</div>`;
    }); c.innerHTML = h;
}

window.viewTaskDetails = function(taskId) {
    let task = currentActiveTasks.find(t => t.id === taskId) || globalClosedTasks.find(t => t.id === taskId);
    if(!task) { alert("⚠️ A feladat (" + taskId + ") már nem található az aktív memóriában, mert lezárták és régebbi 30 napnál (Archivált)."); return; }
    document.getElementById('statModalTitle').innerHTML = `🔍 ${task.id} Részletei`;
    let dtTxt = parseFloat(task.downtime) > 0 ? `<b style="color:var(--pri-crit);">(${task.downtime} perc kiesés)</b>` : '';
    let html = `<div style="padding:10px 0;"><div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span style="font-size:15px;"><b>Gép:</b> ${task.gep}</span><span class="badge badge-normal">${task.statusz}</span></div><div style="background:#f8fafc; padding:10px; border-radius:4px; border:1px solid var(--border); margin-bottom:10px;"><b style="color:var(--text-main);">Hiba leírása:</b><br><span style="white-space:pre-wrap; font-size:13px;">${task.hiba}</span></div><div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;"><b>Rögzítette:</b> ${task.felhasznalo} <br><b>Időpont:</b> ${new Date(task.idopont).toLocaleString('hu-HU')}</div>`;
    if (task.statusz === "Lezárt") { html += `<div style="background:#f0fdf4; padding:10px; border-radius:4px; border:1px solid #bbf7d0; margin-bottom:10px;"><b style="color:var(--pri-normal);">Megoldás:</b><br><span style="white-space:pre-wrap; font-size:13px;">${task.megoldas || 'Nem lett kitöltve megoldás.'}</span></div><div style="font-size:12px; color:var(--text-muted);"><b>Lezárta:</b> ${task.lezarta} <br><b>Javítási idő:</b> ${task.ido || 0} perc <br><b>Leállás:</b> ${dtTxt || '0 perc'}</div>`; } else if (task.statusz === "Folyamatban") { html += `<div style="background: rgba(139, 92, 246, 0.2); padding:10px; border-radius:6px; color:#a78bfa; margin-top:15px; border:1px solid var(--pri-prog);">👷 <b>${task.felelos}</b> dolgozik rajta</div>`; }
    html += `</div>`; document.getElementById('statModalBody').innerHTML = html; document.getElementById('statDetailsModal').style.display = 'flex';
};

function closeStatModal(force = false) { if(force === true || (event && event.target.id === 'statDetailsModal')) { let modal = document.getElementById('statDetailsModal'); if (modal) modal.style.display = "none"; } }

function exportShiftLogs() { let csv = "Dátum;Műszak;Írta;Szöveg;Jóváhagyók\n"; globalShiftLogs.forEach(l => { let logD = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10); csv += `"${logD}";"${l.muszak}";"${l.felhasznalo}";"${String(l.szoveg).replace(/"/g,'""')}";"${l.jovahagyok||""}"\n`; }); let a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff"+csv], {type:'text/csv;charset=utf-8;'})); a.download = "Muszaknaplo_Export.csv"; document.body.appendChild(a); a.click(); document.body.removeChild(a); }

async function getFilteredChecklistLogs() { const sTol = document.getElementById('clExpTol').value; const sIg = document.getElementById('clExpIg').value; const sMuszak = document.getElementById('clExpMuszak').value; try { const res = await secureFetch({ action: "getChecklistFullLog" }); const r = await res.json(); let logs = r.data || []; return logs.filter(l => { let d = l.datum; return (!sTol || d >= sTol) && (!sIg || d <= sIg) && (!sMuszak || l.muszak.includes(sMuszak)); }); } catch(e) { return []; } }

async function viewChecklistLogs() {
    const container = document.getElementById('checklistLogsContainer'); container.innerHTML = "Betöltés..."; let logs = await getFilteredChecklistLogs();
    if(logs.length === 0) { container.innerHTML = "<div style='text-align:center; color:var(--text-muted);'>Nincs a szűrésnek megfelelő kitöltött checklist.</div>"; return; } let html = "";
    logs.forEach(l => { html += `<div class="task-card" style="border-left-color: var(--pri-normal); margin-bottom:15px;"><div class="task-header"><span class="badge badge-normal">Kitöltve</span><span><b>Dátum:</b> ${l.datum} | <b>Műszak:</b> ${l.muszak}</span></div><div style="font-size:14px; margin-bottom:8px;">Módosító / Kitöltő: <b style="color:var(--pri-info);">${l.kitolto}</b></div><div style="overflow-x:auto;"><table class="admin-table" style="width:100%; min-width:700px; margin-top:10px;"><thead><tr><th style="width:20%;">Fő feladat</th><th style="width:20%;">Terület / Gép</th><th style="width:40%;">Kérdés</th><th style="width:10%;">Eredmény</th><th style="width:10%;">Megjegyzés</th></tr></thead><tbody>`;
        try { let parsed = JSON.parse(l.eredmenyek); parsed.forEach(p => { let color = p.valasz === 'OK' ? '#10b981' : (p.valasz === 'NOK' ? '#ef4444' : '#94a3b8'); let tTxt = p.terulet ? `<b style="color:var(--text-muted); font-size:11px;">[${p.terulet}]</b><br>` : ""; let gTxt = p.gep ? p.gep : "-"; html += `<tr><td style="font-weight:bold; color:var(--primary); font-size:12px; background:rgba(0,0,0,0.02);">${p.focim || '-'}</td><td style="font-size:12px;">${tTxt}${gTxt}</td><td style="font-size:13px;">${p.kerdes}</td><td style="color:${color}; font-weight:bold; white-space:nowrap;">${p.valasz}</td><td style="font-size:12px; color:var(--text-muted);">${p.megjegyzes || '-'}</td></tr>`; }); } catch(e) { html += `<tr><td colspan="5"><i>Nem olvasható adatok.</i></td></tr>`; } html += `</tbody></table></div></div>`;
    }); container.innerHTML = html;
}

async function exportChecklistLogs() { let f = await getFilteredChecklistLogs(); if(f.length > 0) { let csv = "Dátum;Műszak;Módosító;Fő feladat;Terület;Gép;Kérdés;Válasz;Megjegyzés\n"; f.forEach(l => { try { let parsed = JSON.parse(l.eredmenyek); parsed.forEach(p => { csv += `"${l.datum}";"${l.muszak}";"${l.kitolto}";"${p.focim||'-'}";"${p.terulet||'-'}";"${p.gep||'-'}";"${p.kerdes}";"${p.valasz}";"${p.megjegyzes||'-'}"\n`; }); } catch(e) {} }); downloadCSV(csv, "Kitoltott_Checklistak.csv"); showToast("Exportálva!"); } else { alert("Nincs a szűrésnek megfelelő adat!"); } }

async function exportChecklistPDF() {
    let f = await getFilteredChecklistLogs(); if(f.length === 0) { alert("Nincs a szűrésnek megfelelő adat a PDF-hez!"); return; } let win = window.open('', '_blank');
    let html = `<html><head><title>Műszakvezetői Ellenőrzőlista PDF</title><style> body { font-family: 'Segoe UI', Arial, sans-serif; padding: 15px; color: #333; } h1 { text-align: center; color: #1e293b; border-bottom: 2px solid #cbd5e1; padding-bottom: 5px; margin-bottom: 15px; font-size: 18px; } @page { size: A4 portrait; margin: 0; } @media print { body { padding: 8mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; } table { page-break-inside: auto; } tr { page-break-inside: avoid; page-break-after: auto; } td, th { padding: 3px 4px !important; } .log-box { page-break-after: always; margin-bottom: 0; border: none; } } .log-box { margin-bottom: 20px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; } .log-header { background: #e2e8f0; padding: 6px 12px; font-weight: bold; font-size: 13px; color: #1e293b; } table { width: 100%; border-collapse: collapse; font-size: 10px; line-height: 1.15; } th, td { border: 1px solid #e2e8f0; padding: 4px 6px; text-align: left; vertical-align: middle; } th { background: #f8fafc; color: #64748b; text-transform: uppercase; font-size: 9px; } .ok { color: #10b981; font-weight:bold; } .nok { color: #ef4444; font-weight:bold; } .na { color: #94a3b8; font-weight:bold; } .gep-cell { font-size: 8.5px; color: #475569; display: block; margin-top: 1px; } </style></head><body><h1>Műszakvezetői Ellenőrzőlista Napló</h1>`;
    f.forEach(l => { html += `<div class="log-box"><div class="log-header">📅 ${l.datum} | 🕒 ${l.muszak} | 👤 Módosító / Kitöltő: ${l.kitolto}</div><table><tr><th width="12%">Fő feladat</th><th width="24%">Terület / Gép</th><th width="42%">Ellenőrzött Feladat</th><th width="7%">Eredmény</th><th width="15%">Megjegyzés</th></tr>`; try { let parsed = JSON.parse(l.eredmenyek); parsed.forEach(p => { let cls = p.valasz === 'OK' ? 'ok' : (p.valasz === 'NOK' ? 'nok' : 'na'); html += `<tr><td><b>${p.focim||'-'}</b></td><td><b style="color:#0f172a; font-size: 10px;">${p.terulet||'-'}</b><span class="gep-cell">${p.gep||''}</span></td><td style="font-size: 10.5px;">${p.kerdes}</td><td class="${cls}" style="text-align: center;">${p.valasz}</td><td>${p.megjegyzes || '-'}</td></tr>`; }); } catch(e) { html += `<tr><td colspan="5"><i>Hiba az adatok beolvasásakor.</i></td></tr>`; } html += `</table></div>`; }); html += `</body></html>`; win.document.write(html); win.document.close(); setTimeout(() => { win.print(); }, 800);
}

function downloadCSV(csv, fn) { let a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:'text/csv;charset=utf-8;'})); a.download=fn; document.body.appendChild(a); a.click(); document.body.removeChild(a); }

function frissitClSablonGep() { const k = document.getElementById('clSablonTerulet').value; const s = document.getElementById('clSablonGep'); s.innerHTML = '<option value="">Általános / Összes gép...</option>'; if (k && gepAdatbazis[k]) { gepAdatbazis[k].forEach(g => s.add(new Option(g, g))); } }

function frissitSzuloLista() { const sel = document.getElementById('clSablonSzulo'); if(!sel) return; let actVal = sel.value; sel.innerHTML = '<option value="">-- Ez egy önálló / Fő feladat --</option>'; let mainTasks = globalChecklistSablon.filter(t => !t.szuloId && t.id !== editClSablonId); mainTasks.forEach(t => { sel.add(new Option(t.kerdes + " (" + (t.gep || t.terulet || 'Általános') + ")", t.id)); }); sel.value = actVal; }

async function loadChecklistData() { const c = document.getElementById('checklistAdminList'); if(c) c.innerHTML = "Sablonok betöltése..."; try { const res = await secureFetch({ action: "getAllData", reszleg: RESZLEG }); const r = await res.json(); if(r.status === "success") { globalChecklistSablon = r.data.checklistSablon || []; frissitSzuloLista(); renderChecklistSablon(); } } catch(e) {} }

function renderChecklistSablon() {
    const c = document.getElementById('checklistAdminList'); if(!c) return; if(globalChecklistSablon.length === 0) { c.innerHTML = "<div style='padding:20px; text-align:center; color:var(--text-muted);'>Nincs még egyetlen ellenőrzőpont sem felvéve.</div>"; return; } 
    let organizedTasks = []; let mainTasks = globalChecklistSablon.filter(t => !t.szuloId); let childTasks = globalChecklistSablon.filter(t => t.szuloId);
    mainTasks.forEach(mt => { organizedTasks.push(mt); let children = childTasks.filter(ct => ct.szuloId === mt.id); children.forEach(ct => organizedTasks.push(ct)); });
    let orphans = childTasks.filter(ct => !mainTasks.find(mt => mt.id === ct.szuloId)); organizedTasks.push(...orphans);
    let html = "";
    organizedTasks.forEach(s => { let tNev = s.terulet || "Általános"; let gNev = s.gep ? ` / ${s.gep}` : ""; let isMain = !s.szuloId; let margin = isMain ? 0 : 20; let borderStyle = isMain ? "border-left: 4px solid var(--pri-info);" : "border-left: 3px solid var(--pri-obs);"; let faIkon = isMain ? "📂 " : "↳ "; let extraStyles = isMain ? "background:#f8fafc;" : "";
        html += `<div class="task-card" style="margin-left: ${margin}px; padding: 10px; margin-bottom: 8px; ${borderStyle} ${extraStyles}"><div style="display:flex; justify-content:space-between; align-items:center;"><div style="font-weight:bold; color:var(--primary); font-size:12px;">[${tNev}${gNev}]</div><div style="font-size:11px; color:var(--pri-normal); font-weight:bold;">${s.gyakorisag} | ${s.muszakok}</div></div><div style="font-size:14px; margin:6px 0; font-weight:bold; color:var(--text-main);">${faIkon}${s.kerdes}</div><div style="text-align:right;"><button onclick="editChecklistSablonUI('${s.id}')" style="background:var(--pri-info); width:auto; padding:4px 10px; font-size:11px; margin:0; margin-right:5px;">✏️ Szerkesztés</button><button onclick="deleteChecklistSablon('${s.id}')" style="background:#ef4444; width:auto; padding:4px 10px; font-size:11px; margin:0;">🗑️ Törlés</button></div></div>`;
    }); c.innerHTML = html;
}

function editChecklistSablonUI(id) {
    let s = globalChecklistSablon.find(x => x.id === id); if(!s) return; editClSablonId = id; frissitSzuloLista(); 
    document.getElementById('clSablonTerulet').value = s.terulet || ""; frissitClSablonGep(); setTimeout(() => { document.getElementById('clSablonGep').value = s.gep || ""; }, 100);
    document.getElementById('clSablonKerdes').value = s.kerdes || ""; document.getElementById('clSablonSzulo').value = s.szuloId || ""; document.getElementById('clSablonGyakorisag').value = s.gyakorisag || "Minden nap"; document.getElementById('clSablonUtasitas').value = s.utasitas || ""; document.getElementById('clSablonKep').value = s.kep || ""; document.getElementById('clSablonFajl').value = s.fajl || ""; document.getElementById('clSablonFajlNev').value = s.fajlNev || "";
    let m = s.muszakok || ""; document.getElementById('cbShiftDe').checked = m.includes("Délelőtt"); document.getElementById('cbShiftDu').checked = m.includes("Délután"); document.getElementById('cbShiftEj').checked = m.includes("Éjszaka");
    let btn = document.getElementById('btnSaveSablon'); btn.innerText = "✏️ Módosítás Mentése"; btn.style.background = "var(--pri-obs)"; document.getElementById('checklistAdminView').scrollIntoView({ behavior: 'smooth' });
}

async function addChecklistSablon() {
    const terulet = document.getElementById('clSablonTerulet').value; const gep = document.getElementById('clSablonGep').value; const kerdes = document.getElementById('clSablonKerdes').value; const gyakorisag = document.getElementById('clSablonGyakorisag').value; const utasitas = document.getElementById('clSablonUtasitas').value; const kep = document.getElementById('clSablonKep').value; const fajl = document.getElementById('clSablonFajl').value; const fajlNev = document.getElementById('clSablonFajlNev').value; const szuloId = document.getElementById('clSablonSzulo').value;
    let shifts = []; if(document.getElementById('cbShiftDe').checked) shifts.push("Délelőtt"); if(document.getElementById('cbShiftDu').checked) shifts.push("Délután"); if(document.getElementById('cbShiftEj').checked) shifts.push("Éjszaka");
    if(!kerdes) { alert("A kérdés / feladat megadása kötelező!"); return; } if(shifts.length === 0) { alert("Legalább egy műszakot be kell pipálnod!"); return; }
    const btn = document.getElementById('btnSaveSablon'); btn.disabled = true; btn.innerText = "⏳ Mentés...";
    let payload = { action: editClSablonId ? "editChecklistSablon" : "addChecklistSablon", terulet: terulet, gep: gep, kerdes: kerdes, gyakorisag: gyakorisag, muszakok: shifts.join(", "), utasitas: utasitas, kep: kep, fajl: fajl, fajlNev: fajlNev, szuloId: szuloId }; if(editClSablonId) payload.id = editClSablonId;
    try { await secureFetch(payload); document.getElementById('clSablonKerdes').value = ""; document.getElementById('clSablonUtasitas').value = ""; document.getElementById('clSablonKep').value = ""; document.getElementById('clSablonFajl').value = ""; document.getElementById('clSablonFajlNev').value = ""; document.getElementById('clSablonSzulo').value = ""; editClSablonId = null; showToast("Sikeresen mentve!"); loadChecklistData(); } catch(e) { showToast("Hiba a mentés során!", true); } finally { btn.disabled = false; btn.innerText = "💾 Feladat hozzáadása a faliújságra"; btn.style.background = "var(--pri-info)"; }
}

async function deleteChecklistSablon(id) { if(!confirm("Biztosan törlöd ezt az ellenőrzőpontot?")) return; try { await secureFetch({ action: "deleteChecklistSablon", id: id }); showToast("Törölve!"); loadChecklistData(); } catch(e) { showToast("Hiba!", true); } }
function populateNavDropdown() { const nav = document.getElementById('appNavDropdown'); if(!nav) return; nav.innerHTML = '<option value="" disabled selected>☰ Navigáció</option>'; nav.add(new Option("📱 Termelés App", "production.html")); nav.add(new Option("📺 Termelés Faliújság", "dashboard_prod.html")); nav.add(new Option("🔧 Karbantartás App", "index.html")); nav.add(new Option("📺 Karbantartás Faliújság", "dashboard.html")); }
async function saveSettings() { showToast("Mentve!"); }
document.addEventListener('DOMContentLoaded', () => { const jelszoMezo = document.getElementById('loginJelszo'); if (jelszoMezo) { jelszoMezo.addEventListener('keypress', function(e) { if (e.key === 'Enter') { e.preventDefault(); login(); } }); } });
