// --- CMMS KÖZÖS KONFIGURÁCIÓ ÉS FUNKCIÓK (common.js) ---
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbziABd0I2cSep7TveoNoaQZkI5FzxYl4suqSfCR2rD8MXJQNMHPiygbTD8MK0T3Qz40/exec";

const gepAdatbazis = { "Production - Line 1": [ "Conv - Szállítástechnika", "Schenck - Szelepszerelő robot", "TPMS1 - Screwing Station Manual - Atlas Copco", "RMS1 - Tire assembly - Hofmann", "RMM1 - Matching machine - Hofmann", "RFG1 - Tire Inflation - Hofmann", "RSO1 - Bead Seat Optimizer - Hofmann", "RGM1 - Tire Uniformity - Hofmann", "AWS1 - Balancing - Hofmann", "WC1 - Weight cutter - Rameckers", "AGS1 - Weight applicator - KUKA" ], "Production - Line 2": [ "Conv - Szállítástechnika", "WGS2 - Wheel gauging - IEF Werner", "RMS2 - Tire assembly - Hofmann", "RFG2 - Tire Inflation - Hofmann", "AWS2 - Balancing - Hofmann", "WC2 - Weight cutter - Rameckers", "AGS2 - Weight applicator - KUKA", "AWSK1 - Control Balancing - Hofmann", "TPMS writing /reading - ATEQ", "EOL1 - End of Line control - Mabri Vision" ], "Production - Egyedi gépek": [ "MTAM1 - Manual tyre assembly machine - Hofmann", "CUT1 - Bandage Cutting Machine - Cyklop", "HP1 - Hydraulic Press - Strautmann" ], "Magasraktár - High Bay System": [ "RBG 1 - Beewen", "RBG 2 - Beewen", "RBG 3 - Beewen", "Conveyors - Blume/Thepas" ], "Palettázó B&O": [ "Szekventáló robot - B&O" ], "Q-Area": [ "TLIT - Tire leak inspection tank - Corghi", "MTAM2 - Manual tyre assembly machine - Aikido" ], "Facility": [ "Épülettel kapcsolatos dolgok" ], "IT": [ "Szerverek", "Hálózati eszközök (Switch/AP)", "Kliens gépek (PC/Laptop)", "Nyomtatók és szkennerek", "Szoftver és rendszerek", "Egyéb IT eszköz" ], "Compressors": [ "DRAIN - Drain Water Separator - Boge", "COMP1 - Compressor 1 - Boge", "DRY1 - Air Dryer 1 - Beko", "COMP2 - Compressor 2 - Boge", "DRY2 - Air Dryer 2 - Beko", "COMP3 - Compressor 3 - Boge" ], "Aggregátor": [] };
const huHolidays = ["2026-01-01", "2026-03-15", "2026-04-03", "2026-04-06", "2026-05-01", "2026-05-25", "2026-08-20", "2026-10-23", "2026-11-01", "2026-12-24", "2026-12-25", "2026-12-26"]; const huWorkWeekends = ["2026-08-08", "2026-12-12"];

