const RESZLEG = "dashboard";

let currentActiveTasks = []; 
let globalClosedTasks = []; 
let globalShiftLogs = []; 
let expectedApprovers = []; 
let globalSchedule = []; 
let globalBaseWorkers = []; 
let globalExtraWorkers = [];
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

let globalPartsList = []; 
let targetPartInputId = null;

window.onload = function() {
    const szuroKatSelect = document.getElementById('szuroKategoria'); 
    if(szuroKatSelect) { 
        for (let kat in gepAdatbazis) { szuroKatSelect.add(new Option(kat, kat)); } 
    }
    loadUserList(); 
    const savedUser = localStorage.getItem("activeUser"); 
    if(savedUser) { 
        sessionUser = savedUser; 
        sessionRole = localStorage.getItem("activeRole"); 
        extendSession(); 
    } 
    populateNavDropdown();
    fetchDashboardData(); 
    fetchPartsList();
};

function switchDashTab(tabId) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active')); 
    document.querySelectorAll('.dash-nav button').forEach(b => b.classList.remove('active'));
    document.getElementById('view-' + tabId).classList.add('active');
    
    let btnMap = { 'nyitott': 'tabNyitott', 'lezart': 'tabLezart', 'beosztas': 'tabBeosztas' };
    if (btnMap[tabId]) document.getElementById(btnMap[tabId]).classList.add('active');
    
    if (tabId === 'lezart') renderClosedTasks(); 
    if (tabId === 'beosztas') renderScheduleMain();
}

async function loadUserList() { 
    try { 
        const res = await secureFetch({ action: "getUsers" }); 
        const r = await res.json(); 
        if (r.status === "success" && r.data.length > 0) { 
            const sel2 = document.getElementById('dashLoginNevSelect'); 
            if(sel2) { 
                sel2.innerHTML = '<option value="">Válassz a listából...</option>'; 
                r.data.forEach(user => sel2.add(new Option(user, user))); 
                sel2.add(new Option("--- Egyéb (kézi megadás) ---", "custom")); 
            } 
        } 
    } catch(e) {} 
}

function checkDashLoginCustom(sel) { 
    if(sel.value === "custom") { 
        sel.style.display = 'none'; 
        document.getElementById('dashLoginNev').style.display = 'block'; 
        document.getElementById('dashLoginNev').focus(); 
    } else { 
        document.getElementById('dashLoginNev').value = sel.value; 
    } 
}

