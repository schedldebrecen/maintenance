const RESZLEG = "production";

let currentActiveTasks = []; 
let globalShiftLogs = []; 
let expectedApprovers = []; 
let globalSchedule = [];
let clSablon = []; 
let clNaplo = []; 
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

// --- Felhasználóbarát Session Pop-up ---
function showSessionPopup() {
    let popup = document.getElementById('sessionExpiredPopup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'sessionExpiredPopup';
        popup.innerHTML = `
            <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.85); display:flex; justify-content:center; align-items:center; z-index:9999; backdrop-filter:blur(4px);">
                <div style="background:var(--surface); padding:30px; border-radius:10px; width:90%; max-width:400px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.5); border:2px solid var(--pri-normal);">
                    <div style="font-size:45px; margin-bottom:10px;">⏳</div>
                    <h2 style="color:var(--text-main); margin-top:0; font-size:22px;">Biztonsági időkorlát</h2>
                    <p style="color:var(--text-muted); font-size:14px; margin-bottom:20px; line-height:1.5;">Túl sokáig volt inaktív az oldal, ezért a biztonsági kulcs lejárt. <b>Ne aggódj, az adataid nem vesztek el!</b> Add meg a PIN kódod a folyamat zökkenőmentes folytatásához.</p>
                    <select id="sessionPopupUser" class="dash-input" style="width:100%; margin-bottom:10px; font-size:14px;"></select>
                    <input type="password" id="sessionPopupPin" class="dash-input" placeholder="PIN kód" style="width:100%; margin-bottom:15px; font-size:14px;">
                    <button onclick="resumeSession()" style="background:var(--pri-normal); color:white; border:none; padding:10px 20px; width:100%; border-radius:6px; font-weight:bold; font-size:16px; cursor:pointer;">Folytatás</button>
                    <div id="sessionPopupStatus" style="color:var(--pri-crit); font-weight:bold; margin-top:10px; font-size:13px;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(popup);

        const mainSelect = document.getElementById('clLoginNevSelect');
        const popupSelect = document.getElementById('sessionPopupUser');
        if(mainSelect && popupSelect) {
            popupSelect.innerHTML = mainSelect.innerHTML;
            if(localStorage.getItem("activeUser")) popupSelect.value = localStorage.getItem("activeUser");
        }

        document.getElementById('sessionPopupPin').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); resumeSession(); }
        });
    }
    popup.style.display = 'flex';
}

async function resumeSession() {
    const u = document.getElementById('sessionPopupUser').value;
    const p = document.getElementById('sessionPopupPin').value;
    const stat = document.getElementById('sessionPopupStatus');
    
    if(!u || !p) { stat.innerText = "A PIN kód megadása kötelező!"; return; }
    stat.innerText = "Ellenőrzés folyamatban...";
    
    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "login", nev: u, jelszo: await hashPassword(p) }) });
        const rawText = await res.text();
        const r = JSON.parse(rawText);
        if(r.status === "success") {
            localStorage.setItem("activeUser", u);
            localStorage.setItem("activeRole", r.role || "production");
            localStorage.setItem("sessionToken", r.token);
            sessionUser = u;
            window.isSessionExpired = false;
            document.getElementById('sessionExpiredPopup').style.display = 'none';
            document.getElementById('sessionPopupPin').value = '';
            stat.innerText = "";
            showToast("Sikeres folytatás! Kérjük nyomj újra a Mentés/Beküldés gombra.");
            extendSession();
        } else {
            stat.innerText = "Hibás PIN kód!";
        }
    } catch(e) { stat.innerText = "Hálózati hiba!"; }
}

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
};

async function loadUserList() { 
    try { 
        const res = await secureFetch({ action: "getUsers" }); 
        const r = await res.json(); 
        if (r.status === "success" && r.data.length > 0) { 
            const sel = document.getElementById('clLoginNevSelect'); 
            if(sel) { 
                sel.innerHTML = '<option value="">Válassz a listából...</option>'; 
                r.data.forEach(user => sel.add(new Option(user, user))); 
            } 
        } 
    } catch(e) {} 
}

setInterval(() => { 
    const clk = document.getElementById('clockDisplay');
    if (clk) clk.innerText = new Date().toLocaleTimeString('hu-HU'); 
}, 1000);

setInterval(() => { 
    timer--; 
    if (timer <= 0) { 
        timer = REFRESH_INTERVAL_SEC; 
        fetchDashboardData(true); 
    } 
    const cd = document.getElementById('countdownDisplay');
    if (cd) cd.innerText = timer; 
    const pb = document.getElementById('progressBar');
    if (pb) pb.style.width = (((REFRESH_INTERVAL_SEC - timer) / REFRESH_INTERVAL_SEC) * 100) + "%"; 
}, 1000);

function isChecklistBeingEdited() {
    const unlockedRadios = document.querySelectorAll('.cl-question-block input[type="radio"]:not(:disabled):checked');
    const unlockedComments = Array.from(document.querySelectorAll('.cl-question-block input[type="text"]:not(:disabled)')).some(inp => inp.value.trim() !== "");
    return unlockedRadios.length > 0 || unlockedComments;
}

async function fetchDashboardData(isAutoRefresh = false) {
    let cachedData = localStorage.getItem('dashCache_Prod');
    if (cachedData && !isAutoRefresh) {
        try {
            let result = JSON.parse(cachedData);
            clSablon = result.data.checklistSablon || []; 
            clNaplo = result.data.checklistNaplo || [];
            globalShiftLogs = result.data.shiftLogs || [];
            expectedApprovers = result.data.expectedApprovers || [];
            globalSchedule = result.data.schedule || [];
            processData(result.data.tasks); 
            checkMissingShiftLogsAndApprovals();
            checkMidShiftChecklist();
            renderChecklistTab();
        } catch(e) {}
    }

    try {
        const res = await secureFetch({ action: "getAllData", reszleg: RESZLEG }); 
        const result = await res.json();
        if(result.status === "success") { 
            localStorage.setItem('dashCache_Prod', JSON.stringify(result)); 
            clSablon = result.data.checklistSablon || []; 
            clNaplo = result.data.checklistNaplo || [];
            globalShiftLogs = result.data.shiftLogs || [];
            expectedApprovers = result.data.expectedApprovers || [];
            globalSchedule = result.data.schedule || [];
            
            processData(result.data.tasks); 
            checkMissingShiftLogsAndApprovals();
            checkMidShiftChecklist();
            
            if (!isAutoRefresh || !isChecklistBeingEdited()) {
                renderChecklistTab();
            }
        } 
    } catch (e) { console.error("Háttér hiba:", e); }
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
                    
                    let expectedForThisLog = expectedApproversClean.filter(a => {
                        let sched = globalSchedule.find(s => {
                            if(s.datum !== logD || String(s.user).toLowerCase().trim() !== a) return false;
                            let tipusLower = String(s.tipus).toLowerCase();
                            let isHoliday = (tipusLower.includes("szabad") || tipusLower.includes("szabi") || tipusLower.includes("beteg") || tipusLower === "b" || tipusLower.includes("pihen"));
                            return !isHoliday;
                        });
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

function checkMidShiftChecklist() {
    let now = new Date(); let h = now.getHours(); let m = now.getMinutes(); let timeFloat = h + (m/60);
    let currentShift = ""; let todayStr = toLocalISOString(now);
    
    let isWeekend = (now.getDay() === 0 || now.getDay() === 6);
    if (isWeekend) {
        document.getElementById('checklistAlarmBanner').style.display = 'none'; 
        if (!isAlarming) document.body.classList.remove('flash-red');
        return;
    }

    if (timeFloat >= 6 && timeFloat < 14) currentShift = "Délelőtt (06:00-14:00)"; 
    else if (timeFloat >= 14 && timeFloat < 22) currentShift = "Délután (14:00-22:00)"; 
    else {
        document.getElementById('checklistAlarmBanner').style.display = 'none'; 
        if (!isAlarming) document.body.classList.remove('flash-red');
        return;
    }

    let isScheduled = globalSchedule.some(s => {
        let tipusLower = String(s.tipus).toLowerCase();
        let isHoliday = (tipusLower.includes("szabad") || tipusLower.includes("szabi") || tipusLower.includes("beteg") || tipusLower === "b" || tipusLower.includes("pihen"));
        return s.datum === todayStr && String(s.tipus).includes(currentShift.split(" ")[0]) && expectedApprovers.includes(s.user) && !isHoliday;
    });

    if (!isScheduled) {
        document.getElementById('checklistAlarmBanner').style.display = 'none'; 
        if (!isAlarming) document.body.classList.remove('flash-red');
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
        if (!isAlarming) document.body.classList.remove('flash-red'); 
    }
}

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

    const mNevEl = document.getElementById('clMuszakNev');
    if (mNevEl) mNevEl.innerText = todayStr + " | " + currentShift;

    let existingLog = clNaplo.find(l => l.datum === todayStr && l.muszak === currentShift);
    let savedAnswers = {};
    if (existingLog && existingLog.eredmenyek) {
        try {
            let parsed = JSON.parse(existingLog.eredmenyek);
            parsed.forEach(p => { savedAnswers[p.kerdes] = { valasz: p.valasz, megjegyzes: p.megjegyzes || "" }; });
        } catch(e) {}
    }

    let isLocked = existingLog ? true : false;
    let disabledAttr = isLocked ? "disabled" : "";
    let statusContainer = document.getElementById('checklistStatusContainer');
    if (!statusContainer) return;
    
    if (existingLog) {
        statusContainer.innerHTML = `<div id="clStatusBanner" style="background:rgba(16, 185, 129, 0.15); color:#059669; padding:12px 15px; border-radius:6px; margin-bottom:20px; font-weight:bold; border:1px solid var(--pri-normal); display:flex; justify-content:space-between; align-items:center;">
            <span>✅ <b>${existingLog.kitolto}</b> már beküldte ezt a listát. Biztonsági okokból zárolva.</span>
            <button onclick="unlockChecklist()" style="background:var(--pri-normal); color:white; border:none; padding:6px 12px; border-radius:4px; font-size:13px; font-weight:bold; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">✏️ Módosítás Mód</button>
        </div>`;
        
        if(document.getElementById('clLoginNevSelect')) document.getElementById('clLoginNevSelect').disabled = true;
        if(document.getElementById('clLoginPin')) document.getElementById('clLoginPin').disabled = true;
        if(document.getElementById('btnSubmitChecklist')) document.getElementById('btnSubmitChecklist').style.display = 'none';
    } else {
        statusContainer.innerHTML = "";
        if(document.getElementById('clLoginNevSelect')) document.getElementById('clLoginNevSelect').disabled = false;
        if(document.getElementById('clLoginPin')) document.getElementById('clLoginPin').disabled = false;
        if(document.getElementById('btnSubmitChecklist')) {
            document.getElementById('btnSubmitChecklist').style.display = 'block';
            document.getElementById('btnSubmitChecklist').innerText = "Kitöltés Hitelesítése & Mentés";
        }
        if(document.getElementById('clSubmitTitle')) document.getElementById('clSubmitTitle').innerText = "Hitelesítés és Beküldés";
    }

    let validSubtasks = clSablon.filter(q => {
        let freq = String(q.gyakorisag || "").trim();
        let isFreqMatch = (freq === "Minden nap" || freq === todayDayName || (freq === "Minden hétköznap" && isWeekday));
        let isShiftMatch = (q.muszakok && String(q.muszakok).includes(currentShiftShort));
        return isFreqMatch && isShiftMatch;
    });

    if (validSubtasks.length === 0) {
        statusContainer.innerHTML += `<div style="color:var(--text-muted); text-align:center; padding:20px;">Jelenleg (ebben a műszakban) nincs aktív feladat.</div>`;
        document.getElementById('checklistQuestionsContainer').style.display = 'none';
        return;
    }

    document.getElementById('checklistQuestionsContainer').style.display = 'block';

    let groupedTasks = {};
    clSablon.forEach(item => {
        if (!item.szuloId) {
            let hasActiveChildren = validSubtasks.some(child => child.szuloId === item.id);
            if (hasActiveChildren) {
                let catName = item.kerdes;
                if (!groupedTasks[catName]) {
                    groupedTasks[catName] = validSubtasks.filter(child => child.szuloId === item.id);
                }
            }
        }
    });

    let orphans = validSubtasks.filter(q => !q.szuloId && !clSablon.some(parent => parent.id === q.id));
    if (orphans.length > 0) { groupedTasks["Egyéb / Önálló feladatok"] = orphans; }

    let html = `
    <div class="cl-table-container">
        <table class="cl-table">
            <thead>
                <tr>
                    <th style="width:18%;"># Fő feladat / Kategória</th>
                    <th style="width:27%;">Részfeladat / Mit kell ellenőrizni?</th>
                    <th style="width:25%;">Leírás / Utasítás</th>
                    <th style="width:15%; text-align:center;">Kép / Fájl</th>
                    <th class="ok-header" style="width:15%;">Jelölés</th>
                </tr>
            </thead>
            <tbody>`;

    let counter = 1;
    let isEven = false; 

    for (let catName in groupedTasks) {
        let tasksInArea = groupedTasks[catName];
        let rowClass = isEven ? "cat-even" : "cat-odd"; 
        
        tasksInArea.forEach((q, index) => {
            let prevAns = savedAnswers[q.kerdes] || { valasz: "", megjegyzes: "" };
            let checkedOK = prevAns.valasz === "OK" ? "checked" : "";
            let checkedNOK = prevAns.valasz === "NOK" ? "checked" : "";
            let checkedNA = prevAns.valasz === "N.A." ? "checked" : "";

            let mediaHtml = "";
            if (q.kep && String(q.kep).trim() !== "") { 
                let imgUrl = q.kep; let m = q.kep.match(/d\/([a-zA-Z0-9_-]+)/) || q.kep.match(/id=([^&]+)/);
                if(m && q.kep.includes("drive.google.com")) { imgUrl = `https://lh3.googleusercontent.com/d/${m[1]}`; }
                mediaHtml += `<a href="${q.kep}" target="_blank"><img src="${imgUrl}" class="cl-img-preview" alt="Megtekintés"></a><br>`; 
            }
            if (q.fajl && String(q.fajl).trim() !== "") { 
                let fNev = (q.fajlNev && String(q.fajlNev).trim() !== "") ? q.fajlNev : "📄 Dokumentum";
                mediaHtml += `<a href="${q.fajl}" target="_blank" style="display:inline-block; margin-top:5px; background:var(--pri-info); color:white; padding:6px 10px; border-radius:4px; text-decoration:none; font-size:11px; font-weight:bold;">${fNev}</a>`; 
            }
            if (mediaHtml === "") mediaHtml = `<span style="color:var(--text-muted); font-size:11px; font-style:italic;">- Nincs csatolva -</span>`;

            html += `<tr class="cl-question-block ${rowClass}" data-focim="${catName}" data-terulet="${q.terulet||''}" data-gep="${q.gep||''}" data-kerdes="${q.kerdes}">`;
            
            if (index === 0) {
                html += `<td rowspan="${tasksInArea.length}" class="cl-main-cat">
                            <div class="cl-main-cat-num">${counter}</div>
                            <div class="cl-main-cat-title">${catName}</div>
                         </td>`;
                counter++;
            }

            let gTxt = q.gep ? `<br><span style="color:var(--pri-info); font-size:12px;">(${q.gep})</span>` : "";
            let tTxt = q.terulet ? `<b style="color:var(--pri-info); font-size:11px;">[${q.terulet}]</b><br>` : "";

            html += `
                <td>${tTxt}<span style="font-size:14px; font-weight:bold; color:var(--text-main);">${q.kerdes}</span>${gTxt}</td>
                <td style="color:var(--text-muted); font-size:12px; line-height:1.4;">${q.utasitas || ''}</td>
                <td style="text-align:center; vertical-align:middle;">${mediaHtml}</td>
                <td>
                    <div class="cl-radio-group">
                        <label class="cl-radio-lbl ok"><input type="radio" name="clRad_${q.id}" value="OK" ${checkedOK} ${disabledAttr}><span class="rb-box"></span> OK ✔️</label>
                        <label class="cl-radio-lbl nok"><input type="radio" name="clRad_${q.id}" value="NOK" ${checkedNOK} ${disabledAttr}><span class="rb-box"></span> NOK ❌</label>
                        <label class="cl-radio-lbl na"><input type="radio" name="clRad_${q.id}" value="N.A." ${checkedNA} ${disabledAttr}><span class="rb-box"></span> N.A. ➖</label>
                    </div>
                    <input type="text" class="cl-comment-input cl-comment" value="${prevAns.megjegyzes}" placeholder="Megjegyzés..." ${disabledAttr}>
                </td>
            </tr>`;
        });
        
        isEven = !isEven; 
    }

    html += `</tbody></table></div>`;
    document.getElementById('clQuestionsList').innerHTML = html;
}

