const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbziABd0I2cSep7TveoNoaQZkI5FzxYl4suqSfCR2rD8MXJQNMHPiygbTD8MK0T3Qz40/exec";
const RESZLEG = "maintenance";

let feltoltendoKepek = []; let globalOpenTasks = []; let globalClosedTasks = []; let globalShiftLogs = []; let globalSchedule = [];
let globalBaseWorkers = []; let globalExtraWorkers = []; let expectedApprovers = []; let lastKnownTaskCount = 0;
let sessionRole = null; let activeBrush = null; let paintedChanges = []; let statStartDate = null; let statEndDate = null;
let editIsmId = null; 

let globalPartsList = []; let targetPartInputId = null;

const gepAdatbazis = { "Production - Line 1": [ "Conv - Szállítástechnika", "Schenck - Szelepszerelő robot", "TPMS1 - Screwing Station Manual - Atlas Copco", "RMS1 - Tire assembly - Hofmann", "RMM1 - Matching machine - Hofmann", "RFG1 - Tire Inflation - Hofmann", "RSO1 - Bead Seat Optimizer - Hofmann", "RGM1 - Tire Uniformity - Hofmann", "AWS1 - Balancing - Hofmann", "WC1 - Weight cutter - Rameckers", "AGS1 - Weight applicator - KUKA" ], "Production - Line 2": [ "Conv - Szállítástechnika", "WGS2 - Wheel gauging - IEF Werner", "RMS2 - Tire assembly - Hofmann", "RFG2 - Tire Inflation - Hofmann", "AWS2 - Balancing - Hofmann", "WC2 - Weight cutter - Rameckers", "AGS2 - Weight applicator - KUKA", "AWSK1 - Control Balancing - Hofmann", "TPMS writing /reading - ATEQ", "EOL1 - End of Line control - Mabri Vision" ], "Production - Egyedi gépek": [ "MTAM1 - Manual tyre assembly machine - Hofmann", "CUT1 - Bandage Cutting Machine - Cyklop", "HP1 - Hydraulic Press - Strautmann" ], "Magasraktár - High Bay System": [ "RBG 1 - Beewen", "RBG 2 - Beewen", "RBG 3 - Beewen", "Conveyors - Blume/Thepas" ], "Palettázó B&O": [ "Szekventáló robot - B&O" ], "Q-Area": [ "TLIT - Tire leak inspection tank - Corghi", "MTAM2 - Manual tyre assembly machine - Aikido" ], "Facility": [ "Épülettel kapcsolatos dolgok" ], "IT": [ "Szerverek", "Hálózati eszközök (Switch/AP)", "Kliens gépek (PC/Laptop)", "Nyomtatók és szkennerek", "Szoftver és rendszerek", "Egyéb IT eszköz" ], "Compressors": [ "DRAIN - Drain Water Separator - Boge", "COMP1 - Compressor 1 - Boge", "DRY1 - Air Dryer 1 - Beko", "COMP2 - Compressor 2 - Boge", "DRY2 - Air Dryer 2 - Beko", "COMP3 - Compressor 3 - Boge" ], "Aggregátor": [] };
const huHolidays = ["2026-01-01", "2026-03-15", "2026-04-03", "2026-04-06", "2026-05-01", "2026-05-25", "2026-08-20", "2026-10-23", "2026-11-01", "2026-12-24", "2026-12-25", "2026-12-26"]; const huWorkWeekends = ["2026-08-08", "2026-12-12"];

function isWorkDay(dObj) { let dStr = toLocalISOString(dObj); if (huWorkWeekends.includes(dStr)) return true; if (huHolidays.includes(dStr)) return false; let day = dObj.getDay(); return day !== 0 && day !== 6; }
function toLocalISOString(dateObj) { if(isNaN(dateObj)) return ""; const y = dateObj.getFullYear(), m = String(dateObj.getMonth() + 1).padStart(2, '0'), d = String(dateObj.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }
function getWorkingMinutes(startDateStr, endDateStr) { let start = new Date(startDateStr); let end = new Date(endDateStr); if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) return 0; let totalMinutes = 0; let current = new Date(start); while (current < end) { if (isWorkDay(current)) { let startOfDay = new Date(current); startOfDay.setHours(6, 0, 0, 0); let endOfDay = new Date(current); endOfDay.setHours(22, 0, 0, 0); let periodStart = current > startOfDay ? current : startOfDay; let periodEnd = end < endOfDay ? end : endOfDay; if (periodStart < periodEnd) totalMinutes += (periodEnd - periodStart) / 60000; } current.setDate(current.getDate() + 1); current.setHours(0, 0, 0, 0); } return totalMinutes; }
function showToast(msg, isError = false) { const t = document.getElementById('toastMessage'); t.style.background = isError ? "var(--pri-crit)" : "var(--pri-normal)"; t.innerHTML = isError ? "❌ " + msg : "✅ " + msg; t.style.display = "block"; setTimeout(() => t.style.opacity = "1", 10); setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.style.display = "none", 300); }, 3000); }

window.addEventListener('DOMContentLoaded', () => {
    const katSelect = document.getElementById('kategoria'), szuroKatSelect = document.getElementById('szuroKategoria'), ismKatSelect = document.getElementById('ismKategoria'), szuroNyKatSelect = document.getElementById('szuroNyitottKategoria');
    for (let kat in gepAdatbazis) { katSelect.add(new Option(kat, kat)); szuroKatSelect.add(new Option(kat, kat)); ismKatSelect.add(new Option(kat, kat)); szuroNyKatSelect.add(new Option(kat, kat)); }
    const nToggle = document.getElementById('notifToggle'); if(nToggle) nToggle.addEventListener('change', (e) => { document.getElementById('notifSlider').style.backgroundColor = e.target.checked ? "var(--pri-normal)" : "#cbd5e1"; });
    if(document.getElementById('muszakDatum')) document.getElementById('muszakDatum').value = toLocalISOString(new Date()); loadUserList(); 
});

async function loadUserList() { try { const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getUsers" }) }); const r = await res.json(); if (r.status === "success" && r.data.length > 0) { const sel = document.getElementById('loginNevSelect'); if(sel) { sel.innerHTML = '<option value="">Válassz a listából...</option>'; r.data.forEach(user => sel.add(new Option(user, user))); sel.add(new Option("--- Egyéb (kézi megadás) ---", "custom")); } } else { document.getElementById('loginNevSelect').style.display = 'none'; document.getElementById('loginNev').style.display = 'block'; } } catch(e) { document.getElementById('loginNevSelect').style.display = 'none'; document.getElementById('loginNev').style.display = 'block'; } }
function checkLoginCustom(sel) { if(sel.value === "custom") { sel.style.display = 'none'; document.getElementById('loginNev').style.display = 'block'; document.getElementById('loginNev').focus(); } else { document.getElementById('loginNev').value = sel.value; } }
function frissitGepek() { const k = document.getElementById('kategoria').value; const s = document.getElementById('gep'); s.innerHTML = '<option value="">Válassz gépet...</option>'; if (k && gepAdatbazis[k]) { if (gepAdatbazis[k].length === 0) { s.add(new Option("Nincs alegység", "-")); } else { s.add(new Option("— Teljes sor / Általános —", "-")); gepAdatbazis[k].forEach(g => s.add(new Option(g, g))); } } }
function frissitSzuroGepek() { const k = document.getElementById('szuroKategoria').value; const s = document.getElementById('szuroGep'); s.innerHTML = '<option value="">Összes gép...</option>'; if (k && gepAdatbazis[k]) { if (gepAdatbazis[k].length === 0) { s.add(new Option("Nincs alegység", "-")); } else { s.add(new Option("— Teljes sor / Általános —", "-")); gepAdatbazis[k].forEach(g => s.add(new Option(g, g))); } } renderClosedTasks(); }
function frissitSzuroNyitottGepek() { const k = document.getElementById('szuroNyitottKategoria').value; const s = document.getElementById('szuroNyitottGep'); s.innerHTML = '<option value="">Összes gép...</option>'; if (k && gepAdatbazis[k]) { if (gepAdatbazis[k].length === 0) { s.add(new Option("Nincs alegység", "-")); } else { s.add(new Option("— Teljes sor / Általános —", "-")); gepAdatbazis[k].forEach(g => s.add(new Option(g, g))); } } renderOpenTasks(); }
function frissitIsmGepek() { const k = document.getElementById('ismKategoria').value; const s = document.getElementById('ismGep'); s.innerHTML = '<option value="">Válassz gépet...</option>'; if (k && gepAdatbazis[k]) { if (gepAdatbazis[k].length === 0) { s.add(new Option("Nincs alegység", "-")); } else { s.add(new Option("— Teljes sor / Általános —", "-")); gepAdatbazis[k].forEach(g => s.add(new Option(g, g))); } } }
async function hashPassword(p) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p)); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''); }