// --- RAKTÁR KERESŐ ---
async function fetchPartsList() { 
    try { 
        const res = await secureFetch({ action: "getPartsList" }); 
        const r = await res.json(); 
        if(r.status === "success") { 
            globalPartsList = r.data || []; 
            if(document.getElementById('partsListContainer')) { 
                document.getElementById('partsListContainer').innerHTML = "<div style='padding:10px; text-align:center; color:var(--text-muted);'>Alkatrészek betöltve. Kezdj el gépelni a kereséshez!</div>"; 
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
    if(validList.length === 0) { 
        c.innerHTML = "<div style='padding:20px; text-align:center; color:var(--text-muted);'>Nincs készleten a keresett alkatrészből!</div>"; 
        return; 
    }
    let h = ""; 
    validList.forEach(p => { 
        h += `<div style="padding:12px 10px; border-bottom:1px solid var(--border); cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="selectPart('${p.id}')" onmouseover="this.style.background='#334155'" onmouseout="this.style.background='transparent'">
            <div style="flex:1; padding-right:10px;">
                <div style="font-weight:bold; color:var(--pri-info); font-size:14px; margin-bottom:2px;">${p.name}</div>
                <div style="font-size:13px; color:var(--text-main); font-family:monospace; font-weight:bold;">Cikkszám: ${p.id}</div>
                <div style="font-size:12px; color:var(--text-muted); margin-top:6px; line-height:1.4;">
                    <b>Gyártó:</b> ${p.manuf || '-'} | <b>Raktárhely:</b> <span style="color:var(--pri-normal); font-weight:bold;">${p.loc || '-'}</span>
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

setInterval(() => { 
    const clk = document.getElementById('clockDisplay');
    if (clk) clk.innerText = new Date().toLocaleTimeString('hu-HU'); 
}, 1000);

setInterval(() => { 
    timer--; 
    if (timer <= 0) { 
        timer = REFRESH_INTERVAL_SEC; 
        fetchDashboardData(); 
    } 
    const cd = document.getElementById('countdownDisplay');
    if (cd) cd.innerText = timer; 
    const pb = document.getElementById('progressBar');
    if (pb) pb.style.width = (((REFRESH_INTERVAL_SEC - timer) / REFRESH_INTERVAL_SEC) * 100) + "%"; 
}, 1000);

async function fetchDashboardData() { 
    try { 
        const res = await secureFetch({ action: "getAllData", reszleg: RESZLEG }); 
        const result = await res.json(); 
        if(result.status === "success") { 
            globalShiftLogs = result.data.shiftLogs || []; 
            expectedApprovers = result.data.expectedApprovers || []; 
            globalSchedule = result.data.schedule || []; 
            globalBaseWorkers = result.data.baseWorkers || []; 
            globalExtraWorkers = result.data.extraWorkers || []; 
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
    if (alertDiv) { alertDiv.innerHTML = alertHtml; }
}

function processData(allTasks) {
    currentActiveTasks = []; 
    globalClosedTasks = []; 
    let cCrit = 0, cHigh = 0, cProg = 0, cInfo = 0; 
    let hasNewAdHoc = false;
    
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
            if(!isPrev && !pLower.includes("informatív") && !pLower.includes("megfigyelés")) { 
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
    
    setDashboardFilter(activeFilterPrio);
}

let activeFilterPrio = null;
function setDashboardFilter(prio) {
    if (activeFilterPrio === prio) activeFilterPrio = null; else activeFilterPrio = prio; 
    document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active-filter'));
    if (activeFilterPrio) document.getElementById('kpiCard-' + prio).classList.add('active-filter'); 
    else document.getElementById('kpiCard-Total').classList.add('active-filter');
    
    let filtered = currentActiveTasks.filter(t => {
        const pLower = String(t.prioritas).toLowerCase();
        if (!activeFilterPrio) { 
            if (pLower.includes("informatív") || pLower.includes("megfigyelés")) return false; 
            return true; 
        }
        if (activeFilterPrio === 'Crit' && pLower.includes("leállás")) return true; 
        if (activeFilterPrio === 'High' && pLower.includes("magas")) return true; 
        if (activeFilterPrio === 'Info' && (pLower.includes("informatív") || pLower.includes("megfigyelés"))) return true; 
        if (activeFilterPrio === 'Prog' && t.statusz === "Folyamatban") return true; 
        return false;
    }); 
    renderGrid(filtered);
}

function renderGrid(renderTasks) {
    const grid = document.getElementById('taskGrid'); 
    if(!grid) return; 
    if (renderTasks.length === 0) { 
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; margin-top: 100px;"><div style="font-size: 60px; margin-bottom: 20px;">🎉</div><h2 style="color: var(--pri-normal);">Nincs aktív feladat ebben a nézetben.</h2></div>`; 
        return; 
    }
    
    let normalTasks = []; 
    let prevTasks = []; 
    let itTasks = [];
    
    renderTasks.forEach(t => {
        let isPrev = String(t.id).startsWith("PREV-") || String(t.id).includes("REC-"); 
        let gepStr = String(t.gep).toLowerCase();
        let isIT = gepStr === "it" || gepStr.startsWith("it -") || gepStr.includes("szerver") || gepStr.includes("hálózat") || gepStr.includes("kliens") || gepStr.includes("nyomtató") || gepStr.includes("szoftver") || gepStr.includes("it eszköz");
        if (isIT) { itTasks.push(t); } 
        else if (isPrev) { prevTasks.push(t); } 
        else { normalTasks.push(t); }
    });
    
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
    itTasks.sort(sorter);
    
    let html = "";
    if (normalTasks.length > 0) { 
        html += `<div class="section-title">🚨 Aktuális Hibák és Feladatok</div>`; 
        normalTasks.forEach(task => { html += generateCardHtml(task); }); 
    }
    if (prevTasks.length > 0) { 
        html += `<div class="section-title" style="margin-top:40px; color: var(--pri-info); border-color: var(--pri-info);">🔁 Tervezett Karbantartások (Ismétlődő)</div>`; 
        prevTasks.forEach(task => { html += generateCardHtml(task); }); 
    }
    if (itTasks.length > 0) { 
        html += `<div class="section-title" style="margin-top:40px; color: #64748b; border-color: #64748b;">💻 IT Részleg Feladatai (Várakozó)</div>`; 
        itTasks.forEach(task => { html += generateCardHtml(task); }); 
    }
    grid.innerHTML = html;
}

function generateCardHtml(t) {
    const timeStr = new Date(t.idopont).toLocaleTimeString('hu-HU', {hour: '2-digit', minute:'2-digit'}); 
    const dateStr = new Date(t.idopont).toLocaleDateString('hu-HU', {month:'short', day:'numeric'}); 
    let eC = ""; 
    const pLower = String(t.prioritas).toLowerCase(); 
    let bC = "badge-normal"; 
    const pr = String(t.prioritas).replace(" prioritás", "").replace("ással járó", "");
    
    if(t.statusz==="Lezárt") { eC="closed"; bC="badge-closed"; } 
    else { 
        if(pLower.includes("leállás")) {eC="Termelésleállás"; bC="badge-crit";} 
        else if(pLower.includes("magas")) {eC="Magas"; bC="badge-high";} 
        else if(pLower.includes("megfigyelés")) {eC="Megfigyelés"; bC="badge-obs";} 
        else if(pLower.includes("informatív")) {eC="Informatív"; bC="badge-info";} 
        if(t.statusz==="Folyamatban") eC="Folyamatban"; 
    }
    
    let inP = t.statusz === "Folyamatban" ? `<div class="in-progress-bar"><span>⚙️</span> <b>${t.felelos}</b> éppen dolgozik rajta</div>` : ""; 
    let prevIcon = (String(t.id).startsWith("PREV-") || String(t.id).includes("REC-")) ? "🔁 " : ""; 
    let reszlegIcon = String(t.id).includes("PROD-") ? "🏭 " : "🔧 ";
    let extraInfoBadge = t.megjegyzes ? `<div style="margin-bottom:10px; font-size:12px; color:var(--pri-info); font-weight:bold;">💬 Komment csatolva</div>` : "";

    if (t.statusz !== "Lezárt") { 
        return `<div class="card ${eC}" onclick="openModal('${t.id}')"><div class="card-header"><span class="badge ${bC}">${pr}</span><span style="color: var(--text-muted); font-size: 13px; font-weight:bold;">${dateStr} - ${timeStr}</span></div><div class="machine-name">${reszlegIcon}${prevIcon}${t.gep}</div>${inP}<div class="issue-desc" style="white-space:pre-wrap;">${t.hiba}</div>${extraInfoBadge}<div class="meta-footer"><div>Beküldte: <b>${t.felhasznalo}</b></div><div style="color: var(--text-muted); font-size:11px;">Részletek / Kezelés 👆</div></div></div>`; 
    } else { 
        let dtTxt = t.downtime ? ` (Kiesés: ${t.downtime} perc)` : ""; 
        return `<div class="card closed" onclick="openModal('${t.id}')"><div class="card-header"><span class="badge badge-closed">Lezárt</span><span style="color: var(--text-muted); font-size: 13px; font-weight:bold;">${dateStr} - ${timeStr}</span></div><div class="machine-name">${reszlegIcon}${prevIcon}${t.gep}</div><div class="issue-desc" style="white-space:pre-wrap;">${t.hiba}</div><div style="margin-bottom:10px; color:var(--pri-normal);"><b>Megoldás:</b><br>${String(t.megoldas||"").replace(/\n/g, '<br>')} <span style="color:var(--text-muted);">(${t.ido||0} perc${dtTxt})</span></div><div class="meta-footer"><div>Beküldte: <b>${t.felhasznalo}</b></div><div style="color: var(--text-muted); font-size:11px;">Részletek 👆</div></div></div>`; 
    }
}

function frissitSzuroGepek() { 
    const k = document.getElementById('szuroKategoria').value; 
    const s = document.getElementById('szuroGep'); 
    s.innerHTML = '<option value="">Összes gép...</option>'; 
    if (k && gepAdatbazis[k]) { 
        if (gepAdatbazis[k].length === 0) { s.add(new Option("Nincs alegység", "-")); } 
        else { 
            s.add(new Option("— Teljes sor / Általános —", "-")); 
            gepAdatbazis[k].forEach(g => s.add(new Option(g, g))); 
        } 
    } 
    renderClosedTasks(); 
}

function getFilteredClosedTasks() {
    const szov = document.getElementById('szuroLezartSzoveg') ? document.getElementById('szuroLezartSzoveg').value.toLowerCase() : ""; 
    const sr = document.getElementById('szuroReszleg') ? document.getElementById('szuroReszleg').value : ""; 
    const sk = document.getElementById('szuroKategoria') ? document.getElementById('szuroKategoria').value : ""; 
    const sg = document.getElementById('szuroGep') ? document.getElementById('szuroGep').value : ""; 
    const st = document.getElementById('filterDatumTol') ? document.getElementById('filterDatumTol').value : ""; 
    const si = document.getElementById('filterDatumIg') ? document.getElementById('filterDatumIg').value : "";
    
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
        let matchSzoveg = szov ? (String(t.hiba).toLowerCase().includes(szov) || String(t.megoldas).toLowerCase().includes(szov) || String(t.gep).toLowerCase().includes(szov) || String(t.felhasznalo).toLowerCase().includes(szov)) : true;
        
        return matchReszleg && matchKat && matchGep && matchTol && matchIg && matchSzoveg; 
    });
}

function renderClosedTasks() { 
    const f = getFilteredClosedTasks(); 
    const c = document.getElementById('closedTaskGrid'); 
    if(!c) return; 
    if(f.length===0){
        c.innerHTML=`<div style="grid-column: 1/-1; text-align: center; margin-top: 50px;"><h3 style="color: var(--text-muted);">Nincs a szűrésnek megfelelő lezárt feladat.</h3></div>`; 
        return;
    } 
    let h = ""; 
    f.forEach(t => h += generateCardHtml(t)); 
    c.innerHTML = h; 
}

function renderScheduleMain() {
    const c = document.getElementById('dashScheduleContainer'); 
    if(!c) return;
    let uniqueBase = new Set([...globalBaseWorkers]); let usersBase = Array.from(uniqueBase).sort(); 
    let uniqueExtra = new Set([...globalExtraWorkers]); let usersExtra = Array.from(uniqueExtra).sort();
    if(usersBase.length === 0 && usersExtra.length === 0) { 
        c.innerHTML = "<div style='text-align:center; padding:30px;'>Nincs dolgozó.</div>"; 
        return; 
    }
    let now = new Date(); let dayOfWeek = now.getDay() || 7; 
    let startDate = new Date(now); startDate.setDate(now.getDate() - dayOfWeek + 1 - 28); 
    let dates = []; 
    for(let i=0; i<63; i++){ let d = new Date(startDate); d.setDate(startDate.getDate() + i); dates.push(d); }
    
    let html = `<div class="sched-container"><table class="sched-table"><thead><tr><th class="sticky-col">Név / Dátum</th>`;
    dates.forEach(d => { 
        let isWorking = isWorkDay(d); 
        let bg = !isWorking ? 'background:rgba(0,0,0,0.05); color:#94a3b8;' : ''; 
        let dStr = d.toLocaleDateString('hu-HU', {month:'short', day:'numeric'}); 
        let isToday = (toLocalISOString(d) === toLocalISOString(now)); 
        if(isToday) bg += 'border-bottom:3px solid var(--pri-high); color:var(--pri-high); font-weight:bold;'; 
        html += `<th style="${bg}">${dStr}</th>`; 
    }); 
    html += `</tr></thead><tbody><tr><td class="sticky-col" style="color:var(--pri-crit);">📞 Ügyeletes</td>`;
    
    dates.forEach(d => { 
        let isWorking = isWorkDay(d); let bg = !isWorking ? 'background:rgba(0,0,0,0.15);' : ''; 
        let dIso = toLocalISOString(d); 
        let match = globalSchedule.find(s => s.datum === dIso && s.user === '__UGYELET__'); 
        let text = match ? match.tipus : ''; let cls = match ? 'cell-ugy' : ''; 
        html += `<td class="sched-cell ${cls}" style="${bg}">${text}</td>`; 
    }); 
    html += `</tr>`;
    
    usersBase.forEach(u => {
        html += `<tr><td class="sticky-col" style="color:var(--text-main); font-weight:bold;">${u}</td>`;
        dates.forEach(d => { 
            let isWorking = isWorkDay(d); let bg = !isWorking ? 'background:rgba(0,0,0,0.15);' : ''; 
            let dIso = toLocalISOString(d); 
            let match = globalSchedule.find(s => s.datum === dIso && s.user === u && s.user !== '__UGYELET__'); 
            let tipus = match ? match.tipus : ''; let cls = ''; let text = '';
            if(tipus === 'Délelőtt') { cls = 'cell-MS'; text = 'Délelőtt'; } 
            else if(tipus === 'Délután') { cls = 'cell-AS'; text = 'Délután'; } 
            else if(tipus === 'Éjszaka') { cls = 'cell-NS'; text = 'Éjszaka'; } 
            else if(tipus === 'Szabadság') { cls = 'cell-H'; text = 'Szabadság'; } 
            else if(tipus === 'Nappal' || tipus === 'Nappali' || tipus === 'Pihenő') { cls = 'cell-O'; text = 'Nappal'; }
            html += `<td class="sched-cell ${cls}" style="${bg}">${text}</td>`;
        }); 
        html += `</tr>`;
    }); 
    
    if (usersExtra.length > 0) {
        html += `<tr><td class="sticky-col" style="background:#f1f5f9; color:var(--text-muted); font-size:12px; text-align:center;" colspan="64">-- TERMELÉS DOLGOZÓI --</td></tr>`;
        usersExtra.forEach(u => {
            html += `<tr><td class="sticky-col" style="color:var(--text-muted);">${u}</td>`;
            dates.forEach(d => { 
                let isWorking = isWorkDay(d); let bg = !isWorking ? 'background:rgba(0,0,0,0.15);' : ''; 
                let dIso = toLocalISOString(d); 
                let match = globalSchedule.find(s => s.datum === dIso && s.user === u && s.user !== '__UGYELET__'); 
                let tipus = match ? match.tipus : ''; let cls = ''; let text = '';
                if(tipus === 'Délelőtt') { cls = 'cell-MS'; text = 'Délelőtt'; } 
                else if(tipus === 'Délután') { cls = 'cell-AS'; text = 'Délután'; } 
                else if(tipus === 'Éjszaka') { cls = 'cell-NS'; text = 'Éjszaka'; } 
                else if(tipus === 'Szabadság') { cls = 'cell-H'; text = 'Szabadság'; } 
                else if(tipus === 'Nappal' || tipus === 'Nappali' || tipus === 'Pihenő') { cls = 'cell-O'; text = 'Nappal'; }
                html += `<td class="sched-cell ${cls}" style="${bg}">${text}</td>`;
            }); 
            html += `</tr>`;
        });
    } 
    html += `</tbody></table></div>`; 
    c.innerHTML = html;
}

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

let activeTaskId = null;
function extendSession() { 
    if(sessionUser) { 
        document.getElementById('activeUserBadge').style.display = 'flex'; 
        document.getElementById('dashUserName').innerText = sessionUser; 
        refreshModalActionPanel(); 
    } 
}

async function dashLogin() { 
    const selEl = document.getElementById('dashLoginNevSelect'); 
    const n = selEl && selEl.value !== "custom" && selEl.value !== "" ? selEl.value : document.getElementById('dashLoginNev').value; 
    const j = document.getElementById('dashLoginPin').value; 
    const stat = document.getElementById('dashLoginStatus'); 
    if(!n || !j) { stat.innerText = "Add meg a PIN-t!"; return; } 
    stat.innerText = "Ellenőrzés..."; 
    try { 
        const res = await secureFetch({ action: "login", nev: n, jelszo: await hashPassword(j) }); 
        const r = await res.json(); 
        if(r.status === "success") { 
            sessionUser = n; 
            sessionRole = r.role || "maintenance"; 
            localStorage.setItem("activeUser", n);
            localStorage.setItem("activeRole", sessionRole);
            localStorage.setItem("sessionToken", r.token); 
            extendSession(); 
            document.getElementById('dashLoginPin').value = ""; 
            stat.innerText = ""; 
        } else { stat.innerText = r.message; } 
    } catch(e) { stat.innerText = "Hiba!"; } 
}

function dashLogout() { 
    sessionUser = null; 
    sessionRole = null; 
    localStorage.removeItem("activeUser"); 
    localStorage.removeItem("activeRole"); 
    localStorage.removeItem("sessionToken"); 
    document.getElementById('activeUserBadge').style.display = 'none'; 
    window.location.href = window.location.pathname; 
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
        <div style="flex:3; display:flex; gap:0; margin:0; border: 1px solid var(--border); border-radius:4px; overflow:hidden;">
            <input type="text" id="dashAlkCikk_${rId}" class="dash-input alk-cikkszam" placeholder="Cikkszám (Raktár)" style="flex:1; margin:0; font-size:13px; padding:6px; border:none; outline:none; min-width:80px;">
            <button type="button" onclick="openPartsModal('dashAlkCikk_${rId}')" title="Raktár kereső" style="background:var(--pri-obs); color:white; border:none; padding:0; width:35px; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center;">🔍</button>
            <button type="button" onclick="openQrScanner('dashAlkCikk_${rId}')" title="QR / Vonalkód olvasás" style="background:var(--pri-info); color:white; border:none; padding:0; width:35px; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center;">📷</button>
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
    
    if (task.megjegyzes) {
        details += `<div style="margin-top:12px; padding:10px; background:rgba(14, 165, 233, 0.15); border-left:4px solid var(--pri-info); border-radius:4px; font-size:14px; white-space:pre-wrap;"><strong style="color:var(--pri-info); display:block; margin-bottom:4px;">💬 Infó / Kommentek:</strong>${String(task.megjegyzes).replace(/\n/g, '<br>')}</div>`;
    }

    if (task.kepek) {
        details += `<div class="img-container" style="display:flex; gap:10px; overflow-x:auto; margin-top:12px;">`;
        String(task.kepek).split(",").forEach(u => {
            if(u.trim()) {
                const m = u.match(/id=([^&]+)/) || u.match(/d\/([a-zA-Z0-9_-]+)/);
                const viewUrl = m ? `https://drive.google.com/file/d/${m[1]}/view` : u.trim();
                const imgSrc = m ? `https://lh3.googleusercontent.com/d/${m[1]}` : u.trim();
                details += `<a href="${viewUrl}" target="_blank"><img src="${imgSrc}" style="max-height:120px; border-radius:6px; border:1px solid var(--border);"></a>`;
            }
        });
        details += `</div>`;
    }

    let parsedData = parseChecklistData(task.checklist); 
    let utasitasHtml = "";
    if (parsedData.ut || parsedData.kep || parsedData.fajl) {
        let mediaHtml = "";
        if (parsedData.kep && String(parsedData.kep).trim() !== "") { 
            let imgUrl = parsedData.kep; let m = parsedData.kep.match(/d\/([a-zA-Z0-9_-]+)/) || parsedData.kep.match(/id=([^&]+)/); 
            if(m && parsedData.kep.includes("drive.google.com")) { imgUrl = `https://lh3.googleusercontent.com/d/${m[1]}`; } 
            mediaHtml += `<a href="${parsedData.kep}" target="_blank"><img src="${imgUrl}" style="max-width:150px; max-height:150px; border-radius:4px; margin-top:5px; cursor:pointer;" alt="Kép"></a><br>`; 
        }
        if (parsedData.fajl && String(parsedData.fajl).trim() !== "") { 
            let fNev = (parsedData.fnev && String(parsedData.fnev).trim() !== "") ? parsedData.fnev : "📄 Dokumentum megnyitása"; 
            mediaHtml += `<a href="${parsedData.fajl}" target="_blank" style="display:inline-block; margin-top:5px; background:var(--pri-normal); color:white; padding:6px 12px; border-radius:4px; text-decoration:none; font-size:12px; font-weight:bold;">${fNev}</a>`; 
        }
        let utText = parsedData.ut ? `<div style="font-size:14px; color:#0f172a; margin-bottom:5px;">${parsedData.ut.replace(/\n/g, '<br>')}</div>` : ""; 
        utasitasHtml = `<div style="background:#f8fafc; border:1px solid #cbd5e1; padding:12px; border-radius:6px; margin-bottom:15px; margin-top:15px;"><strong style="color:var(--pri-obs); display:block; margin-bottom:5px; font-size:15px;">📘 Munkautasítás / Dokumentáció:</strong>${utText}${mediaHtml}</div>`;
    }

    if (parsedData.cl || utasitasHtml) {
        if (task.statusz !== 'Lezárt') {
            let clHtml = "";
            if(parsedData.cl) {
                String(parsedData.cl).split('\n').filter(i => i.trim() !== "").forEach(item => {
                    let text = item.trim();
                    if (text.endsWith(':')) { 
                        clHtml += `<div style="margin-bottom:10px; display:flex; align-items:center; gap:10px;"><span style="flex:1; color:white; font-weight:bold; font-size:14px;">${text}</span> <input type="text" class="dash-input task-cl-input-${task.id}" data-label="${text}" style="flex:1; margin:0; padding:8px; font-size:14px; background:var(--surface);" placeholder="Érték..."></div>`; 
                    } else { 
                        clHtml += `<label style="display:flex; align-items:center; margin-bottom:10px; cursor:pointer; background:var(--surface); padding:8px 12px; border-radius:6px; border:1px solid var(--border);"><input type="checkbox" class="task-cl-chk-${task.id}" data-label="${text}" style="width:20px; height:20px; margin:0; margin-right:12px;"> <span style="font-weight:bold; color:var(--text-main);">${text}</span></label>`; 
                    }
                });
            }
            let checkBoxHtml = clHtml ? `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;"><strong style="color:var(--pri-info); font-size:16px;">📋 Kötelező Checklist:</strong> <button type="button" onclick="checkAllChecklists('${task.id}')" style="background:var(--pri-normal); color:white; border:none; padding:6px 12px; font-size:13px; font-weight:bold; border-radius:4px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.4);">✅ Minden bepipálása</button></div><div id="activeChecklistContainer_${task.id}">${clHtml}</div>` : "";
            details += `${utasitasHtml}`; 
            if (checkBoxHtml) { details += `<div style="background:var(--bg-dark); border:2px solid var(--pri-info); padding:15px; border-radius:8px; margin-top:15px;">${checkBoxHtml}</div>`; }
        } else { 
            details += `${utasitasHtml}`; 
            if (parsedData.cl) { 
                let items = String(parsedData.cl).split('\n').filter(i => i.trim() !== "").map(i => `<li style="margin-bottom:4px;">${i}</li>`).join(''); 
                details += `<div style="background:#0f172a; border:1px solid var(--border); padding:15px; border-radius:6px; margin-top:15px; color:#cbd5e1;"><strong style="color:var(--pri-normal); font-size:16px;">📝 Eredeti Checklist Sablon:</strong><ul style="margin:10px 0 0 0; padding-left:20px;">${items}</ul></div>`; 
            } 
        }
    }

    if (task.statusz === 'Folyamatban') details += `<div style="background: rgba(139, 92, 246, 0.2); padding:10px; border-radius:6px; color:#a78bfa; margin-top:15px; border:1px solid var(--pri-prog);">👷 <b>${task.felelos}</b> dolgozik rajta</div>`; 
    if (task.statusz === 'Lezárt') details += `<div style="background: rgba(16, 185, 129, 0.2); padding:10px; border-radius:6px; color:#10b981; margin-top:15px; border:1px solid var(--pri-normal);">✅ <b>Megoldás:</b><br>${String(task.megoldas||"").replace(/\n/g, '<br>')}</div>`; 
    
    document.getElementById('modalDetails').innerHTML = details; 
    if (document.getElementById('dashMegoldas')) document.getElementById('dashMegoldas').value = ""; 
    if (document.getElementById('dashIdo')) document.getElementById('dashIdo').value = ""; 
    if (document.getElementById('dashDowntime')) document.getElementById('dashDowntime').value = "";
    
    const alkContainer = document.getElementById('alkatreszekContainer');
    if(alkContainer) { 
        alkContainer.innerHTML = `
            <div class="alkatresz-sor" style="display:flex; gap:8px; margin-bottom:5px; align-items:center;">
                <div style="flex:3; display:flex; gap:0; margin:0; border: 1px solid var(--border); border-radius:4px; overflow:hidden;">
                    <input type="text" id="dashAlkCikk_0" class="dash-input alk-cikkszam" placeholder="Cikkszám (Raktár)" style="flex:1; margin:0; font-size:13px; padding:6px; border:none; outline:none; min-width:80px;">
                    <button type="button" onclick="openPartsModal('dashAlkCikk_0')" title="Raktár kereső" style="background:var(--pri-obs); color:white; border:none; padding:0; width:35px; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center;">🔍</button>
                    <button type="button" onclick="openQrScanner('dashAlkCikk_0')" title="QR / Vonalkód olvasás" style="background:var(--pri-info); color:white; border:none; padding:0; width:35px; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center;">📷</button>
                </div>
                <input type="number" class="dash-input alk-db" placeholder="Db" style="flex:1; margin:0; font-size:13px; padding:6px; min-width:40px;">
            </div>`; 
    }
    
    refreshModalActionPanel(); 
    document.getElementById('taskModal').style.display = "flex"; 
    if(sessionUser) extendSession(); 
}

function checkAllChecklists(taskId) { 
    const checkboxes = document.querySelectorAll(`.task-cl-chk-${taskId}`); 
    checkboxes.forEach(cb => cb.checked = true); 
    if(typeof showToast === "function") showToast("Minden pont kijelölve!");
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
    await secureFetch({ action: "startTask", id: activeTaskId, felhasznalo: sessionUser }); 
    fetchDashboardData(); 
    closeModal(true); 
}

async function dashCloseTask() { 
    if(!sessionUser || !activeTaskId) return; 
    let m = document.getElementById(`dashMegoldas`).value.trim(); 
    const i = document.getElementById(`dashIdo`).value; 
    const dt = document.getElementById(`dashDowntime`).value; 
    
    let clResults = ""; 
    document.querySelectorAll(`.task-cl-chk-${activeTaskId}`).forEach(chk => { clResults += (chk.checked ? "✅ " : "❌ (Kihagyva) ") + chk.dataset.label + "\n"; }); 
    document.querySelectorAll(`.task-cl-input-${activeTaskId}`).forEach(inp => { clResults += "📊 " + inp.dataset.label + " " + (inp.value || "-") + "\n"; });
    
    if(m === "" && clResults === "") return alert("A Megoldás mező vagy a Checklist kitöltése kötelező!"); 
    if (clResults !== "") m = m === "" ? "--- CHECKLIST EREDMÉNYEK ---\n" + clResults.trim() : m + "\n\n--- CHECKLIST EREDMÉNYEK ---\n" + clResults.trim();
    
    let alkatreszekTomb = []; 
    document.querySelectorAll('.alkatresz-sor').forEach(sor => { 
        let cz = sor.querySelector('.alk-cikkszam').value.trim(); 
        let db = sor.querySelector('.alk-db').value.trim(); 
        if(cz && db) { alkatreszekTomb.push({ cikkszam: cz, db: parseInt(db) || 1 }); } 
    });
    
    await secureFetch({ action: "closeTask", id: activeTaskId, megoldas: m, ido: i, downtime: dt, lezarta: sessionUser, alkatreszek: alkatreszekTomb }); 
    fetchDashboardData(); 
    closeModal(true); 
}

function exportTasks(taskList, filename = "Feladatok_Export.csv") {
    if (!taskList || taskList.length === 0) { alert("Nincs exportálható feladat!"); return; }
    let csv = "ID;Státusz;Időpont;Rögzítette;Gép;Prioritás;Hiba leírása;Megoldás;Javítási idő (perc);Állásidő (perc);Lezárta\n";
    taskList.forEach(t => {
        let dStr = new Date(t.idopont).toLocaleString('hu-HU');
        csv += `"${t.id}";"${t.statusz}";"${dStr}";"${t.felhasznalo||""}";"${t.gep||""}";"${t.prioritas||""}";"${String(t.hiba||"").replace(/"/g,'""')}";"${String(t.megoldas||"").replace(/"/g,'""')}";"${t.ido||0}";"${t.downtime||0}";"${t.lezarta||""}"\n`;
    });
    let a = document.createElement("a"); 
    a.href = URL.createObjectURL(new Blob(["\ufeff"+csv], {type:'text/csv;charset=utf-8;'})); 
    a.download = filename; 
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function exportClosedTasksPDF() {
    let f = getFilteredClosedTasks();
    if(f.length === 0) { alert("Nincs a szűrésnek megfelelő feladat a PDF-hez!"); return; }
    let win = window.open('', '_blank');
    let html = `<html><head><title>Karbantartási Feladatlapok</title><style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 0; color: #0f172a; }
        @page { size: A4 portrait; margin: 15mm; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .task-sheet { page-break-after: always; } .task-sheet:last-child { page-break-after: auto; } }
        .task-sheet { border: 2px solid #cbd5e1; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 10px; margin-bottom: 15px; }
        .title { font-size: 20px; font-weight: bold; color: #1e293b; text-transform: uppercase; }
        .meta { font-size: 12px; color: #64748b; text-align: right; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px; }
        th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; vertical-align: top; }
        th { background: #f1f5f9; width: 25%; font-weight: bold; color: #334155; }
        .solution-box { background: #f8fafc; border: 1px solid #cbd5e1; padding: 15px; border-radius: 4px; font-size: 13px; white-space: pre-wrap; line-height: 1.5; }
    </style></head><body>`;
    f.forEach(t => {
        const dateStr = new Date(t.idopont).toLocaleString('hu-HU');
        let dtTxt = t.downtime ? `${t.downtime} perc` : "Nincs"; let idoTxt = t.ido ? `${t.ido} perc` : "-";
        let tipusTxt = String(t.id).startsWith("PREV-") ? "Tervezett Karbantartás (Ismétlődő)" : "Eseti Hibajavítás";
        html += `
        <div class="task-sheet">
            <div class="header"><div class="title">Karbantartási Feladatlap</div><div class="meta">Jegy azonosító: <b>${t.id}</b><br>Rögzítve: ${dateStr}</div></div>
            <table>
                <tr><th>Jelleg</th><td><b style="color:#0ea5e9;">${tipusTxt}</b></td></tr>
                <tr><th>Gép / Terület</th><td><b style="font-size:15px;">${t.gep}</b></td></tr>
                <tr><th>Prioritás</th><td>${t.prioritas}</td></tr>
                <tr><th>Feladat leírása</th><td style="white-space:pre-wrap;">${String(t.hiba)}</td></tr>
                <tr><th>Kiírta</th><td>${t.felhasznalo}</td></tr>
            </table>
            <h4 style="margin-bottom:8px; margin-top:20px; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:5px;">Elvégzett munka és Checklist eredmények:</h4>
            <div class="solution-box">${String(t.megoldas || "Nincs megadva megoldás.").replace(/\n/g, '<br>')}</div>
            <table style="margin-top:20px; width:60%;">
                <tr><th>Ráfordított munkaidő</th><td>${idoTxt}</td></tr>
                <tr><th>Gépkiesés (Downtime)</th><td>${dtTxt}</td></tr>
                <tr><th>Feladatot lezárta</th><td style="font-size:14px;"><b>${t.lezarta}</b></td></tr>
            </table>
        </div>`;
    });
    html += `</body></html>`; win.document.write(html); win.document.close(); setTimeout(() => { win.print(); }, 800);
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

document.addEventListener('DOMContentLoaded', () => {
    const dashPin = document.getElementById('dashLoginPin'); 
    if (dashPin) { 
        dashPin.addEventListener('keypress', function(e) { 
            if (e.key === 'Enter') { e.preventDefault(); dashLogin(); } 
        }); 
    }
});