window.unlockChecklist = function() {
    document.querySelectorAll('.cl-question-block input[type="radio"]').forEach(el => el.disabled = false);
    document.querySelectorAll('.cl-question-block input[type="text"]').forEach(el => el.disabled = false);
    
    if(document.getElementById('clLoginNevSelect')) document.getElementById('clLoginNevSelect').disabled = false;
    if(document.getElementById('clLoginPin')) document.getElementById('clLoginPin').disabled = false;
    
    let btn = document.getElementById('btnSubmitChecklist');
    if(btn) {
        btn.style.display = 'block';
        btn.innerText = "Változtatások Hitelesítése & Mentés";
    }
    
    if(document.getElementById('clSubmitTitle')) document.getElementById('clSubmitTitle').innerText = "Módosítás Beküldése";

    let banner = document.getElementById('clStatusBanner');
    if(banner) {
        banner.style.background = "rgba(245, 158, 11, 0.15)";
        banner.style.borderColor = "#f59e0b";
        banner.style.color = "#d97706";
        banner.innerHTML = "<span>✏️ <b>Módosítás Mód Aktív!</b> Most már átkattinthatod a válaszokat, és újra mentheted a listát.</span>";
    }
};

async function verifyAndSubmitChecklist() {
    let now = new Date(); let h = now.getHours(); let timeFloat = h + (now.getMinutes()/60);
    let currentShift = ""; let todayStr = toLocalISOString(now);
    if (timeFloat >= 6 && timeFloat < 14) currentShift = "Délelőtt (06:00-14:00)"; 
    else if (timeFloat >= 14 && timeFloat < 22) currentShift = "Délután (14:00-22:00)"; 
    else { 
        currentShift = "Éjszaka (22:00-06:00)"; 
        if (timeFloat < 6) { let yest = new Date(now); yest.setDate(yest.getDate()-1); todayStr = toLocalISOString(yest); } 
    }

    const nev = document.getElementById('clLoginNevSelect').value; 
    const pin = document.getElementById('clLoginPin').value; 
    const stat = document.getElementById('clLoginStatus');
    stat.style.color = "var(--pri-crit)";
    if(!nev || !pin) { stat.innerText = "Válaszd ki a neved és add meg a PIN kódod!"; return; }

    let eredmenyek = []; 
    let blocks = document.querySelectorAll('.cl-question-block');
    for (let i = 0; i < blocks.length; i++) {
        let block = blocks[i]; 
        let focim = block.getAttribute('data-focim'); 
        let terulet = block.getAttribute('data-terulet'); 
        let gep = block.getAttribute('data-gep'); 
        let kerdes = block.getAttribute('data-kerdes');
        let radios = block.querySelectorAll('input[type="radio"]'); 
        let val = null;
        for(let r of radios) { if(r.checked) val = r.value; }
        if(!val) { stat.innerText = `Hiba: Kérlek minden kérdésre válaszolj!`; return; }
        let megjegyzes = block.querySelector('.cl-comment').value.trim();
        eredmenyek.push({ focim: focim, kerdes: kerdes, terulet: terulet, gep: gep, valasz: val, megjegyzes: megjegyzes });
    }

    stat.innerText = "Hitelesítés és mentés...";
    try {
        const resLogin = await secureFetch({ action: "login", nev: nev, jelszo: await hashPassword(pin) }); 
        const rLogin = await resLogin.json(); 
        if(rLogin.status !== "success") { stat.innerText = "Hibás PIN kód!"; return; }
        
        localStorage.setItem("sessionToken", rLogin.token);
        localStorage.setItem("activeUser", nev);
        sessionUser = nev;
        extendSession();

        let hibak = eredmenyek.filter(e => e.valasz === 'NOK');
        if(hibak.length > 0) { 
            if(!confirm(`⚠️ FIGYELEM!\n\n${hibak.length} db NOK választ adtál meg. A rendszer ezekből automatikusan hibajegyeket fog nyitni a Karbantartás felé.\n\nBiztosan elküldöd?`)) { 
                stat.innerText = ""; 
                return; 
            } 
        }

        const payload = { action: "saveShiftChecklist", datum: todayStr, muszak: currentShift, felhasznalo: nev, eredmenyek: eredmenyek, hibak: hibak };
        const resSave = await secureFetch(payload); 
        const rSave = await resSave.json();
        
        if(rSave.status === "success") {
            stat.style.color = "var(--pri-normal)"; 
            stat.innerText = "Sikeres mentés / felülírás!"; 
            document.getElementById('clLoginPin').value = "";
            fetchDashboardData(); 
        } else { stat.innerText = rSave.message; }
    } catch(e) { stat.innerText = "Hálózati hiba!"; }
}