window.onload = async function() {
    const savedUser = localStorage.getItem("activeUser");
    if(savedUser) {
        document.getElementById('currentUserText').innerText = savedUser; sessionRole = localStorage.getItem("activeRole") || "maintenance";
        if (sessionRole === "admin" || sessionRole === "superuser") {
            if(document.getElementById('btnSwitchProd')) document.getElementById('btnSwitchProd').style.display = "block";
            if(document.getElementById('navAdminTab')) document.getElementById('navAdminTab').style.display = "block";
            if(document.getElementById('adminStatsContainer')) document.getElementById('adminStatsContainer').style.display = "block";
        }
        if (sessionRole === "superuser") { if(document.getElementById('dashPaintbrushPanel')) document.getElementById('dashPaintbrushPanel').style.display = "block"; }
        if (sessionRole !== "maintenance" && sessionRole !== "admin" && sessionRole !== "superuser") { if(document.getElementById('shiftLogInputSection')) document.getElementById('shiftLogInputSection').style.display = "none"; }
        document.getElementById('loginView').style.display = 'none'; document.getElementById('appView').style.display = 'block';
	
	    populateNavDropdown();
        checkLockdownAndInit();
        fetchPartsList(); 
    } else { document.getElementById('loginView').style.display = 'block'; document.getElementById('appView').style.display = 'none'; }
};

// --- RAKTÁR KERESŐ ---
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
        let mInfo = p.manuf ? p.manuf : (p.machSup ? p.machSup : "Ismeretlen gyártó");
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

// --- LOCKDOWN ÉS INICIALIZÁLÁS ---
async function checkLockdownAndInit() {
    try {
        const resAll = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getAllData", reszleg: RESZLEG }) }); 
        const rAll = await resAll.json();
        
        if(rAll.status === "success") { 
            globalSchedule = rAll.data.schedule || []; 
            globalBaseWorkers = rAll.data.baseWorkers || []; 
            globalExtraWorkers = rAll.data.extraWorkers || []; 
            globalShiftLogs = rAll.data.shiftLogs || []; 
            expectedApprovers = rAll.data.expectedApprovers || []; 
            
            const isLocked = evaluateLockdown();
            if (isLocked) { 
                document.getElementById('lockdownScreen').style.display = 'block'; document.getElementById('appView').style.display = 'none'; 
            } else {
                document.getElementById('lockdownScreen').style.display = 'none'; document.getElementById('appView').style.display = 'block'; 
                const lastTabId = sessionStorage.getItem("activeAppTab");
                if(lastTabId) { const btn = document.querySelector(`button[onclick*="'${lastTabId}'"]`); if(btn) btn.click(); else loadShiftLogs(); } 
                else { switchTab('muszakatadasView', document.querySelector(`button[onclick*="'muszakatadasView'"]`)); loadShiftLogs(); }
            }
        }
    } catch(e) { document.getElementById('appView').style.display = 'block'; loadShiftLogs(); }
}

function evaluateLockdown() {
    let myUnapprovedCount = 0; let myUnapprovedLogs = [];
    const currentUser = String(localStorage.getItem("activeUser")).trim().toLowerCase();
    let expectedApproversClean = expectedApprovers.map(a => String(a).toLowerCase().trim());
    
    // Csak a D oszlopos Részleg tagokat zároljuk
    if (!expectedApproversClean.includes(currentUser)) return false;

    let now = new Date();
    globalShiftLogs.forEach(l => {
        let logD = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10);
        if (logD >= "2026-09-01") {
            let szamonKerheto = false; let logDateObj = new Date(logD + "T00:00:00"); let muszakVégeH = 0;
            if(String(l.muszak).includes("Délelőtt")) muszakVégeH = 14; 
            else if(String(l.muszak).includes("Délután")) muszakVégeH = 22; 
            else if(String(l.muszak).includes("Éjszaka")) muszakVégeH = 6; 
            
            let vegeIdopont = new Date(logDateObj); 
            if (muszakVégeH === 6) vegeIdopont.setDate(vegeIdopont.getDate() + 1); 
            vegeIdopont.setHours(muszakVégeH, 0, 0, 0);
            
            if (now >= vegeIdopont) { szamonKerheto = true; }
            
            if (szamonKerheto) {
                // Csak akkor követelünk meg jóváhagyást vagy pótlást, ha aznap BE VOLT OSZTVA (nem szabadság)
                let amIScheduled = globalSchedule.some(s => s.datum === logD && String(s.user).toLowerCase() === currentUser && !String(s.tipus).includes("Szabadság"));
                
                if (amIScheduled) {
                    if (l.hianyzo) {
                        myUnapprovedCount++; myUnapprovedLogs.push(l);
                    } else {
                        let approvers = l.jovahagyok ? String(l.jovahagyok).split(',').map(x=>x.trim().toLowerCase()).filter(x=>x) : [];
                        let creatorLower = String(l.felhasznalo).trim().toLowerCase();
                        if (!approvers.includes(creatorLower)) approvers.push(creatorLower);
                        
                        if (!approvers.includes(currentUser)) { 
                            myUnapprovedCount++; myUnapprovedLogs.push(l); 
                        }
                    }
                }
            }
        }
    });

    if (myUnapprovedCount > 0) {
        let listHtml = myUnapprovedLogs.map(l => {
            let logD = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10); const displayDate = new Date(logD).toLocaleDateString('hu-HU', {month:'short', day:'numeric'});
            if (l.hianyzo) {
                return `<div style="background:#fee2e2; padding:15px; border-radius:6px; margin-bottom:10px; border: 1px solid #f87171;">
                    <strong style="font-size:16px; color:var(--pri-crit);">⚠️ HIÁNYZÓ NAPLÓ: ${displayDate} - ${l.muszak}</strong><br>
                    <span style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:8px;">A beosztás alapján dolgoztál, de nem rögzítettek naplót. Pótold most!</span>
                    <textarea id="hianyzoSzoveg_${l.datum}_${l.muszak}" rows="2" placeholder="Írd meg a műszaknaplót..." style="margin-bottom:8px; background:white;"></textarea>
                    <button onclick="submitHianyzoNaplo('${l.datum}', '${l.muszak}')" style="background:var(--pri-normal); border:none; color:white; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer; width:auto;">📝 Hiányzó Napló Beküldése</button>
                </div>`;
            } else {
                return `<div style="background:#f8fafc; padding:15px; border-radius:6px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:flex-start; border: 1px solid var(--border);"><div style="flex:1; padding-right:15px;"><strong style="font-size:16px;">${displayDate} - <span style="color:var(--pri-info);">${l.muszak}</span></strong><br><span style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:8px;">Írta: ${l.felhasznalo}</span><div style="font-size:14px; color:var(--text-main); white-space:pre-wrap; max-height:150px; overflow-y:auto; padding:5px; background:var(--bg-color); border:1px solid #cbd5e1; border-radius:4px;">${String(l.szoveg)}</div></div><button id="lockdownApprBtn_${l.id}" onclick="approveShiftLogLockdown('${l.id}')" style="background:var(--pri-normal); border:none; color:white; padding:10px 20px; border-radius:4px; font-weight:bold; cursor:pointer; width:auto; margin-top:25px;">✅ Jóváhagyom</button></div>`;
            }
        }).join('');
        document.getElementById('unapprovedLogsList').innerHTML = listHtml; return true;
    } return false;
}

async function submitHianyzoNaplo(datum, muszak) {
    let szoveg = document.getElementById(`hianyzoSzoveg_${datum}_${muszak}`).value.trim();
    if(!szoveg) return alert("A napló szövege nem lehet üres!");
    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "addShiftLog", reszleg: RESZLEG, datum: datum, muszak: muszak, szoveg: szoveg, felhasznalo: localStorage.getItem("activeUser") }) });
        const r = await res.json();
        if(r.status === "success") { showToast("Napló sikeresen rögzítve!"); checkLockdownAndInit(); } else { alert(r.message); }
    } catch(e) { alert("Hiba a mentés során!"); }
}

async function approveShiftLogLockdown(id) {
    const btn = document.getElementById('lockdownApprBtn_' + id); if(btn) { btn.disabled = true; btn.innerText = "⏳ Töltés..."; }
    await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "approveShiftLog", reszleg: RESZLEG, id: id, felhasznalo: String(localStorage.getItem("activeUser")).trim() }) });
    showToast("Jóváhagyva!"); checkLockdownAndInit(); 
}

function switchTab(tId, btn) { document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active')); document.getElementById(tId).classList.add('active'); if(btn) btn.classList.add('active'); sessionStorage.setItem("activeAppTab", tId); }

async function login() { 
    let n = document.getElementById('loginNevSelect').value !== "custom" && document.getElementById('loginNevSelect').value !== "" ? document.getElementById('loginNevSelect').value : document.getElementById('loginNev').value; 
    const j = document.getElementById('loginJelszo').value; 
    if(!n || !j) return alert("Add meg az adatokat!"); 
    document.getElementById('loginStatus').innerText = "Ellenőrzés..."; 
    try { 
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "login", nev: n, jelszo: await hashPassword(j) }) }); 
        const r = await res.json(); 
        if(r.status === "success") { 
            localStorage.setItem("activeUser", n); 
            localStorage.setItem("activeRole", r.role || "maintenance"); 
            location.reload(); 
        } else { 
            document.getElementById('loginStatus').innerText = r.message; 
        } 
    } catch(e) { document.getElementById('loginStatus').innerText = "Hiba!"; } 
}

