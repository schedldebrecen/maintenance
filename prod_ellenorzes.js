const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbziABd0I2cSep7TveoNoaQZkI5FzxYl4suqSfCR2rD8MXJQNMHPiygbTD8MK0T3Qz40/exec";

const gepAdatbazis = {
    "Production - Line 1": [ "Conv - Szállítástechnika", "Schenck - Szelepszerelő robot", "TPMS1 - Screwing Station Manual - Atlas Copco", "RMS1 - Tire assembly - Hofmann", "RMM1 - Matching machine - Hofmann", "RFG1 - Tire Inflation - Hofmann", "RSO1 - Bead Seat Optimizer - Hofmann", "RGM1 - Tire Uniformity - Hofmann", "AWS1 - Balancing - Hofmann", "WC1 - Weight cutter - Rameckers", "AGS1 - Weight applicator - KUKA" ],
    "Production - Line 2": [ "Conv - Szállítástechnika", "WGS2 - Wheel gauging - IEF Werner", "RMS2 - Tire assembly - Hofmann", "RFG2 - Tire Inflation - Hofmann", "AWS2 - Balancing - Hofmann", "WC2 - Weight cutter - Rameckers", "AGS2 - Weight applicator - KUKA", "AWSK1 - Control Balancing - Hofmann", "TPMS writing /reading - ATEQ", "EOL1 - End of Line control - Mabri Vision" ],
    "Production - Egyedi gépek": [ "MTAM1 - Manual tyre assembly machine - Hofmann", "CUT1 - Bandage Cutting Machine - Cyklop", "HP1 - Hydraulic Press - Strautmann" ],
    "Magasraktár - High Bay System": [ "RBG 1 - Beewen", "RBG 2 - Beewen", "RBG 3 - Beewen", "Conveyors - Blume/Thepas" ],
    "Palettázó B&O": [ "Szekventáló robot - B&O" ],
    "Q-Area": [ "TLIT - Tire leak inspection tank - Corghi", "MTAM2 - Manual tyre assembly machine - Aikido" ]
};

let globalTemplates = [];
let globalLogs = [];
let currentQuestions = [];

window.onload = function() {
    const savedUser = localStorage.getItem("activeUser");
    if(!savedUser) { alert("Nincs bejelentkezett felhasználó! Visszairányítás..."); window.location.href = "production.html"; return; }
    
    document.getElementById('currentUserText').innerText = savedUser;

    populateNavDropdown();
    
    const katSelect = document.getElementById('kategoria');
    for (let kat in gepAdatbazis) { katSelect.add(new Option(kat, kat)); }

    fetchData();
};

function showToast(msg, isError = false) {
    const t = document.getElementById('toastMessage');
    t.style.background = isError ? "var(--pri-crit)" : "var(--pri-normal)";
    t.innerHTML = isError ? "❌ " + msg : "✅ " + msg;
    t.style.display = "block"; setTimeout(() => t.style.opacity = "1", 10);
    setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.style.display = "none", 300); }, 3000);
}

function switchTab(tId, btn) { 
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); 
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active')); 
    document.getElementById(tId).classList.add('active'); 
    if(btn) btn.classList.add('active'); 
}

function frissitGepek() { 
    const k = document.getElementById('kategoria').value; const s = document.getElementById('gep'); 
    s.innerHTML = '<option value="">Válassz gépet...</option>'; 
    if (k && gepAdatbazis[k]) { 
        if (gepAdatbazis[k].length === 0) { s.add(new Option("Nincs alegység", "-")); } 
        else { s.add(new Option("— Teljes sor / Általános —", "-")); gepAdatbazis[k].forEach(g => s.add(new Option(g, g))); } 
    } 
    checkTemplates();
}

async function fetchData() {
    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getChecklistTemplates" }) });
        const r = await res.json();
        if(r.status === "success") { globalTemplates = r.data; checkTemplates(); }
    } catch(e) { console.error("Sablon hiba", e); }
}

async function loadLogs() {
    document.getElementById('logsContainer').innerHTML = "Adatok betöltése...";
    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "getChecklistLogs" }) });
        const r = await res.json();
        if(r.status === "success") { globalLogs = r.data; renderLogs(); }
    } catch(e) { document.getElementById('logsContainer').innerHTML = "Hiba a letöltéskor!"; }
}

function checkTemplates() {
    const k = document.getElementById('kategoria').value; const g = document.getElementById('gep').value;
    document.getElementById('wizardFormContainer').style.display = 'none';
    
    if(!k || !g) { 
        document.getElementById('startWizardBtnContainer').style.display = 'none'; 
        document.getElementById('noTemplateMsg').style.display = 'none'; return; 
    }
    
    const gepNeve = (g === "-") ? k : k + " - " + g;
    currentQuestions = globalTemplates.filter(t => t.gep === gepNeve);
    
    if (currentQuestions.length > 0) {
        document.getElementById('noTemplateMsg').style.display = 'none';
        document.getElementById('startWizardBtnContainer').style.display = 'block';
        document.getElementById('pontDb').innerText = currentQuestions.length;
    } else {
        document.getElementById('noTemplateMsg').style.display = 'block';
        document.getElementById('startWizardBtnContainer').style.display = 'none';
    }
}