function processData(allTasks) {
    currentActiveTasks = []; 
    let hasNewAdHoc = false;
    allTasks.forEach(t => { 
        let isPrev = String(t.id).startsWith("PREV-") || String(t.id).includes("REC-");
        if(t.prioritas === "Igen") t.prioritas = "Magas prioritás";
        if(t.prioritas === "Nem") t.prioritas = "Normál";

        if(t.statusz !== "Lezárt") {
            if (!String(t.id).includes("PROD-")) return;
            if (isPrev && !String(t.id).toUpperCase().includes("PROD")) return;
            currentActiveTasks.push(t);
            
            const pLower = String(t.prioritas).toLowerCase();
            if(!isPrev && !pLower.includes("informatív") && !pLower.includes("megfigyelés")) {
                if(!isFirstLoad && !knownAdHocIds.has(t.id)) hasNewAdHoc = true; 
                knownAdHocIds.add(t.id);
            }
        }
    });

    if (hasNewAdHoc && !isAlarming) triggerAlert();
    isFirstLoad = false; 
}

function triggerAlert() { 
    isAlarming = true; 
    if(optFlash) document.body.classList.add('flash-red'); 
    if(optSound && audioCtx) playAlarmSound(); 
    const btn = document.getElementById('ackAlertBtn');
    if (btn) btn.style.display = 'block'; 
}