function logout() { 
    localStorage.removeItem("activeUser"); 
    localStorage.removeItem("activeRole"); 
    sessionStorage.clear(); 
    window.location.href = window.location.pathname; 
}

async function processVideo(file) { return new Promise((resolve) => { if (file.size > 15*1024*1024) { alert("Túl nagy videó!"); resolve(null); return; } const reader = new FileReader(); reader.onload = (e) => { resolve({ base64: e.target.result.split(',')[1], tipus: file.type }); }; reader.readAsDataURL(file); }); }
async function compressImage(file) { return new Promise((resolve) => { const reader = new FileReader(); reader.onload = (e) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); const scale = 1024 / img.width; canvas.width = 1024; canvas.height = img.height * scale; canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); resolve({ base64: canvas.toDataURL('image/jpeg', 0.7).split(',')[1], tipus: 'image/jpeg' }); }; img.src = e.target.result; }; reader.readAsDataURL(file); }); }
async function feldolgozUjKep(input) { if (input.files.length === 0) return; const el = document.getElementById('kepElonezet'); document.getElementById('uresKepSzoveg').style.display = 'none'; for (let file of input.files) { if (file.type.startsWith('video/')) { let t = await processVideo(file); if (t) { feltoltendoKepek.push(t); let vid = document.createElement('video'); vid.src = URL.createObjectURL(file); vid.style.width = "40px"; vid.style.height = "40px"; vid.style.objectFit = "cover"; el.appendChild(vid); } } else { let t = await compressImage(file); feltoltendoKepek.push(t); let img = document.createElement('img'); img.src = "data:image/jpeg;base64," + t.base64; img.style.width = "40px"; img.style.height = "40px"; img.style.objectFit = "cover"; el.appendChild(img); } } input.value = ""; }

async function submitTask() {
    const k = document.getElementById('kategoria').value, g = document.getElementById('gep').value, h = document.getElementById('hiba').value;
    if (!k || !g || !h) { alert("Töltsd ki!"); return; }
    const btn = document.getElementById('btnSubmit'); btn.disabled = true; const gepMentve = (g === "-") ? k : k + " - " + g;
    let payload = { action: "addTask", felhasznalo: localStorage.getItem("activeUser"), gep: gepMentve, hiba: h, prioritas: document.getElementById('prioritasLegordulo').value, megoldas: document.getElementById('megoldas').value, ido: document.getElementById('ido').value, downtime: document.getElementById('downtime').value, kepek: feltoltendoKepek };
    try { const r = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) }); if((await r.json()).status === "success") { showToast("Rögzítve!"); document.getElementById('hiba').value = ''; document.getElementById('megoldas').value = ''; document.getElementById('ido').value = ''; document.getElementById('downtime').value = ''; feltoltendoKepek = []; document.getElementById('kepElonezet').innerHTML = '<span id="uresKepSzoveg">Nincs fájl csatolva.</span>'; loadTasks(); } } catch(e) { showToast("Hiba!", true); } finally { btn.disabled = false; }
}

async function loadTasks() {
    const otc = document.getElementById('openTasksContainer'); if(otc) otc.innerHTML = "Betöltés...";
    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getTasks", reszleg: RESZLEG }) }); const r = await res.json();
        if(r.status === "success") {
            globalOpenTasks = []; globalClosedTasks = [];
            r.data.forEach(t => { 
                let isPrev = String(t.id).startsWith("PREV-") || String(t.id).includes("REC-");
                if (isPrev && String(t.id).toUpperCase().includes("PROD")) return;
                if(t.prioritas==="Igen") t.prioritas="Magas prioritás"; if(t.prioritas==="Nem") t.prioritas="Normál"; 
                if(t.statusz!=="Lezárt") globalOpenTasks.push(t); else globalClosedTasks.push(t); 
            });
            const w = {"Termelésleállás":4, "Magas prioritás":3, "Normál":2, "Megfigyelés alatt":1.5, "Informatív":1}; 
            globalOpenTasks.sort((a,b)=> (w[String(b.prioritas)]||0)-(w[String(a.prioritas)]||0));
            renderOpenTasks(); renderClosedTasks(); calcStats(); lastKnownTaskCount = globalOpenTasks.length;
        } else { if(otc) otc.innerHTML = "Hiba a letöltés során: " + r.message; }
    } catch(e) { console.error(e); }
}

async function startTask(id) { await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "startTask", id: id, felhasznalo: localStorage.getItem("activeUser") }) }); showToast("Elkezdve!"); loadTasks(); }
async function changeTaskPriority(id, newVal) { if(!confirm("Átállítod?")) { loadTasks(); return; } await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "changePriority", id: id, ujPrioritas: newVal }) }); showToast("Módosítva!"); loadTasks(); }

function addAlkatreszRowIndex(taskId) {
    const container = document.getElementById(`alkatreszekContainer_${taskId}`);
    if(!container) return;
    const row = document.createElement('div');
    row.className = `alkatresz-sor-${taskId}`;
    row.style.cssText = "display:flex; gap:6px; margin-bottom:4px; align-items:center;";
    let rId = Math.floor(Math.random()*100000);
    row.innerHTML = `
        <div style="flex:3; display:flex; margin:0; border: 1px solid var(--border); border-radius:3px; overflow:hidden;">
            <input type="text" id="alk_cikk_${taskId}_${rId}" class="alk-cikkszam-${taskId}" placeholder="Cikkszám" style="flex:1; font-size:13px; padding:6px; margin:0; border:none; outline:none; min-width:80px;">
            <button type="button" onclick="openPartsModal('alk_cikk_${taskId}_${rId}')" style="background:var(--pri-obs); color:white; border:none; padding:0; width:35px; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center;">🔍</button>
        </div>
        <input type="number" class="alk-db-${taskId}" placeholder="Db" style="flex:1; font-size:12px; padding:6px; margin:0; min-width:40px;">
        <button type="button" onclick="this.parentElement.remove()" style="background:#ef4444; color:white; border:none; width:32px; height:32px; border-radius:3px; cursor:pointer; font-weight:bold; padding:0; display:flex; justify-content:center; align-items:center;">✕</button>
    `;
    container.appendChild(row);
}

async function closeTask(id) { 
    const m = document.getElementById(`megoldas_${id}`).value;
    const i = document.getElementById(`ido_${id}`).value;
    const dt = document.getElementById(`downtime_${id}`).value; 
    
    let alkatreszekTomb = [];
    document.querySelectorAll(`.alkatresz-sor-${id}`).forEach(sor => {
        let cz = sor.querySelector(`.alk-cikkszam-${id}`).value.trim();
        let db = sor.querySelector(`.alk-db-${id}`).value.trim();
        if(cz && db) { alkatreszekTomb.push({ cikkszam: cz, db: parseInt(db) || 1 }); }
    });

    if(!m) return alert("Megoldás kötelező!"); 
    
    await fetch(SCRIPT_URL, { 
        method: "POST", 
        body: JSON.stringify({ action: "closeTask", id: id, megoldas: m, ido: i, downtime: dt, lezarta: localStorage.getItem("activeUser"), alkatreszek: alkatreszekTomb }) 
    }); 
    showToast("Lezárva!"); loadTasks(); 
}

async function reopenTask(id) { if(!confirm("Újranyitod?")) return; await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "reopenTask", id: id, felhasznalo: localStorage.getItem("activeUser") }) }); showToast("Újranyitva!"); loadTasks(); }
async function deleteTask(id) { if(!confirm("Törlöd?")) return; await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "deleteTask", id: id }) }); showToast("Törölve!"); loadTasks(); }
async function mergeTask(sourceId) { const targetId = prompt("CÉL hibajegy azonosítója:"); if (!targetId) return; if(!confirm("Egyesíted?")) return; await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "mergeTask", sourceId: sourceId, targetId: targetId.trim().toUpperCase() }) }); showToast("Egyesítve!"); loadTasks(); }
async function sendExtraInfo(id) { const t = document.getElementById(`extraText_${id}`).value, fi = document.getElementById(`extraKep_${id}`); if (!t && fi.files.length === 0) return; let p = { action: "appendInfo", id: id, felhasznalo: localStorage.getItem("activeUser"), szoveg: t, kepek: [] }; if (fi.files.length > 0) { let promises = Array.from(fi.files).map(f => f.type.startsWith('video/') ? processVideo(f) : compressImage(f)); p.kepek = (await Promise.all(promises)).filter(x => x !== null); } await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(p) }); showToast("Hozzáadva!"); loadTasks(); }