function startWizard() {
    document.getElementById('startWizardBtnContainer').style.display = 'none';
    document.getElementById('kategoria').disabled = true;
    document.getElementById('gep').disabled = true;
    
    const k = document.getElementById('kategoria').value; const g = document.getElementById('gep').value;
    document.getElementById('wizardGepNev').innerText = (g === "-") ? k : k + " - " + g;
    
    let html = "";
    currentQuestions.forEach((q, index) => {
        let prioSzoveg = q.prioritas ? `(Ha hibás, a CMMS jegy prioritása: <b>${q.prioritas}</b>)` : "";
        html += `
        <div class="wizard-card" id="qCard_${index}">
            <div class="wizard-header">${index + 1}. ${q.pontNeve} <span style="font-size:12px; color:var(--text-muted); font-weight:normal; margin-left:10px;">Gyorsaság: ${q.frekvencia}</span></div>
            <div style="margin-bottom:15px; font-size:15px; color:var(--text-main);"><b>Elvárt állapot:</b> ${q.elvart}</div>
            
            <div class="wizard-options">
                <div class="radio-btn-container">
                    <input type="radio" name="rad_${index}" id="ok_${index}" value="OK" onchange="toggleNokPanel(${index}, false)">
                    <label for="ok_${index}" class="radio-btn-label lbl-ok">✔️ Rendben (OK)</label>
                </div>
                <div class="radio-btn-container">
                    <input type="radio" name="rad_${index}" id="nok_${index}" value="NOK" onchange="toggleNokPanel(${index}, true)">
                    <label for="nok_${index}" class="radio-btn-label lbl-nok">❌ Hibás (Nem OK)</label>
                </div>
            </div>
            
            <div class="wizard-nok-panel" id="nokPanel_${index}">
                <label style="font-weight:bold; color:var(--pri-crit); display:block; margin-bottom:5px;">Hiba leírása (CMMS jegy nyílik belőle!)</label>
                <textarea id="nokText_${index}" rows="2" placeholder="Írd le pontosan, mit tapasztaltál... Kötelező!"></textarea>
                <div style="font-size:12px; color:var(--pri-crit); margin-top:5px;">${prioSzoveg}</div>
            </div>
        </div>`;
    });
    
    document.getElementById('questionsContainer').innerHTML = html;
    document.getElementById('wizardFormContainer').style.display = 'block';
    document.getElementById('btnSubmitChecklist').style.display = 'block';
    updateProgress();
}

function toggleNokPanel(idx, isNok) {
    const panel = document.getElementById(`nokPanel_${idx}`);
    if(isNok) { panel.style.display = 'block'; document.getElementById(`nokText_${idx}`).focus(); } 
    else { panel.style.display = 'none'; document.getElementById(`nokText_${idx}`).value = ""; }
    updateProgress();
}

function updateProgress() {
    let answered = 0;
    currentQuestions.forEach((q, idx) => {
        if(document.getElementById(`ok_${idx}`).checked || document.getElementById(`nok_${idx}`).checked) answered++;
    });
    const percent = (answered / currentQuestions.length) * 100;
    document.getElementById('progressBar').style.width = percent + "%";
    document.getElementById('wizardProgressText').innerText = `${answered} / ${currentQuestions.length} kitöltve`;
    
    if (answered === currentQuestions.length) document.getElementById('progressBar').style.background = "var(--pri-normal)";
    else document.getElementById('progressBar').style.background = "var(--pri-info)";
}