// --- OFFLINE MÓD TÁMOGATÁSSAL ELLÁTOTT HÁLÓZATI HÍVÓ ---
async function secureFetch(payload) {
    if (payload.action !== "login" && payload.action !== "getUsers") { payload.token = localStorage.getItem("sessionToken"); }
    
    if (!navigator.onLine) {
        if (["addTask", "closeTask", "addShiftLog"].includes(payload.action)) {
            let queue = JSON.parse(localStorage.getItem('cmms_offline_queue') || '[]');
            queue.push(payload); localStorage.setItem('cmms_offline_queue', JSON.stringify(queue));
            showToast("Nincs internet! Adat elmentve offline módba.", true);
            return { json: () => Promise.resolve({status: "success", offline: true}) };
        } else {
            throw new Error("Nincs hálózat az adatok letöltéséhez!");
        }
    }

    try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) });
        const rawText = await res.text();
        if (rawText.trim().startsWith("<!DOCTYPE") || rawText.trim().startsWith("<html")) throw new Error("Szerver hiba (HTML)!");
        const data = JSON.parse(rawText);
        if (data.status === "error" && String(data.message).includes("ACCESS_DENIED")) { 
            localStorage.removeItem("activeUser");
            localStorage.removeItem("activeRole");
            localStorage.removeItem("sessionToken");

            if (typeof showSessionPopup === 'function') {
                window.isSessionExpired = true;
                showSessionPopup();
            } else if (document.getElementById('loginView')) {
                const lockdownEl = document.getElementById('lockdownScreen');
                const isLockdown = lockdownEl && lockdownEl.style.display !== 'none';
                window.isSessionExpired = !isLockdown;
                
                alert("Biztonsági munkamenet lejárt! Kérlek, jelentkezz be újra.");
                
                if (document.getElementById('appView')) document.getElementById('appView').style.display = 'none';
                if (lockdownEl) lockdownEl.style.display = 'none';
                document.getElementById('loginView').style.display = 'block';
                
                document.querySelectorAll('[id^="lockdownApprBtn_"]').forEach(btn => {
                    btn.disabled = false;
                    btn.innerText = "✅ Jóváhagyom";
                });
            } else if (typeof dashLogout === 'function') {
                alert("Biztonsági munkamenet lejárt! Kérlek, jelentkezz be újra.");
                dashLogout();
            } else {
                alert("Biztonsági munkamenet lejárt! Kérlek, jelentkezz be újra.");
                location.reload();
            }
            throw new Error("ACCESS_DENIED"); 
        }
        return { json: () => Promise.resolve(data) };
    } catch (e) { throw e; }
}

// OFFLINE ADATOK SZINKRONIZÁLÁSA AMINT VISSZAJÖN A NET
window.addEventListener('online', async () => {
    let queue = JSON.parse(localStorage.getItem('cmms_offline_queue') || '[]');
    if (queue.length > 0) {
        showToast("Internet helyreállt! Offline adatok szinkronizálása...");
        let failed = [];
        for (let p of queue) {
            try { await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(p) }); } 
            catch(e) { failed.push(p); }
        }
        localStorage.setItem('cmms_offline_queue', JSON.stringify(failed));
        if (failed.length === 0) showToast("Minden offline adat szinkronizálva!");
        if (typeof loadTasks === 'function') loadTasks();
        if (typeof fetchDashboardData === 'function') fetchDashboardData();
    }
});

// --- QR ÉS VONALKÓD OLVASÓ MODUL ---
let html5QrcodeScanner = null;
let qrTargetInput = null;