function getFilteredOpenTasks() {
    const srEl = document.getElementById('szuroNyitottReszleg'); const sr = srEl ? srEl.value : "";
    const ismSzuroEl = document.getElementById('szuroNyitottIsmetlodo'); const ismSzuro = ismSzuroEl ? ismSzuroEl.value : "";
    const skEl = document.getElementById('szuroNyitottKategoria'); const sk = skEl ? skEl.value : "";
    const sgEl = document.getElementById('szuroNyitottGep'); const sg = sgEl ? sgEl.value : "";
    const szovEl = document.getElementById('szuroNyitottSzoveg'); const szov = szovEl ? szovEl.value.toLowerCase() : "";
    const prioEl = document.getElementById('szuroNyitottPrioritas'); const prio = prioEl ? prioEl.value : "";
    return globalOpenTasks.filter(t => { 
        let matchReszleg = true; if(sr === "termeles") matchReszleg = String(t.id).includes("PROD-"); else if(sr === "karbantartas") matchReszleg = !String(t.id).includes("PROD-");
        const isPrev = String(t.id || "").startsWith("PREV-"); let matchIsm = true; if (ismSzuro === "normal") matchIsm = !isPrev; if (ismSzuro === "ismetlodo") matchIsm = isPrev; 
        let gepNev = (sg === "-") ? sk : sk + " - " + sg; let matchKat = sk ? (String(t.gep || "").startsWith(sk+" - ") || t.gep===sk) : true; let matchGep = sg ? t.gep===gepNev : true; let matchPrio = prio ? t.prioritas === prio : true;
        let matchSzoveg = szov ? (String(t.hiba).toLowerCase().includes(szov) || String(t.gep).toLowerCase().includes(szov) || String(t.felhasznalo).toLowerCase().includes(szov)) : true;
        return matchReszleg && matchIsm && matchKat && matchGep && matchSzoveg && matchPrio; 
    });
}
function renderOpenTasks() { const f = getFilteredOpenTasks(); let h = ""; f.forEach(t => h += genCard(t)); const c = document.getElementById('openTasksContainer'); if(c) c.innerHTML = h || "Nincs találat."; }

function getFilteredClosedTasks() {
    const srEl = document.getElementById('szuroLezartReszleg'); const sr = srEl ? srEl.value : "";
    const skEl = document.getElementById('szuroKategoria'), sgEl = document.getElementById('szuroGep'), stEl = document.getElementById('filterDatumTol'), siEl = document.getElementById('filterDatumIg'), ismEl = document.getElementById('szuroLezartIsmetlodo');
    const sk = skEl ? skEl.value : "", sg = sgEl ? sgEl.value : "", st = stEl ? stEl.value : "", si = siEl ? siEl.value : "", ism = ismEl ? ismEl.value : "";
    const szovEl = document.getElementById('szuroLezartSzoveg'); const szov = szovEl ? szovEl.value.toLowerCase() : "";
    const prioEl = document.getElementById('szuroLezartPrioritas'); const prio = prioEl ? prioEl.value : "";
    return globalClosedTasks.filter(t => { 
        let matchReszleg = true; if(sr === "termeles") matchReszleg = String(t.id).includes("PROD-"); else if(sr === "karbantartas") matchReszleg = !String(t.id).includes("PROD-");
        const d = String(t.idopont || "").substring(0, 10); let gepNev = (sg === "-") ? sk : sk + " - " + sg; let matchKat = sk ? (String(t.gep || "").startsWith(sk+" - ") || t.gep===sk) : true; let matchGep = sg ? t.gep===gepNev : true; let matchTol = st ? d>=st : true; let matchIg = si ? d<=si : true;
        let matchIsm = true; const isPrev = String(t.id || "").startsWith("PREV-"); if (ism === "normal") matchIsm = !isPrev; if (ism === "ismetlodo") matchIsm = isPrev;
        let matchPrio = prio ? t.prioritas === prio : true; let matchSzoveg = szov ? (String(t.hiba).toLowerCase().includes(szov) || String(t.megoldas).toLowerCase().includes(szov) || String(t.gep).toLowerCase().includes(szov) || String(t.felhasznalo).toLowerCase().includes(szov)) : true;
        return matchReszleg && matchKat && matchGep && matchTol && matchIg && matchIsm && matchSzoveg && matchPrio; 
    });
}
function renderClosedTasks() { const f = getFilteredClosedTasks(); const c = document.getElementById('closedTasksContainer'); if(!c) return; if(f.length===0){c.innerHTML="Nincs találat."; return;} let h = ""; f.forEach(t => h += genCard(t)); c.innerHTML = h; }