async function submitChecklist() {
    let results = [];
    let cmmsHibak = [];
    let isAllOk = true;
    let allAnswered = true;

    for (let i = 0; i < currentQuestions.length; i++) {
        let q = currentQuestions[i];
        let val = null;
        if(document.getElementById(`ok_${i}`).checked) val = "OK";
        else if(document.getElementById(`nok_${i}`).checked) val = "NOK";
        
        if(!val) { alert(`Hiba: Nem válaszoltál a(z) ${i+1}. kérdésre! Minden ellenőrzőpont kitöltése kötelező!`); allAnswered = false; break; }

        let megjegyzes = "";
        if (val === "NOK") {
            isAllOk = false;
            megjegyzes = document.getElementById(`nokText_${i}`).value.trim();
            if(!megjegyzes) { alert(`Hiba: A(z) ${i+1}. kérdésnél NOK-ot jelöltél! Kérlek, írd le a hiba okát a CMMS jegyhez!`); allAnswered = false; break; }
            
            cmmsHibak.push({ pontNeve: q.pontNeve, megjegyzes: megjegyzes, prioritas: q.prioritas });
        }

        results.push({ pontNeve: q.pontNeve, ertek: val, megjegyzes: megjegyzes });
    }

    if(!allAnswered) return;
    
    if(!isAllOk) {
        if(!confirm(`⚠️ FIGYELEM!\n\n${cmmsHibak.length} db hibát rögzítettél. A rendszer ezekből automatikusan nyitni fog ${cmmsHibak.length} db CMMS hibajegyet a Karbantartás felé.\n\nBiztosan elküldöd?`)) return;
    }

    const btn = document.getElementById('btnSubmitChecklist');
    btn.disabled = true; btn.innerText = "⏳ Mentés folyamatban...";

    const payload = {
        action: "saveChecklist",
        felhasznalo: localStorage.getItem("activeUser"),
        gep: document.getElementById('wizardGepNev').innerText,
        eredmenyek: results,
        hibak: cmmsHibak,
        isAllOk: isAllOk
    };

    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) });
        if((await res.json()).status === "success") {
            showToast("Ellenőrzőlista és esetleges CMMS jegyek rögzítve!");
            
            // Űrlap törlése (Alapállapot)
            document.getElementById('wizardFormContainer').style.display = 'none';
            document.getElementById('kategoria').disabled = false; document.getElementById('kategoria').value = "";
            document.getElementById('gep').disabled = false; document.getElementById('gep').innerHTML = '<option value="">Előbb válassz kategóriát...</option>';
            document.getElementById('startWizardBtnContainer').style.display = 'none';
        }
    } catch (e) { showToast("Hálózati hiba!", true); } finally { btn.disabled = false; btn.innerText = "💾 Kész! Eredmények Mentése"; }
}

function renderLogs() {
    const c = document.getElementById('logsContainer');
    const sUser = document.getElementById('szuroUser').value.toLowerCase();
    const sAll = document.getElementById('szuroSikeres').value;
    const sTol = document.getElementById('szuroTol').value;
    const sIg = document.getElementById('szuroIg').value;

    let f = globalLogs.filter(l => {
        let d = String(l.idopont).substring(0,10);
        return (String(l.operator).toLowerCase().includes(sUser)) &&
               (sAll ? l.sikeres === sAll : true) &&
               (sTol ? d >= sTol : true) &&
               (sIg ? d <= sIg : true);
    });

    if(f.length === 0) { c.innerHTML = "Nincs a szűrésnek megfelelő napló."; return; }

    let html = "";
    f.forEach(l => {
        let dStr = new Date(l.idopont).toLocaleString('hu-HU');
        let bgColor = (l.sikeres === "Igen") ? "var(--pri-normal)" : "var(--pri-crit)";
        let statuszSzoveg = (l.sikeres === "Igen") ? "✅ Rendben (Sikeres)" : "❌ Talált hibát (CMMS nyitva)";
        
        let jsonRes = [];
        try { jsonRes = JSON.parse(l.eredmenyek); } catch(e) {}
        
        let listaSzoveg = "";
        jsonRes.forEach(r => {
            if(r.ertek === "OK") listaSzoveg += `✔️ ${r.pontNeve}<br>`;
            else listaSzoveg += `<b style="color:var(--pri-crit);">❌ ${r.pontNeve}</b> <small>(${r.megjegyzes})</small><br>`;
        });

        html += `
        <div class="task-card" style="border-left-color: ${bgColor};">
            <div class="task-header"><span>${dStr}</span> <span class="badge" style="background:${bgColor};">${statuszSzoveg}</span></div>
            <div class="task-title">${l.gep}</div>
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">Operátor: <b>${l.operator}</b></div>
            <div style="background:#f8fafc; padding:10px; border-radius:6px; border:1px solid var(--border); font-size:13px; line-height:1.5;">${listaSzoveg}</div>
        </div>`;
    });
    c.innerHTML = html;
}

function exportChecklogs() {
    const sUser = document.getElementById('szuroUser').value.toLowerCase(); const sAll = document.getElementById('szuroSikeres').value;
    const sTol = document.getElementById('szuroTol').value; const sIg = document.getElementById('szuroIg').value;

    let f = globalLogs.filter(l => { let d = String(l.idopont).substring(0,10); return (String(l.operator).toLowerCase().includes(sUser)) && (sAll ? l.sikeres === sAll : true) && (sTol ? d >= sTol : true) && (sIg ? d <= sIg : true); });
    if(f.length === 0) return alert("Nincs exportálható adat!");

    let csv = "Időpont;Operátor;Gép;Állapot;Részletes eredmények\n";
    f.forEach(l => {
        let dStr = new Date(l.idopont).toLocaleString('hu-HU');
        let reszlet = "";
        try { let j = JSON.parse(l.eredmenyek); j.forEach(r => { reszlet += `${r.pontNeve}: ${r.ertek} ${r.megjegyzes ? '('+r.megjegyzes+')' : ''} | `; }); } catch(e) {}
        csv += `"${dStr}";"${l.operator}";"${l.gep}";"${l.sikeres}";"${reszlet}"\n`;
    });

    let a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff"+csv], {type: 'text/csv;charset=utf-8;'}));
    a.download = `Ellenorzolista_Export.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
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