function openQrScanner(targetId) {
    qrTargetInput = targetId;
    let modal = document.getElementById('qrModal');
    if(!modal) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="qrModal" style="display:flex; z-index:10000;" onclick="closeQrScanner(event)">
            <div class="modal-content" onclick="event.stopPropagation()" style="text-align:center; padding:15px; width:100%; max-width:400px;">
                <h3 style="margin-top:0; color:var(--primary);">📷 QR / Vonalkód Olvasó</h3>
                <div id="qr-reader" style="width:100%;"></div>
                <button class="btn-secondary" style="margin-top:15px; width:100%;" onclick="closeQrScanner(true)">Bezárás</button>
            </div>
        </div>`);
    } else { modal.style.display = 'flex'; }
    html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: {width: 250, height: 250} }, false);
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
}

function closeQrScanner(force = false) {
    if(force === true || (event && event.target.id === 'qrModal')) {
        document.getElementById('qrModal').style.display = 'none';
        if(html5QrcodeScanner) { html5QrcodeScanner.clear(); html5QrcodeScanner = null; }
    }
}

function onScanSuccess(decodedText, decodedResult) {
    closeQrScanner(true);
    showToast("Kód beolvasva!");
    if (qrTargetInput === 'gep') {
        let foundKat = null;
        for(let kat in gepAdatbazis) { if (gepAdatbazis[kat].includes(decodedText)) { foundKat = kat; break; } }
        if (foundKat) {
            document.getElementById('kategoria').value = foundKat;
            if(typeof frissitGepek === 'function') frissitGepek();
            setTimeout(() => { document.getElementById('gep').value = decodedText; }, 100);
        } else { document.getElementById('hiba').value = decodedText + " (Vonalkód adat)"; }
    } else {
        let input = document.getElementById(qrTargetInput);
        if(input) {
            input.value = decodedText;
            if(typeof filterPartsList === 'function' && qrTargetInput === 'partsSearchInput') filterPartsList();
        }
    }
}
function onScanFailure(error) {}

// --- SEGÉDFÜGGVÉNYEK ---
function parseChecklistData(raw) {
    let res = { cl: "", ut: "", kep: "", fajl: "", fnev: "" }; if (!raw) return res; let text = String(raw);
    let mU = text.match(/[UT]([\s\S]*?)\[\/UT\]/); if(mU){ res.ut = mU[1]; text = text.replace(mU[0],""); }
    let mK = text.match(/[KEP]([\s\S]*?)\[\/KEP\]/); if(mK){ res.kep = mK[1]; text = text.replace(mK[0],""); }
    let mF = text.match(/[FAJL]([\s\S]*?)\[\/FAJL\]/); if(mF){ res.fajl = mF[1]; text = text.replace(mF[0],""); }
    let mFN = text.match(/[FNEV]([\s\S]*?)\[\/FNEV\]/); if(mFN){ res.fnev = mFN[1]; text = text.replace(mFN[0],""); }
    res.cl = text.trim(); return res;
}

function isWorkDay(dObj) { let dStr = toLocalISOString(dObj); if (huWorkWeekends.includes(dStr)) return true; if (huHolidays.includes(dStr)) return false; let day = dObj.getDay(); return day !== 0 && day !== 6; }
function toLocalISOString(dateObj) { if(isNaN(dateObj)) return ""; const y = dateObj.getFullYear(), m = String(dateObj.getMonth() + 1).padStart(2, '0'), d = String(dateObj.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }
function getWorkingMinutes(startDateStr, endDateStr) { let start = new Date(startDateStr); let end = new Date(endDateStr); if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) return 0; let totalMinutes = 0; let current = new Date(start); while (current < end) { if (isWorkDay(current)) { let startOfDay = new Date(current); startOfDay.setHours(6, 0, 0, 0); let endOfDay = new Date(current); endOfDay.setHours(22, 0, 0, 0); let periodStart = current > startOfDay ? current : startOfDay; let periodEnd = end < endOfDay ? end : endOfDay; if (periodStart < periodEnd) totalMinutes += (periodEnd - periodStart) / 60000; } current.setDate(current.getDate() + 1); current.setHours(0, 0, 0, 0); } return totalMinutes; }
function showToast(msg, isError = false) { const t = document.getElementById('toastMessage'); if(!t) return; t.style.background = isError ? "var(--pri-crit)" : "var(--pri-normal)"; t.innerHTML = isError ? "❌ " + msg : "✅ " + msg; t.style.display = "block"; setTimeout(() => t.style.opacity = "1", 10); setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.style.display = "none", 300); }, 3000); }
async function hashPassword(p) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p)); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''); }
async function compressImage(file) { return new Promise((resolve) => { const reader = new FileReader(); reader.onload = (e) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); const scale = 1024 / img.width; canvas.width = 1024; canvas.height = img.height * scale; canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); resolve({ base64: canvas.toDataURL('image/jpeg', 0.7).split(',')[1], tipus: 'image/jpeg' }); }; img.src = e.target.result; }; reader.readAsDataURL(file); }); }