function genCard(t) {
    const dateStr = new Date(t.idopont).toLocaleString('hu-HU', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
    const pr = String(t.prioritas || "").replace(" prioritás", "").replace("ással járó", "");
    let bC = "badge-normal", eC = ""; const pLower = String(t.prioritas || "").toLowerCase();
    if(t.statusz==="Lezárt") { bC="badge-closed"; eC="closed"; } else { if(pLower.includes("leállás")) {bC="badge-crit"; eC="Termelésleállás";} else if(pLower.includes("magas")) {bC="badge-high"; eC="Magas";} else if(pLower.includes("megfigyelés")) {bC="badge-obs"; eC="Megfigyelés";} else if(pLower.includes("informatív")) {bC="badge-info"; eC="Informatív";} if(t.statusz==="Folyamatban") eC="Folyamatban"; }
    
    let kH = ""; 
    if (t.kepek) { 
        kH += `<div class="img-container">`; 
        String(t.kepek).split(",").forEach(u => { 
            if(u.trim()) { 
                const m = u.match(/id=([^&]+)/) || u.match(/d\/([a-zA-Z0-9_-]+)/); 
                const viewUrl = m ? `https://drive.google.com/file/d/${m[1]}/view` : u.trim(); 
                const imgSrc = m ? `https://lh3.googleusercontent.com/d/${m[1]}` : u.trim();
                const fb = `<a href="${viewUrl}" target="_blank" style="display:inline-block; background:var(--pri-normal); color:white; padding:6px 12px; border-radius:4px; text-decoration:none; font-size:12px; font-weight:bold;">📷 Kép megnyitása</a>`.replace(/"/g, '&quot;');
                kH += `<div style="margin-bottom:8px;"><img src="${imgSrc}" loading="lazy" style="max-width:100%; max-height:150px; border-radius:4px; cursor:pointer;" onclick="window.open('${viewUrl}', '_blank')" onerror="this.outerHTML='${fb}'"></div>`; 
            } 
        }); 
        kH += `</div>`; 
    }

    let clHtml = ""; if (t.checklist) { let items = String(t.checklist).split('\n').filter(i => i.trim() !== "").map(i => `<li>${i}</li>`).join(''); clHtml = `<div class="checklist-box"><strong>📝 Teendők:</strong><ul>${items}</ul></div>`; }
    let prevIcon = String(t.id || "").startsWith("PREV-") ? "🔁 " : ""; let reszlegIcon = String(t.id).includes("PROD-") ? "🏭 " : "🔧 ";
    let reopenBtn = "", adminBtns = "", role = String(localStorage.getItem("activeRole")).toLowerCase();
    if (t.statusz === "Lezárt" && !String(t.id).startsWith("PREV-")) { reopenBtn = `<button onclick="reopenTask('${t.id}')" style="background:var(--pri-high); padding:4px 8px; width:auto; margin:0; font-size:11px; border:none; color:white; border-radius:3px;">🔄 Újranyitás</button>`; }
    if (role === "superuser" && !String(t.id).startsWith("PREV-")) { adminBtns = `<button onclick="mergeTask('${t.id}')" style="background:var(--pri-obs); padding:4px 8px; width:auto; margin:0; font-size:11px; border:none; color:white; border-radius:3px;">🔗 Egyesítés</button><button onclick="deleteTask('${t.id}')" style="background:var(--pri-crit); padding:4px 8px; width:auto; margin:0; font-size:11px; border:none; color:white; border-radius:3px;">🗑️ Törlés</button>`; }
    let prioSelectHtml = ""; if (t.statusz !== "Lezárt") { prioSelectHtml = `<select id="prio_${t.id}" onchange="changeTaskPriority('${t.id}', this.value)" style="width:auto; font-size:10px; padding:2px; margin:0; border:1px solid var(--border); border-radius:3px;"><option value="Informatív" ${pr==='Informatív'?'selected':''}>Informatív</option><option value="Megfigyelés alatt" ${pr==='Megfigyelés alatt'?'selected':''}>Megfigyelés</option><option value="Normál" ${pr==='Normál'?'selected':''}>Normál</option><option value="Magas prioritás" ${pLower.includes('magas')?'selected':''}>Magas</option><option value="Termelésleállás" ${pLower.includes('leállás')?'selected':''}>Leállás</option></select>`; }
    let aH = `<div style="margin-top: 10px; border-top: 1px dashed var(--border); padding-top: 10px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:5px;"><button onclick="if(document.getElementById('appF_${t.id}')) document.getElementById('appF_${t.id}').style.display='block';" class="btn-secondary" style="padding:4px 8px; width:auto; margin:0; font-size:11px;">+ Infó</button><div style="display:flex; gap:5px; flex-wrap:wrap;">${adminBtns}${reopenBtn}</div></div><div id="appF_${t.id}" style="display:none; margin-top:10px;"><textarea id="extraText_${t.id}" rows="2" placeholder="Megjegyzés..."></textarea><input type="file" id="extraKep_${t.id}" accept="image/*,video/*" multiple><button onclick="sendExtraInfo('${t.id}')">Hozzáadás</button></div>`;

    if(t.statusz!=="Lezárt") {
        let wH = t.statusz==="Folyamatban" ? `<div class="work-in-progress-bar"><span>👷</span> <b>${t.felelos}</b> dolgozik rajta</div>` : `<button class="btn-start" onclick="startTask('${t.id}')" style="margin-bottom:10px;">▶️ Munkát elkezdem</button>`; let pB = t.statusz==="Folyamatban" ? `<span class="badge badge-prog" style="margin-left:5px;">Folyamatban</span>` : "";
        
        return `<div class="task-card ${eC}"><div class="task-header"><div><span>${dateStr}</span> <span style="color:var(--text-muted); font-size:11px; margin-left:6px;">#${t.id}</span></div><div style="display:flex; gap:5px; align-items:center;">${prioSelectHtml} <span class="badge ${bC}" style="display:none;">${pr}</span>${pB}</div></div><div class="task-title">${reszlegIcon}${prevIcon}${t.gep}</div><div style="margin-bottom:5px; white-space:pre-wrap;">${t.hiba}</div>${clHtml}${kH}<div style="font-size:11px; color:var(--text-muted); margin-bottom:10px;">Beküldte: <b>${t.felhasznalo}</b></div><div style="margin-top:auto;">${wH}<div style="background:var(--bg-color); padding:10px; border-radius:4px;"><input type="text" id="megoldas_${t.id}" placeholder="Megoldás..." style="margin-bottom:5px;"><div id="alkatreszekContainer_${t.id}" style="margin-bottom:5px;"><div class="alkatresz-sor-${t.id}" style="display:flex; gap:6px; margin-bottom:4px; align-items:center;"><div style="flex:3; display:flex; margin:0; border: 1px solid var(--border); border-radius:3px; overflow:hidden;"><input type="text" id="alk_cikk_${t.id}_0" class="alk-cikkszam-${t.id}" placeholder="Cikkszám" style="flex:1; font-size:13px; padding:6px; margin:0; border:none; outline:none; min-width:80px;"><button type="button" onclick="openPartsModal('alk_cikk_${t.id}_0')" style="background:var(--pri-obs); color:white; border:none; padding:0; width:35px; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center;">🔍</button></div><input type="number" class="alk-db-${t.id}" placeholder="Db" style="flex:1; font-size:12px; padding:6px; margin:0; min-width:40px;"></div></div><button type="button" onclick="addAlkatreszRowIndex('${t.id}')" style="background:var(--pri-info); color:white; border:none; padding:3px 8px; border-radius:3px; font-size:11px; cursor:pointer; font-weight:bold; margin-bottom:8px; width:auto;">➕ Alkatrész</button><div style="display:flex; gap:10px; margin-bottom:5px;"><input type="number" id="ido_${t.id}" step="1" placeholder="Javítás (perc)"><input type="number" id="downtime_${t.id}" step="1" placeholder="Kiesés (perc)"></div><button onclick="closeTask('${t.id}')">Jegy lezárása</button></div></div>${aH}</div>`;
    } else {
        let dtTxt = t.downtime ? ` (Kiesés: ${t.downtime} perc)` : "";
        return `<div class="task-card closed"><div class="task-header"><div><span>${dateStr}</span> <span style="color:var(--text-muted); font-size:11px; margin-left:6px;">#${t.id}</span></div><span class="badge badge-closed">Lezárt</span></div><div class="task-title" style="color:var(--text-muted);">${reszlegIcon}${prevIcon}${t.gep}</div><div style="margin-bottom:5px; white-space:pre-wrap;">${t.hiba}</div>${clHtml}${kH}<div style="margin-bottom:10px; color:var(--pri-normal);"><b>Megoldás:</b><br>${String(t.megoldas||"").replace(/\n/g, '<br>')} <span style="color:var(--text-muted);">(${t.ido||0} perc${dtTxt})</span></div><div class="font-size:11px; color:var(--text-muted); background:var(--bg-color); padding:8px; border-radius:4px; margin-top:auto;"><div>Beküldte: ${t.felhasznalo}</div><div>Lezárta: ${t.lezarta}</div></div>${aH}</div>`;
    }
}

async function loadShiftLogs() {
    const c = document.getElementById('shiftLogsContainer'); if(!c) return; c.innerHTML = "Betöltés...";
    try { const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getShiftLogs", reszleg: RESZLEG }) }); const r = await res.json(); if(r.status === "success") { globalShiftLogs = r.data; renderShiftLogs(); } } catch(e) {}
}
async function submitShiftLog() {
    const d = document.getElementById('muszakDatum').value, m = document.getElementById('muszakTipus').value, s = document.getElementById('muszakSzoveg').value;
    if (!d || !s) { alert("Dátum és szöveg kötelező!"); return; } const btn = document.getElementById('btnShiftLog'); btn.disabled = true;
    try { const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "addShiftLog", reszleg: RESZLEG, datum: d, muszak: m, szoveg: s, felhasznalo: localStorage.getItem("activeUser") }) }); const r = await res.json(); if(r.status === "success") { showToast("Napló mentve!"); document.getElementById('muszakSzoveg').value = ''; loadShiftLogs(); } else { alert(r.message); } } catch(e) {} finally { btn.disabled = false; }
}
function filterShiftLogs() { renderShiftLogs(); }
function renderShiftLogs() {
    const c = document.getElementById('shiftLogsContainer'); if(!c) return;
    const sUser = document.getElementById('szuroMuszakUser').value.toLowerCase(), sTipus = document.getElementById('szuroMuszakTipus').value, sTol = document.getElementById('szuroMuszakDatumTol').value, sIg = document.getElementById('szuroMuszakDatumIg').value;
    let f = globalShiftLogs.filter(l => { 
        let d = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10); 
        return (String(l.felhasznalo).toLowerCase().includes(sUser) || String(l.szoveg).toLowerCase().includes(sUser)) && 
               (sTipus ? String(l.muszak).includes(sTipus) : true) && 
               (sTol ? d >= sTol : true) && (sIg ? d <= sIg : true); 
    });
    if(f.length === 0) { c.innerHTML = "Nincs találat."; return; } let h = "";
    f.forEach(l => {
        let logD = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10); const dateStr = new Date(logD).toLocaleDateString('hu-HU', {month:'short', day:'numeric'});
        let approvers = l.jovahagyok ? String(l.jovahagyok).split(',').map(x=>x.trim()).filter(x=>x) : []; let statusHtml = "";
        if (approvers.length > 0) statusHtml = `<div style="margin-top:10px; font-size:11px; color:var(--pri-normal);"><b style="color:var(--text-muted);">Látta:</b> ${approvers.join(', ')}</div>`; else statusHtml = `<div style="margin-top:10px; font-size:11px; color:var(--pri-crit);">Még senki nem látta!</div>`;
        h += `<div class="task-card" style="border-left-color: var(--pri-info);"><div class="task-header"><span class="badge badge-info">${l.muszak}</span><span style="font-weight:bold; color:var(--text-muted);">${dateStr}</span></div><div style="white-space:pre-wrap; font-size:14px; margin-bottom:10px;">${l.szoveg}</div><div style="font-size:12px; color:var(--text-muted); border-top:1px solid var(--border); padding-top:10px;">Írta: <b>${l.felhasznalo}</b></div>${statusHtml}</div>`;
    }); c.innerHTML = h;
}
function exportShiftLogs() {
    let csv = "Dátum;Műszak;Írta;Szöveg;Jóváhagyók\n"; globalShiftLogs.forEach(l => { let logD = l.datum ? String(l.datum).substring(0, 10) : String(l.idopont).substring(0, 10); csv += `"${logD}";"${l.muszak}";"${l.felhasznalo}";"${String(l.szoveg).replace(/"/g,'""')}";"${l.jovahagyok||""}"\n`; });
    let a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff"+csv], {type:'text/csv;charset=utf-8;'})); a.download = "Muszaknaplo_Export.csv"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function setBrush(tipus, btnObj) { activeBrush = tipus; document.querySelectorAll('.brush-btn').forEach(b => { b.style.outline = 'none'; b.style.transform = 'scale(1)'; }); btnObj.style.outline = '3px solid var(--pri-info)'; btnObj.style.transform = 'scale(1.1)'; document.getElementById('activeBrushDisplay').innerText = "Aktív: " + tipus; }
function paintCell(user, dateStr, tdId) {
    if(!activeBrush || sessionRole !== 'superuser') return;
    if (activeBrush === 'Ügyelet') { if (user === '__UGYELET__') return; let topTdId = tdId.replace(`maincell_${user.replace(/\s+/g,'_')}`, 'maincell___UGYELET__'); let topEl = document.getElementById(topTdId); if (topEl) { topEl.innerText = user; topEl.className = 'sched-cell cell-ugy hoverable'; } let existingIdx = paintedChanges.findIndex(x => x.user === '__UGYELET__' && x.datum === dateStr); if(existingIdx > -1) paintedChanges[existingIdx].tipus = user; else paintedChanges.push({ user: '__UGYELET__', datum: dateStr, tipus: user }); return; }
    if (activeBrush === 'Törlés' && user === '__UGYELET__') { let el = document.getElementById(tdId); if(el) { el.innerText = ''; el.className = 'sched-cell hoverable'; } let existingIdx = paintedChanges.findIndex(x => x.user === '__UGYELET__' && x.datum === dateStr); if(existingIdx > -1) paintedChanges[existingIdx].tipus = 'Törlés'; else paintedChanges.push({ user: '__UGYELET__', datum: dateStr, tipus: 'Törlés' }); return; }
    if (user === '__UGYELET__') return;
    let cls = '', text = '';
    if(activeBrush === 'Délelőtt') { cls = 'cell-MS'; text = 'Délelőtt'; } else if(activeBrush === 'Délután') { cls = 'cell-AS'; text = 'Délután'; } else if(activeBrush === 'Éjszaka') { cls = 'cell-NS'; text = 'Éjszaka'; } else if(activeBrush === 'Szabadság') { cls = 'cell-H'; text = 'Szabadság'; } else if(activeBrush === 'Nappal' || activeBrush === 'Nappali' || activeBrush === 'Pihenő') { cls = 'cell-O'; text = 'Nappal'; } else if(activeBrush === 'Törlés') { cls = ''; text = ''; }
    let el = document.getElementById(tdId); if(el) { el.className = 'sched-cell hoverable ' + cls; el.innerText = text; }
    let existingIdx = paintedChanges.findIndex(x => x.user === user && x.datum === dateStr); if(existingIdx > -1) paintedChanges[existingIdx].tipus = activeBrush; else paintedChanges.push({ user: user, datum: dateStr, tipus: activeBrush });
}
async function savePaintedSchedule() {
    if(paintedChanges.length === 0) return; const btn = document.getElementById('btnSaveSchedule'); btn.innerText = "⏳..."; btn.disabled = true;
    let groups = {}; paintedChanges.forEach(ch => { let key = ch.user + "|" + ch.tipus; if(!groups[key]) groups[key] = []; groups[key].push(ch.datum); });
    try { for(let key in groups) { let [u, t] = key.split("|"); await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "addScheduleBulk", reszleg: RESZLEG, dates: groups[key], user: u, tipus: t }) }); } paintedChanges = []; activeBrush = null; document.getElementById('activeBrushDisplay').innerText = "Aktív: Nincs"; showToast("Beosztás módosítva!"); loadSchedule(); } catch(e) { showToast("Hiba!", true); } finally { btn.innerText = "💾 Mentés"; btn.disabled = false; }
}