function stopAlert() { 
    isAlarming = false; 
    document.body.classList.remove('flash-red'); 
    const btn = document.getElementById('ackAlertBtn');
    if (btn) btn.style.display = 'none'; 
}

function playAlarmSound() { 
    if (!audioCtx) return; 
    let playBeep = (time) => { 
        const osc = audioCtx.createOscillator(); 
        const gain = audioCtx.createGain(); 
        osc.connect(gain); gain.connect(audioCtx.destination); 
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
        btn.innerText = "🔊"; btn.classList.add('active-sound'); 
        const AudioContext = window.AudioContext || window.webkitAudioContext; 
        if(AudioContext && !audioCtx) audioCtx = new AudioContext(); 
        if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); 
    } else { 
        btn.innerText = "🔇"; btn.classList.remove('active-sound'); 
    } 
}

function toggleFlash() { 
    optFlash = !optFlash; 
    const btn = document.getElementById('btnToggleFlash'); 
    if(optFlash) { 
        btn.innerText = "🔴"; btn.classList.add('active-flash'); 
    } else { 
        btn.innerText = "⚪"; btn.classList.remove('active-flash'); 
        document.body.classList.remove('flash-red'); 
    } 
}

function extendSession() { 
    if(sessionUser) { 
        const badge = document.getElementById('activeUserBadge');
        if (badge) badge.style.display = 'flex'; 
        const uName = document.getElementById('dashUserName');
        if (uName) uName.innerText = sessionUser; 
    } 
}

function dashLogout() { 
    sessionUser = null; 
    sessionRole = null; 
    localStorage.removeItem("activeUser"); 
    localStorage.removeItem("activeRole"); 
    localStorage.removeItem("sessionToken"); 
    const badge = document.getElementById('activeUserBadge');
    if (badge) badge.style.display = 'none'; 
    window.location.href = window.location.pathname; 
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

function checkAllChecklists(taskId) {
    const selector = taskId ? `.task-cl-chk-${taskId}` : '.task-cl-chk';
    const checkboxes = document.querySelectorAll(selector);
    checkboxes.forEach(cb => cb.checked = true);
}

document.addEventListener('DOMContentLoaded', () => {
    const clPin = document.getElementById('clLoginPin');
    if (clPin) {
        clPin.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                verifyAndSubmitChecklist();
            }
        });
    }
});