async function loadSchedule() {
    const c = document.getElementById('scheduleContainer'); if(!c) return; c.innerHTML = "Betöltés...";
    try { const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getSchedule", reszleg: RESZLEG }) }); const r = await res.json(); if(r.status === "success") { globalSchedule = r.data; globalBaseWorkers = r.baseWorkers || []; globalExtraWorkers = r.extraWorkers || []; renderScheduleMain(); } } catch(e) {}
}

function renderScheduleMain() {
    const c = document.getElementById('scheduleContainer'); 
    
    let uniqueBase = new Set([...globalBaseWorkers]); 
    let usersBase = Array.from(uniqueBase).sort();
    
    let uniqueExtra = new Set([...globalExtraWorkers]); 
    let usersExtra = Array.from(uniqueExtra).sort();
    
    if(usersBase.length === 0 && usersExtra.length === 0) { c.innerHTML = "<div style='text-align:center; padding:30px;'>Nincs dolgozó.</div>"; return; }
    
    let now = new Date(); let dayOfWeek = now.getDay() || 7; let startDate = new Date(now); startDate.setDate(now.getDate() - dayOfWeek + 1 - 7); 
    let dates = []; for(let i=0; i<35; i++){ let d = new Date(startDate); d.setDate(startDate.getDate() + i); dates.push(d); }
    let html = `<div class="sched-container"><table class="sched-table"><thead><tr><th class="sticky-col">Név / Dátum</th>`;
    dates.forEach(d => { let isWorking = isWorkDay(d); let bg = !isWorking ? 'background:rgba(0,0,0,0.05); color:#94a3b8;' : ''; let dStr = d.toLocaleDateString('hu-HU', {month:'short', day:'numeric'}); let isToday = (toLocalISOString(d) === toLocalISOString(now)); if(isToday) bg += 'border-bottom:3px solid var(--pri-high); color:var(--pri-high); font-weight:bold;'; html += `<th style="${bg}">${dStr}</th>`; });
    html += `</tr></thead><tbody>`; let ptr = (sessionRole === 'superuser') ? 'cursor:pointer; hoverable' : '';
    
    html += `<tr><td class="sticky-col" style="color:var(--pri-crit);">📞 Ügyeletes</td>`;
    dates.forEach(d => {
        let isWorking = isWorkDay(d); let bg = !isWorking ? 'background:rgba(0,0,0,0.15);' : ''; let dIso = toLocalISOString(d); let match = globalSchedule.find(s => s.datum === dIso && s.user === '__UGYELET__'); let text = match ? match.tipus : ''; let cls = match ? 'cell-ugy' : '';
        let tdId = `maincell___UGYELET___${dIso}`; let clickAttr = (sessionRole === 'superuser') ? `onclick="paintCell('__UGYELET__', '${dIso}', '${tdId}')"` : ''; html += `<td id="${tdId}" class="sched-cell ${cls} ${ptr}" style="${bg}" ${clickAttr}>${text}</td>`;
    }); html += `</tr>`;
    
    // KARBANTARTÁS DOLGOZÓI
    usersBase.forEach(u => {
        html += `<tr><td class="sticky-col" style="color:var(--text-main); font-weight:bold;">${u}</td>`;
        dates.forEach(d => {
            let isWorking = isWorkDay(d); let bg = !isWorking ? 'background:rgba(0,0,0,0.15);' : ''; let dIso = toLocalISOString(d); let match = globalSchedule.find(s => s.datum === dIso && s.user === u && s.user !== '__UGYELET__'); let tipus = match ? match.tipus : ''; let cls = ''; let text = '';
            if(tipus === 'Délelőtt') { cls = 'cell-MS'; text = 'Délelőtt'; } else if(tipus === 'Délután') { cls = 'cell-AS'; text = 'Délután'; } else if(tipus === 'Éjszaka') { cls = 'cell-NS'; text = 'Éjszaka'; } else if(tipus === 'Szabadság') { cls = 'cell-H'; text = 'Szabadság'; } else if(tipus === 'Nappal' || tipus === 'Nappali' || tipus === 'Pihenő') { cls = 'cell-O'; text = 'Nappal'; }
            let tdId = `maincell_${u.replace(/\s+/g,'_')}_${dIso}`; let clickAttr = (sessionRole === 'superuser') ? `onclick="paintCell('${u}', '${dIso}', '${tdId}')"` : ''; html += `<td id="${tdId}" class="sched-cell ${cls} ${ptr}" style="${bg}" ${clickAttr}>${text}</td>`;
        }); html += `</tr>`;
    }); 
    
    // TERMELÉS DOLGOZÓI
    if (usersExtra.length > 0) {
        html += `<tr><td class="sticky-col" style="background:#f1f5f9; color:var(--text-muted); font-size:12px; text-align:center;" colspan="36">-- TERMELÉS DOLGOZÓI --</td></tr>`;
        usersExtra.forEach(u => {
            html += `<tr><td class="sticky-col" style="color:var(--text-main); font-weight:bold;">${u}</td>`;
            dates.forEach(d => {
                let isWorking = isWorkDay(d); let bg = !isWorking ? 'background:rgba(0,0,0,0.15);' : ''; let dIso = toLocalISOString(d); let match = globalSchedule.find(s => s.datum === dIso && s.user === u && s.user !== '__UGYELET__'); let tipus = match ? match.tipus : ''; let cls = ''; let text = '';
                if(tipus === 'Délelőtt') { cls = 'cell-MS'; text = 'Délelőtt'; } else if(tipus === 'Délután') { cls = 'cell-AS'; text = 'Délután'; } else if(tipus === 'Éjszaka') { cls = 'cell-NS'; text = 'Éjszaka'; } else if(tipus === 'Szabadság') { cls = 'cell-H'; text = 'Szabadság'; } else if(tipus === 'Nappal' || tipus === 'Nappali' || tipus === 'Pihenő') { cls = 'cell-O'; text = 'Nappal'; }
                let tdId = `maincell_${u.replace(/\s+/g,'_')}_${dIso}`; let clickAttr = (sessionRole === 'superuser') ? `onclick="paintCell('${u}', '${dIso}', '${tdId}')"` : ''; html += `<td id="${tdId}" class="sched-cell ${cls} ${ptr}" style="${bg}" ${clickAttr}>${text}</td>`;
            }); html += `</tr>`;
        });
    }

    html += `</tbody></table></div>`; c.innerHTML = html;
}

async function addScheduleWorker() { const inp = document.getElementById('ujBeosztasDolgozo'); const nev = inp.value.trim(); if(!nev) return alert("Add meg a nevet!"); await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "addScheduleWorkerOnly", reszleg: RESZLEG, nev: nev }) }); inp.value = ""; showToast("Hozzáadva!"); loadSchedule(); }
async function deleteScheduleWorker(nev) { if(!confirm(`Törlöd?`)) return; await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "deleteScheduleWorkerOnly", reszleg: RESZLEG, nev: nev }) }); showToast("Törölve!"); loadSchedule(); }

async function loadRecurringTasks() {
    const c = document.getElementById('recurringTasksContainer'); if(!c) return; c.innerHTML = "Betöltés...";
    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getRecurringTasks", reszleg: RESZLEG }) }); const r = await res.json();
        if(r.status === "success") {
            if(r.data.length === 0) { c.innerHTML = "Nincs ismétlődő feladat."; return; } let h = "";
            r.data.forEach(t => {
                let clHtml = t.checklist ? `<div style="font-size:13px; color:var(--text-muted); margin-bottom:10px;"><b>📝 Checklist:</b><br>${String(t.checklist).replace(/\n/g, '<br>')}</div>` : '';
                let safeChecklist = String(t.checklist || "").replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, "\\n"); 
                let safeHiba = String(t.hiba || "").replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, "\\n");
                let safeGep = String(t.gep || "").replace(/'/g, "\\'").replace(/"/g, '&quot;');
                
                h += `<div class="task-card" style="border-left-color: var(--pri-crit);">
                    <div class="task-header"><span class="badge badge-info">${t.ismTipus}</span> <span class="badge badge-high">${t.prioritas}</span></div>
                    <div class="task-title">${t.gep}</div>
                    <div style="margin-bottom:10px;">${t.hiba}</div>
                    ${clHtml}
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <small style="color:var(--text-muted)">Létrehozta: ${t.letrehozo}</small>
                        <div style="display:flex; gap:5px;">
                            <button onclick="editRecurringTaskUI('${t.id}', '${safeGep}', '${safeHiba}', '${t.prioritas}', '${t.ismTipus}', '${safeChecklist}')" style="background:var(--pri-info); width:auto; padding:5px 10px; font-size:12px; margin:0;">✏️ Szerkesztés</button>
                            <button onclick="deleteRecurringTask('${t.id}')" style="background:#ef4444; width:auto; padding:5px 10px; font-size:12px; margin:0;">🗑️ Törlés</button>
                        </div>
                    </div>
                </div>`;
            }); 
            c.innerHTML = h;
        }
    } catch(e) { c.innerHTML = "Hiba a betöltéskor!"; }
}
function editRecurringTaskUI(id, gep, hiba, prio, tipus, checklist) {
    editIsmId = id; document.getElementById('ismHiba').value = hiba; document.getElementById('ismChecklist').value = checklist; document.getElementById('ismPrioritas').value = prio; document.getElementById('ismTipus').value = tipus;
    let parts = gep.split(" - "); if(parts.length > 1) { document.getElementById('ismKategoria').value = parts[0]; frissitIsmGepek(); setTimeout(() => { document.getElementById('ismGep').value = parts[1]; }, 100); }
    let btn = document.getElementById('btnIsmSubmit'); btn.innerText = "✏️ Módosítás Mentése"; btn.style.background = "var(--pri-info)"; document.getElementById('adminIsmetlodoView').scrollIntoView({ behavior: 'smooth' });
}
async function addRecurringTask() {
    const k = document.getElementById('ismKategoria').value, g = document.getElementById('ismGep').value, h = document.getElementById('ismHiba').value, cl = document.getElementById('ismChecklist').value, kd = document.getElementById('ismKezdoDatum').value;
    if (!k || !g || !h) { alert("Töltsd ki!"); return; } const btn = document.getElementById('btnIsmSubmit'); btn.disabled = true; const gepMentve = (g === "-") ? k : k + " - " + g;
    let p = { action: editIsmId ? "editRecurringTask" : "addRecurringTask", reszleg: RESZLEG, felhasznalo: localStorage.getItem("activeUser"), gep: gepMentve, hiba: h, prioritas: document.getElementById('ismPrioritas').value, ismTipus: document.getElementById('ismTipus').value, checklist: cl, kezdoDatum: kd }; if (editIsmId) p.id = editIsmId;
    try { const r = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(p) }); if((await r.json()).status === "success") { showToast("Sikeresen mentve!"); document.getElementById('ismHiba').value = ''; document.getElementById('ismChecklist').value = ''; editIsmId = null; btn.innerText = "Mentés"; btn.style.background = "var(--pri-crit)"; loadRecurringTasks(); } } catch(e) { showToast("Hiba!", true); } finally { btn.disabled = false; }
}
async function deleteRecurringTask(id) { if(!confirm("Biztosan törlöd?")) return; await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "deleteRecurringTask", reszleg: RESZLEG, id: id }) }); showToast("Törölve!"); loadRecurringTasks(); }

function setStatPeriod(type) {
    document.querySelectorAll('.stat-btn').forEach(b => b.classList.remove('active')); const today = new Date();
    if (type === 'napi') { document.getElementById('btnStatMa').classList.add('active'); statStartDate = toLocalISOString(today); statEndDate = statStartDate; } else if (type === 'heti') { document.getElementById('btnStatHet').classList.add('active'); let start = new Date(today); let day = start.getDay(); start.setDate(start.getDate() - day + (day === 0 ? -6 : 1)); statStartDate = toLocalISOString(start); statEndDate = toLocalISOString(today); } else if (type === 'havi') { document.getElementById('btnStatHo').classList.add('active'); let start = new Date(today.getFullYear(), today.getMonth(), 1); statStartDate = toLocalISOString(start); statEndDate = toLocalISOString(today); } else if (type === 'mind') { document.getElementById('btnStatMind').classList.add('active'); statStartDate = null; statEndDate = null; } else if (type === 'egyedi') { statStartDate = document.getElementById('statDatumTol').value || null; statEndDate = document.getElementById('statDatumIg').value || null; }
    document.getElementById('statDatumTol').value = statStartDate || ""; document.getElementById('statDatumIg').value = statEndDate || ""; calcStats();
}
function calcStats() {
    let esetiNyitott = 0, infoNyitott = 0, leallas = 0, esetiJavIdo = 0, termelesKieses = 0, prevNyitott = 0, prevIdo = 0; let machineIssues = {}; 
    let deptOpen = globalOpenTasks.filter(t => String(t.id).indexOf("PROD-") === -1); let deptClosed = globalClosedTasks.filter(t => String(t.id).indexOf("PROD-") === -1);
    let filteredOpen = deptOpen, filteredClosed = deptClosed;
    if (statStartDate || statEndDate) { filteredOpen = deptOpen.filter(t => { let d = String(t.idopont).substring(0,10); return (!statStartDate || d >= statStartDate) && (!statEndDate || d <= statEndDate); }); filteredClosed = deptClosed.filter(t => { let d = String(t.idopont).substring(0,10); return (!statStartDate || d >= statStartDate) && (!statEndDate || d <= statEndDate); }); }
    let userStats = {}; function initUser(u) { if(u && !userStats[u]) userStats[u] = { felvett: 0, megoldott: 0, reactNorm: [], reactKrit: [] }; }
    filteredOpen.forEach(t => { const isPrev = String(t.id || "").startsWith("PREV-"); if (isPrev) { prevNyitott++; } else { const pLower = String(t.prioritas || "").toLowerCase(); if(pLower.includes("informatív") || pLower.includes("megfigyelés")) { infoNyitott++; } else { esetiNyitott++; } if(pLower.includes("leállás")) leallas++; if (t.gep && t.gep !== "-") machineIssues[t.gep] = (machineIssues[t.gep] || 0) + 1; initUser(t.felhasznalo); userStats[t.felhasznalo].felvett++; } if(t.lezarta) { String(t.lezarta).split(',').map(x=>x.trim()).filter(x=>x).forEach(u => { initUser(u); userStats[u].megoldott++; }); } if (t.startIdopont) { let diffMin = getWorkingMinutes(t.idopont, t.startIdopont); let worker = t.felelos || t.lezarta; let isKrit = String(t.prioritas).toLowerCase().includes("leállás") || String(t.prioritas).toLowerCase().includes("magas"); if (diffMin >= 0 && worker) { initUser(worker); if(isKrit) userStats[worker].reactKrit.push(diffMin); else userStats[worker].reactNorm.push(diffMin); } } }); 
    filteredClosed.forEach(t => { const isPrev = String(t.id || "").startsWith("PREV-"); let jIdo = parseFloat(t.ido) || 0; let dTime = parseFloat(t.downtime) || 0; if (isPrev) { prevIdo += jIdo; } else { esetiJavIdo += jIdo; termelesKieses += dTime; if (t.gep && t.gep !== "-") machineIssues[t.gep] = (machineIssues[t.gep] || 0) + 1; initUser(t.felhasznalo); userStats[t.felhasznalo].felvett++; } if(t.lezarta) { String(t.lezarta).split(',').map(x=>x.trim()).filter(x=>x).forEach(u => { initUser(u); userStats[u].megoldott++; }); } if (t.startIdopont) { let diffMin = getWorkingMinutes(t.idopont, t.startIdopont); let worker = t.felelos; if (!worker && t.lezarta && t.lezarta.indexOf(',') === -1) { worker = t.lezarta; } let isKrit = String(t.prioritas).toLowerCase().includes("leállás") || String(t.prioritas).toLowerCase().includes("magas"); if (diffMin >= 0 && worker) { initUser(worker); if(isKrit) userStats[worker].reactKrit.push(diffMin); else userStats[worker].reactNorm.push(diffMin); } } });
    if(document.getElementById('statNyitott')) document.getElementById('statNyitott').innerText = esetiNyitott; if(document.getElementById('statInfoNyitott')) document.getElementById('statInfoNyitott').innerText = infoNyitott; if(document.getElementById('statLeallas')) document.getElementById('statLeallas').innerText = leallas; if(document.getElementById('statJavIdo')) document.getElementById('statJavIdo').innerText = Math.round(esetiJavIdo); if(document.getElementById('statDowntime')) document.getElementById('statDowntime').innerText = termelesKieses; if(document.getElementById('statPrevNyitott')) document.getElementById('statPrevNyitott').innerText = prevNyitott; if(document.getElementById('statPrevIdo')) document.getElementById('statPrevIdo').innerText = Math.round(prevIdo);
    if(document.getElementById('topMachinesContainer')) { let sortedMachines = Object.entries(machineIssues).sort((a, b) => b[1] - a[1]).slice(0, 3); let mHtml = ""; if(sortedMachines.length > 0) { sortedMachines.forEach((m, idx) => { let medal = idx === 0 ? "🥇" : (idx === 1 ? "🥈" : "🥉"); mHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px dashed #cbd5e1; padding-bottom:5px;"><span style="font-weight:bold; color:var(--accent); cursor:pointer;" onclick="openStatModal('machine', '${m[0]}')">${medal} ${m[0]} 👆</span><span class="badge badge-crit" style="background:var(--pri-high); border:none;">${m[1]} hiba</span></div>`; }); } else { mHtml = "Nincs adat."; } document.getElementById('topMachinesContainer').innerHTML = mHtml; }
    let currentYYYYMM = new Date().toISOString().substring(0,7); let lastDate = new Date(); lastDate.setMonth(lastDate.getMonth() - 1); let lastYYYYMM = lastDate.toISOString().substring(0,7); let monthStat = { current: {kieses:0, javIdo:0}, last: {kieses:0, javIdo:0} }; deptClosed.forEach(t => { const isPrev = String(t.id || "").startsWith("PREV-"); if(!isPrev) { let jIdo = parseFloat(t.ido) || 0; let dTime = parseFloat(t.downtime) || 0; let tMonth = String(t.idopont).substring(0,7); if (tMonth === currentYYYYMM) { monthStat.current.kieses += dTime; monthStat.current.javIdo += jIdo; } else if (tMonth === lastYYYYMM) { monthStat.last.kieses += dTime; monthStat.last.javIdo += jIdo; } } });
    if(document.getElementById('statTrendLast')) { document.getElementById('statTrendLast').innerHTML = `${monthStat.last.kieses} perc kiesés<br>${Math.round(monthStat.last.javIdo)} perc javítás`; document.getElementById('statTrendThis').innerHTML = `${monthStat.current.kieses} perc kiesés<br>${Math.round(monthStat.current.javIdo)} perc javítás`; }
    if(document.getElementById('adminStatsTableBody') && (sessionRole === "admin" || sessionRole === "superuser")) { let formatMin = (arr) => { if(arr.length === 0) return "-"; let sum = arr.reduce((a,b)=>a+b, 0); let avgMin = Math.round(sum / arr.length); if(avgMin < 60) return avgMin + " p"; let h = Math.floor(avgMin/60); let m = avgMin%60; return h + "ó " + m + "p"; }; let trHtml = ""; Object.keys(userStats).sort().forEach(user => { let st = userStats[user]; let avgNorm = formatMin(st.reactNorm); let avgKrit = formatMin(st.reactKrit); trHtml += `<tr><td style="cursor:pointer; color:var(--accent);" onclick="openStatModal('worker', '${user}')"><b>${user}</b> 👆</td><td>${st.felvett}</td><td>${st.megoldott}</td><td style="color:var(--pri-crit); font-weight:bold;">${avgKrit}</td><td>${avgNorm}</td></tr>`; }); if(trHtml === "") trHtml = `<tr><td colspan="5" style="text-align:center;">Nincs rögzített adat.</td></tr>`; document.getElementById('adminStatsTableBody').innerHTML = trHtml; }
}

function openStatModal(type, param) {
    let title = ""; let list = []; let deptOpen = globalOpenTasks.filter(t => String(t.id).indexOf("PROD-") > -1); let deptClosed = globalClosedTasks.filter(t => String(t.id).indexOf("PROD-") > -1);
    if (type === 'worker') { title = "👤 " + param + " által megoldott hibák"; list = [...deptOpen, ...deptClosed].filter(t => String(t.lezarta).split(',').map(x=>x.trim()).includes(param)); } else if (type === 'machine') { title = "⚙️ " + param + " eseti hibái"; list = [...deptOpen, ...deptClosed].filter(t => t.gep === param && !String(t.id).startsWith("PREV-")); } else if (type === 'downtime') { title = "🚨 Termeléskiesést okozó hibák"; list = deptClosed.filter(t => parseFloat(t.downtime) > 0); }
    if ((statStartDate || statEndDate) && type !== 'machine') { list = list.filter(t => { let d = String(t.idopont).substring(0,10); return (!statStartDate || d >= statStartDate) && (!statEndDate || d <= statEndDate); }); }
    let html = ""; if (list.length === 0) { html = "<div style='text-align:center; padding:20px;'>Nincs adat.</div>"; } else { list.sort((a,b) => new Date(b.idopont) - new Date(a.idopont)); list.forEach(t => { let d = new Date(t.idopont).toLocaleDateString('hu-HU', {month:'short', day:'numeric'}); let dtTxt = parseFloat(t.downtime) > 0 ? `<b style="color:var(--pri-crit);">(${t.downtime}p kiesés)</b>` : ''; html += `<div style="border-bottom:1px solid #cbd5e1; padding:10px 0;"><div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span><b>${d}</b> - ${t.gep}</span></div><div style="white-space:pre-wrap;">${t.hiba}</div><div style="font-size:12px; color:var(--text-muted);">${t.megoldas || ''} ${dtTxt}</div></div>`; }); }
    document.getElementById('statModalTitle').innerText = title; document.getElementById('statModalBody').innerHTML = html; document.getElementById('statDetailsModal').style.display = 'flex';
}
function closeStatModal(force = false) { if(force === true || event.target.id === 'statDetailsModal') document.getElementById('statDetailsModal').style.display = "none"; }
function exportDetailedStats() { let list = globalClosedTasks.filter(t => String(t.id).indexOf("PROD-") > -1); if (statStartDate || statEndDate) { list = list.filter(t => { let d = String(t.idopont).substring(0,10); return (!statStartDate || d >= statStartDate) && (!statEndDate || d <= statEndDate); }); } exportTasks(list, 'Statisztika_Teteles.csv'); }
function exportStatisztika(bontas) { exportDetailedStats(); }

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

// --- ENTER GOMB FIGYELÉSE A BEJELENTKEZÉSHEZ ---
document.addEventListener('DOMContentLoaded', () => {
    const jelszoMezo = document.getElementById('loginJelszo'); 
    if (jelszoMezo) {
        jelszoMezo.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                login(); 
            }
        });
    }
});