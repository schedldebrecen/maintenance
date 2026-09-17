function doGet(e) { return ContentService.createTextOutput("CMMS API Fut!"); }

function clearCache() {
  var cache = CacheService.getScriptCache();
  cache.remove("CMMS_DATA_production");
  cache.remove("CMMS_DATA_maintenance");
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var isProd = (data.reszleg === 'production');
    var ismetlodoSheetName = isProd ? "Prod_Ismetlodo" : "Ismetlodo";
    var muszaknaploSheetName = isProd ? "Prod_Muszakatadas" : "Muszakatadas";
    var beosztasSheetName = isProd ? "Prod_Beosztas" : "Beosztas";
    var cacheKey = "CMMS_DATA_" + (isProd ? "production" : "maintenance");

    if (action === "getUsers") {
      var userSheet = ss.getSheetByName("Felhasznalok");
      if (!userSheet) return createResponse({ status: "success", data: [] });
      var users = userSheet.getDataRange().getValues();
      var nameList = [];
      for (var i = 1; i < users.length; i++) { if (users[i][0] !== "") nameList.push(String(users[i][0]).trim()); }
      return createResponse({ status: "success", data: nameList });
    }

    else if (action === "login") {
      var userSheet = ss.getSheetByName("Felhasznalok"); var users = userSheet.getDataRange().getValues();
      for (var i = 1; i < users.length; i++) {
        if (users[i][0] === data.nev && users[i][1].toString() === data.jelszo) {
          var role = users[i][2] ? users[i][2].toString().toLowerCase().trim() : "production";
          return createResponse({ status: "success", role: role });
        }
      }
      return createResponse({ status: "error", message: "Hibás név vagy PIN kód!" });
    }

    // --- GYORSÍTÓTÁRAZOTT ADATLEKÉRÉS ---
    else if (action === "getAllData") {
      var cache = CacheService.getScriptCache();
      var cachedData = cache.get(cacheKey);
      
      // Ha van adat a memóriában, azonnal visszaküldjük a Google Sheet olvasása nélkül!
      if (cachedData) {
          return createResponse({ status: "success", data: JSON.parse(cachedData), cached: true });
      }

      var res = { tasks: [], shiftLogs: [], expectedApprovers: [], schedule: [], baseWorkers: [], extraWorkers: [], checklistSablon: [], checklistNaplo: [] };
      
      var taskSheet = ss.getSheetByName("Feladatok");
      if (taskSheet) {
          var taskRows = taskSheet.getDataRange().getValues();
          for (var i = 1; i < taskRows.length; i++) {
              if (taskRows[i][0] === "" || taskRows[i][0] === "ID") continue;
              res.tasks.push({ id: taskRows[i][0], statusz: taskRows[i][1], idopont: taskRows[i][2], felhasznalo: taskRows[i][3], gep: taskRows[i][4], hiba: taskRows[i][5], prioritas: taskRows[i][6], megoldas: taskRows[i][7], ido: taskRows[i][8], kepek: taskRows[i][9], lezarta: taskRows[i][10] || "", felelos: taskRows[i][11] || "", checklist: taskRows[i][12] || "", downtime: taskRows[i][13] || "", startIdopont: taskRows[i][14] || "" });
          }
          res.tasks.reverse();
      }

      var userSheet = ss.getSheetByName("Felhasznalok");
      if(userSheet) {
          var usersData = userSheet.getDataRange().getValues();
          for (var u = 1; u < usersData.length; u++) {
              var uRole = String(usersData[u][2]).toLowerCase().trim(); var uName = String(usersData[u][0]).trim();
              if (uName && uName !== "Név") {
                  if (isProd) { if (uRole === "production" || uRole === "superuser" || uName.toLowerCase() === "szakalyT".toLowerCase()) { if (res.expectedApprovers.indexOf(uName) === -1) res.expectedApprovers.push(uName); if (res.baseWorkers.indexOf(uName) === -1) res.baseWorkers.push(uName); } } 
                  else { if (uRole === "maintenance" || uRole === "superuser" || uName.toLowerCase() === "szabop".toLowerCase()) { if (res.expectedApprovers.indexOf(uName) === -1) res.expectedApprovers.push(uName); if (res.baseWorkers.indexOf(uName) === -1) res.baseWorkers.push(uName); } }
              }
          }
      }

      var schedSheet = ss.getSheetByName(beosztasSheetName);
      if (schedSheet) {
          var schedRows = schedSheet.getDataRange().getValues();
          for (var i = 1; i < schedRows.length; i++) {
              if(schedRows[i][0] && schedRows[i][2] && String(schedRows[i][2]).trim() !== ""){
                 var dStr = ""; try { dStr = Utilities.formatDate(new Date(schedRows[i][0]), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd"); } catch(err) { dStr = String(schedRows[i][0]).slice(0, 10); }
                 res.schedule.push({datum: dStr, user: String(schedRows[i][1]).trim(), tipus: schedRows[i][2]});
              }
              if (schedRows[i][5] && String(schedRows[i][5]).trim() !== "") {
                 var wName = String(schedRows[i][5]).trim();
                 if (res.baseWorkers.indexOf(wName) === -1 && res.extraWorkers.indexOf(wName) === -1) res.extraWorkers.push(wName);
              }
          }
      }

      var shiftSheet = ss.getSheetByName(muszaknaploSheetName); var existingMap = {};
      if(shiftSheet) {
          var shiftRows = shiftSheet.getDataRange().getValues(); var count = 0;
          for (var i = shiftRows.length - 1; i >= 0; i--) { 
              var elsoCella = String(shiftRows[i][0]).toLowerCase(); if(elsoCella === "" || elsoCella === "időpont" || elsoCella === "idopont") continue; 
              var rawDatum = shiftRows[i][6] ? shiftRows[i][6] : shiftRows[i][0]; var bizDatum = ""; try { bizDatum = Utilities.formatDate(new Date(rawDatum), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd"); } catch(err) { bizDatum = String(rawDatum).slice(0, 10); }
              var muszakNev = String(shiftRows[i][2]).trim(); existingMap[bizDatum + "_" + muszakNev] = true;
              var bekuldo = String(shiftRows[i][1]).trim(); var rawJovahagyok = shiftRows[i][7] ? String(shiftRows[i][7]) : ""; var arr = rawJovahagyok.split(",").map(function(x){return x.trim();}).filter(function(x){return x !== "";}); var lowerArr = arr.map(function(x){ return x.toLowerCase(); }); if (bekuldo && lowerArr.indexOf(bekuldo.toLowerCase()) === -1) arr.push(bekuldo);
              res.shiftLogs.push({ id: shiftRows[i][4] || ("RÉGI-" + i), oldTimestamp: shiftRows[i][0], idopont: shiftRows[i][0], datum: bizDatum, felhasznalo: shiftRows[i][1], muszak: shiftRows[i][2], szoveg: shiftRows[i][3], jovahagyok: arr.join(", "), hianyzo: false });
              count++; if(count >= 150) break; 
          }
      }

      var now = new Date();
      for (var i = 1; i < res.schedule.length; i++) {
          var sDate = res.schedule[i].datum; var sType = String(res.schedule[i].tipus).trim();
          if (sDate >= "2026-09-01" && sDate <= Utilities.formatDate(now, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd")) {
              var muszakTeljesNev = "";
              if (sType.indexOf("Délelőtt") !== -1) muszakTeljesNev = "Délelőtt (06:00-14:00)"; else if (sType.indexOf("Délután") !== -1) muszakTeljesNev = "Délután (14:00-22:00)"; else if (sType.indexOf("Éjszaka") !== -1) muszakTeljesNev = "Éjszaka (22:00-06:00)";
              if (muszakTeljesNev && !existingMap[sDate + "_" + muszakTeljesNev]) {
                  var logDateObj = new Date(sDate + "T00:00:00"); var muszakVégeH = 0;
                  if(muszakTeljesNev.indexOf("Délelőtt") !== -1) muszakVégeH = 14; else if(muszakTeljesNev.indexOf("Délután") !== -1) muszakVégeH = 22; else if(muszakTeljesNev.indexOf("Éjszaka") !== -1) muszakVégeH = 6; 
                  var vegeIdopont = new Date(logDateObj); if (muszakVégeH === 6) vegeIdopont.setDate(vegeIdopont.getDate() + 1); vegeIdopont.setHours(muszakVégeH, 0, 0, 0);
                  if (now >= vegeIdopont) {
                      existingMap[sDate + "_" + muszakTeljesNev] = true; 
                      res.shiftLogs.unshift({ id: "HIANYZIK_" + sDate + "_" + muszakTeljesNev, oldTimestamp: new Date(), idopont: new Date(), datum: sDate, felhasznalo: "Rendszer (Hiányzó)", muszak: muszakTeljesNev, szoveg: "⚠️ FIGYELEM: Erre a műszakra egyáltalán nem rögzítettek naplót!", jovahagyok: "", hianyzo: true });
                  }
              }
          }
      }

      var sablonSheet = ss.getSheetByName("Prod_M_Sablon");
      if(sablonSheet) {
          var sablonRows = sablonSheet.getDataRange().getValues();
          for(var i=1; i<sablonRows.length; i++) {
              if(sablonRows[i][1] || sablonRows[i][3]) { 
                  res.checklistSablon.push({ id: sablonRows[i][0], terulet: sablonRows[i][1], gep: sablonRows[i][2], kerdes: sablonRows[i][3], gyakorisag: sablonRows[i][4], muszakok: sablonRows[i][5], utasitas: sablonRows[i][6] || "", kep: sablonRows[i][7] || "", fajl: sablonRows[i][8] || "" });
              }
          }
      }
      var naploSheet = ss.getSheetByName("Prod_M_Naplo");
      if(naploSheet) {
          var naploRows = naploSheet.getDataRange().getValues();
          for(var i=naploRows.length-1; i>=1; i--) {
              var rawDatum = naploRows[i][0]; var dStr = ""; try { dStr = Utilities.formatDate(new Date(rawDatum), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd"); } catch(err) { dStr = String(rawDatum).slice(0, 10); }
              res.checklistNaplo.push({ datum: dStr, muszak: naploRows[i][1], kitolto: naploRows[i][2] });
              if(res.checklistNaplo.length >= 60) break; 
          }
      }
      
      // Adatok eltárolása a memóriába 6 órára (ha nem jön módosítás addig)
      cache.put(cacheKey, JSON.stringify(res), 21600);
      return createResponse({ status: "success", data: res, cached: false });
    }

    // --- MÓDOSÍTÓ AKCIÓK (Törlik a Cache-t) ---
    else if (action === "saveShiftChecklist") {
        var sheet = ss.getSheetByName("Prod_M_Naplo"); if(!sheet) { sheet = ss.insertSheet("Prod_M_Naplo"); sheet.appendRow(["Dátum", "Műszak", "Kitöltő Neve", "Eredmények (JSON)", "Státusz"]); }
        sheet.appendRow([data.datum, data.muszak, data.felhasznalo, JSON.stringify(data.eredmenyek), "Kitöltve"]);
        if (data.hibak && data.hibak.length > 0) {
            var taskSheet = ss.getSheetByName("Feladatok"); var timestamp = new Date();
            for (var h=0; h<data.hibak.length; h++) {
                var taskId = "PROD-KB-" + Math.floor(1000 + Math.random() * 9000); var gepNev = data.hibak[h].gep || data.hibak[h].terulet || "Termelés"; var hibaSzoveg = "Ellenőrzőlista hiba:\n" + data.hibak[h].kerdes + "\n\nOperátori megjegyzés:\n" + data.hibak[h].megjegyzes;
                taskSheet.appendRow([ taskId, "Nyitott", timestamp, data.felhasznalo, gepNev, hibaSzoveg, "Magas prioritás", "", "", "", "", "", "", "", "" ]);
            }
        }
        clearCache(); return createResponse({ status: "success" });
    }

    else if (action === "addChecklistSablon") {
        var sheet = ss.getSheetByName("Prod_M_Sablon"); if(!sheet) { sheet = ss.insertSheet("Prod_M_Sablon"); sheet.appendRow(["ID", "Terület", "Gép", "Kérdés", "Gyakoriság", "Műszakok", "Utasítás", "Kép", "Fájl"]); }
        sheet.appendRow(["SAB-" + new Date().getTime(), data.terulet || "", data.gep || "", data.kerdes, data.gyakorisag || "Minden nap", data.muszakok || "Délelőtt, Délután, Éjszaka", data.utasitas || "", data.kep || "", data.fajl || ""]);
        clearCache(); return createResponse({ status: "success" });
    }

    else if (action === "deleteChecklistSablon") {
        var sheet = ss.getSheetByName("Prod_M_Sablon"); var rows = sheet.getDataRange().getValues();
        for(var i=1; i<rows.length; i++) { if(rows[i][0] === data.id) { sheet.deleteRow(i+1); clearCache(); return createResponse({ status: "success" }); } }
        return createResponse({ status: "error" });
    }

    else if (action === "addTask") {
      var taskSheet = ss.getSheetByName("Feladatok"); var kepUrls = []; if (data.kepek && data.kepek.length > 0) kepUrls = mentKepeket(data.kepek, data.felhasznalo);
      var timestamp = new Date(); var prefix = isProd ? "PROD-KB-" : "KB-"; var taskId = prefix + Math.floor(1000 + Math.random() * 9000); var statusz = (data.megoldas && data.megoldas !== "") ? "Lezárt" : "Nyitott"; var lezaroSzemely = statusz === "Lezárt" ? data.felhasznalo : ""; var startIdo = (statusz === "Lezárt") ? timestamp : "";
      taskSheet.appendRow([ taskId, statusz, timestamp, data.felhasznalo, data.gep, data.hiba, data.prioritas, data.megoldas, data.ido, kepUrls.join(", "), lezaroSzemely, "", "", data.downtime || "", startIdo ]);
      clearCache(); return createResponse({ status: "success" });
    }

    else if (action === "deleteTask") {
      var taskSheet = ss.getSheetByName("Feladatok"); var rows = taskSheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) { if (rows[i][0] === data.id) { taskSheet.deleteRow(i + 1); clearCache(); return createResponse({ status: "success" }); } }
      return createResponse({ status: "error", message: "Nem található a feladat." });
    }

    else if (action === "mergeTask") {
      var taskSheet = ss.getSheetByName("Feladatok"); var rows = taskSheet.getDataRange().getValues(); var sourceIndex = -1, targetIndex = -1;
      for (var i = 1; i < rows.length; i++) { if (String(rows[i][0]).toUpperCase() === String(data.sourceId).toUpperCase()) sourceIndex = i; if (String(rows[i][0]).toUpperCase() === String(data.targetId).toUpperCase()) targetIndex = i; }
      if (sourceIndex === -1 || targetIndex === -1) { return createResponse({ status: "error", message: "A forrás vagy a cél jegy nem található." }); }
      var sourceId = rows[sourceIndex][0]; var sourceHiba = rows[sourceIndex][5]; var sourceKepek = rows[sourceIndex][9]; var sourceUser = rows[sourceIndex][3]; var targetHiba = rows[targetIndex][5]; var targetKepek = rows[targetIndex][9];
      var appendedHiba = targetHiba + "\n\n[+ Összevonva a (" + sourceId + ") jegyből - " + sourceUser + "]: " + sourceHiba; var mergedKepek = targetKepek; if (sourceKepek) { mergedKepek = mergedKepek ? (mergedKepek + ", " + sourceKepek) : sourceKepek; }
      taskSheet.getRange(targetIndex + 1, 6).setValue(appendedHiba); taskSheet.getRange(targetIndex + 1, 10).setValue(mergedKepek); taskSheet.deleteRow(sourceIndex + 1);
      clearCache(); return createResponse({ status: "success" });
    }

    else if (action === "changePriority") {
      var taskSheet = ss.getSheetByName("Feladatok"); var rows = taskSheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) { if (rows[i][0] === data.id) { taskSheet.getRange(i + 1, 7).setValue(data.ujPrioritas); clearCache(); return createResponse({ status: "success" }); } }
      return createResponse({ status: "error", message: "Nem található a feladat." });
    }

    else if (action === "startTask") {
      var taskSheet = ss.getSheetByName("Feladatok"); var rows = taskSheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] === data.id) { taskSheet.getRange(i + 1, 2).setValue("Folyamatban"); taskSheet.getRange(i + 1, 12).setValue(data.felhasznalo); if (!rows[i][14]) { taskSheet.getRange(i + 1, 15).setValue(new Date()); } clearCache(); return createResponse({ status: "success" }); }
      }
      return createResponse({ status: "error", message: "Nem található a feladat." });
    }

    else if (action === "reopenTask") {
      var taskSheet = ss.getSheetByName("Feladatok"); var rows = taskSheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] === data.id) {
          taskSheet.getRange(i + 1, 2).setValue("Nyitott"); taskSheet.getRange(i + 1, 3).setValue(new Date()); 
          var regiMegoldas = rows[i][7] || ""; var timeStampStr = new Date().toLocaleString('hu-HU'); var elvalaszto = regiMegoldas ? regiMegoldas + "\n\n⚠️ --- ÚJRA ELŐJÖTT: " + timeStampStr + " (" + data.felhasznalo + ") ---\n" : "";
          taskSheet.getRange(i + 1, 8).setValue(elvalaszto); taskSheet.getRange(i + 1, 12).setValue(""); taskSheet.getRange(i + 1, 15).setValue(""); clearCache(); return createResponse({ status: "success" });
        }
      }
      return createResponse({ status: "error", message: "Nem található a feladat." });
    }

    else if (action === "closeTask") {
      var taskSheet = ss.getSheetByName("Feladatok"); var rows = taskSheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] === data.id) {
          var currentIdo = parseFloat(rows[i][8]) || 0; var currentDowntime = parseFloat(rows[i][13]) || 0; var currentMegoldas = rows[i][7] || ""; var currentLezarta = rows[i][10] || ""; 
          var newIdo = currentIdo + (parseFloat(data.ido) || 0); var newDowntime = currentDowntime + (parseFloat(data.downtime) || 0);
          var timeStampStr = new Date().toLocaleString('hu-HU'); var logSzoveg = "✅ [" + timeStampStr + " - " + data.lezarta + "]: " + data.megoldas; var extraSzoveg = ""; if(data.ido || data.downtime) extraSzoveg = " (Javítás: " + (data.ido||0) + "p, Kiesés: " + (data.downtime||0) + "p)";
          var veglegesMegoldas = currentMegoldas ? currentMegoldas + "\n" + logSzoveg + extraSzoveg : logSzoveg + extraSzoveg; var ujLezarto = currentLezarta; if (ujLezarto.indexOf(data.lezarta) === -1) { ujLezarto = ujLezarto ? ujLezarto + ", " + data.lezarta : data.lezarta; }
          taskSheet.getRange(i + 1, 2).setValue("Lezárt"); taskSheet.getRange(i + 1, 8).setValue(veglegesMegoldas); taskSheet.getRange(i + 1, 9).setValue(newIdo || ""); taskSheet.getRange(i + 1, 11).setValue(ujLezarto); taskSheet.getRange(i + 1, 14).setValue(newDowntime || ""); if (!rows[i][14]) taskSheet.getRange(i + 1, 15).setValue(new Date()); 
          clearCache(); return createResponse({ status: "success" });
        }
      }
      return createResponse({ status: "error", message: "Nem található a feladat." });
    }

    else if (action === "appendInfo") {
      var taskSheet = ss.getSheetByName("Feladatok"); var rows = taskSheet.getDataRange().getValues(); var kepUrls = []; if (data.kepek && data.kepek.length > 0) kepUrls = mentKepeket(data.kepek, data.felhasznalo + "_plusz");
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] === data.id) {
          var regiMegoldas = rows[i][7] || ""; var regiKepek = rows[i][9] || ""; var ujKepekStr = kepUrls.join(", ");
          if (data.szoveg) { var pluszSzoveg = "\n\n[+ Kiegészítés - " + data.felhasznalo + "]: " + data.szoveg; taskSheet.getRange(i + 1, 8).setValue(regiMegoldas + pluszSzoveg); }
          if (ujKepekStr) taskSheet.getRange(i + 1, 10).setValue(regiKepek ? (regiKepek + ", " + ujKepekStr) : ujKepekStr); clearCache(); return createResponse({ status: "success" });
        }
      }
      return createResponse({ status: "error", message: "Nem található a feladat." });
    }

    else if (action === "addRecurringTask") {
      var ismSheet = ss.getSheetByName(ismetlodoSheetName); if (!ismSheet) return createResponse({ status: "error", message: "A fül hiányzik!" });
      var id = (isProd ? "PROD-" : "") + "ISM-" + Math.floor(1000 + Math.random() * 9000);
      ismSheet.appendRow([ id, data.gep, data.hiba, data.prioritas, data.ismTipus, data.felhasznalo, "", data.checklist || "", data.kezdoDatum || "" ]); clearCache(); return createResponse({ status: "success" });
    }

    else if (action === "editRecurringTask") {
      var ismSheet = ss.getSheetByName(ismetlodoSheetName); if(!ismSheet) return createResponse({ status: "error" }); var rows = ismSheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) { if (rows[i][0] === data.id) { ismSheet.getRange(i + 1, 2).setValue(data.gep); ismSheet.getRange(i + 1, 3).setValue(data.hiba); ismSheet.getRange(i + 1, 4).setValue(data.prioritas); ismSheet.getRange(i + 1, 5).setValue(data.ismTipus); ismSheet.getRange(i + 1, 8).setValue(data.checklist); clearCache(); return createResponse({ status: "success" }); } }
      return createResponse({ status: "error", message: "Nem található!" });
    }

    else if (action === "deleteRecurringTask") {
      var ismSheet = ss.getSheetByName(ismetlodoSheetName); if(ismSheet) { var rows = ismSheet.getDataRange().getValues(); for (var i = 1; i < rows.length; i++) { if (rows[i][0] === data.id) { ismSheet.deleteRow(i + 1); clearCache(); return createResponse({ status: "success" }); } } }
      return createResponse({ status: "error", message: "Nem található." });
    }

    else if (action === "addScheduleBulk") {
      var sheet = ss.getSheetByName(beosztasSheetName); if(!sheet) { sheet = ss.insertSheet(beosztasSheetName); sheet.appendRow(["Dátum", "Felhasználó", "Típus", "", "", "Dolgozok"]); }
      var vals = sheet.getDataRange().getValues();
      for (var d = 0; d < data.dates.length; d++) {
          var targetDatum = data.dates[d]; var found = false;
          for(var i=1; i<vals.length; i++){
             var rawD = vals[i][0]; var dStr = ""; try { dStr = Utilities.formatDate(new Date(rawD), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd"); } catch(e) { dStr = String(rawD).slice(0, 10); }
             if(dStr === targetDatum && String(vals[i][1]).trim() === data.user) {
                if(data.tipus === "Törlés") { sheet.getRange(i+1, 3).setValue(""); } else { sheet.getRange(i+1, 3).setValue(data.tipus); } found = true; break;
             }
          }
          if(!found && data.tipus !== "Törlés") { sheet.appendRow([targetDatum, data.user, data.tipus]); vals.push([targetDatum, data.user, data.tipus]); }
      }
      clearCache(); return createResponse({status:"success"});
    }

    else if (action === "addScheduleWorkerOnly") {
      var sheet = ss.getSheetByName(beosztasSheetName); if(!sheet) { sheet = ss.insertSheet(beosztasSheetName); sheet.appendRow(["Dátum", "Név", "Típus", "Rögzítve", "", "Dolgozok"]); }
      var vals = sheet.getDataRange().getValues(); var targetRow = vals.length + 1;
      for (var r = 1; r < vals.length; r++) { if (!vals[r][5]) { targetRow = r + 1; break; } }
      sheet.getRange(targetRow, 6).setValue(data.nev.trim()); clearCache(); return createResponse({status: "success"});
    }

    else if (action === "deleteScheduleWorkerOnly") {
      var sheet = ss.getSheetByName(beosztasSheetName);
      if(sheet) { var vals = sheet.getDataRange().getValues(); for (var r = 1; r < vals.length; r++) { if (vals[r][5] && String(vals[r][5]).trim().toLowerCase() === data.nev.trim().toLowerCase()) { sheet.getRange(r + 1, 6).clearContent(); break; } } }
      clearCache(); return createResponse({status: "success"});
    }

    else if (action === "addShiftLog") {
      var sheet = ss.getSheetByName(muszaknaploSheetName); if(!sheet) { sheet = ss.insertSheet(muszaknaploSheetName); sheet.appendRow(["ID", "Időpont", "Felhasználó", "Műszak", "Szöveg", "Dátum", "Jóváhagyók"]); }
      var datum = data.datum; var muszak = data.muszak; var values = sheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
        var rowDateObj = values[i][6] ? values[i][6] : values[i][0]; var rowDateStr = ""; try { rowDateStr = Utilities.formatDate(new Date(rowDateObj), Session.getScriptTimeZone(), "yyyy-MM-dd"); } catch(e) { rowDateStr = String(rowDateObj).slice(0, 10); }
        if (rowDateStr === datum && values[i][2] === muszak) { return createResponse({ status: "error", message: "Erre a napra és műszakra már rögzítettek naplót!" }); }
      }
      sheet.appendRow([new Date().toISOString(), data.felhasznalo, muszak, data.szoveg, "MSZ-" + new Date().getTime(), "", datum, data.felhasznalo]); clearCache(); return createResponse({ status: "success" });
    }

    else if (action === "approveShiftLog") {
      var sheet = ss.getSheetByName(muszaknaploSheetName); var values = sheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
          if (values[i][4] === data.id) {
              var current = values[i][7] ? String(values[i][7]) : ""; var arr = current.split(",").map(function(x){return x.trim();}).filter(function(x){return x;});
              if (arr.indexOf(data.felhasznalo) === -1) { arr.push(data.felhasznalo); sheet.getRange(i + 1, 8).setValue(arr.join(", ")); }
              clearCache(); return createResponse({ status: "success" });
          }
      }
      return createResponse({ status: "error", message: "Nem található a napló." });
    }

    else if (action === "editShiftLog") {
      var sheet = ss.getSheetByName(muszaknaploSheetName); var values = sheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
        if (values[i][4] === data.id || (!values[i][4] && values[i][0] === data.oldTimestamp && values[i][1] === data.oldFelhasznalo)) {
          var ujElozmeny = (values[i][5] || "") + "\n[Módosítva " + new Date().toLocaleString('hu-HU') + " - " + data.szerkeszto + "]:\n" + values[i][3] + "\n---";
          sheet.getRange(i + 1, 4).setValue(data.ujSzoveg); sheet.getRange(i + 1, 6).setValue(ujElozmeny.trim()); clearCache(); return createResponse({ status: "success" });
        }
      }
      return createResponse({ status: "error", message: "Nem található." });
    }
    
    // RÉSZLEGES LEKÉRDEZÉSEK (Ezeket most már ritkábban használja a frontend, de meghagyjuk őket)
    else if (action === "getTasks" || action === "getRecurringTasks" || action === "getSchedule" || action === "getShiftLogs" || action === "getChecklistFullLog") {
        return createResponse({ status: "success", message: "Ezek a végpontok elavultak, használd a getAllData-t." });
    }

    return createResponse({ status: "error", message: "Ismeretlen kérés." });

  } catch (error) { return createResponse({ status: "error", message: error.toString() }); }
}

function checkAndGenerateRecurringTasks(ss) { processRecurringSheet(ss, "Ismetlodo", false); processRecurringSheet(ss, "Prod_Ismetlodo", true); }

function processRecurringSheet(ss, sheetName, isProd) {
  var ismSheet = ss.getSheetByName(sheetName); var felSheet = ss.getSheetByName("Feladatok"); if (!ismSheet || !felSheet) return;
  var data = ismSheet.getDataRange().getValues(); if (data.length <= 1) return; 
  var today = new Date(); var tz = ss.getSpreadsheetTimeZone(); var localISOTime = Utilities.formatDate(today, tz, "yyyy-MM-dd");
  var parts = localISOTime.split("-"); var currDate = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0); var dayOfWeek = currDate.getDay(); var felData = felSheet.getDataRange().getValues();
  var modositva = false;

  for (var i = 1; i < data.length; i++) {
    var id = data[i][0]; if (!id || id === "ID") continue;
    var targetId = "PREV-" + id; var katGep = data[i][1] || ""; var hiba = data[i][2] || ""; var prio = data[i][3] || "Normál"; var ismTipus = String(data[i][4] || "").trim(); var checklist = data[i][7] || "";
    var utolsoGen = ""; if (data[i][6]) { try { utolsoGen = Utilities.formatDate(new Date(data[i][6]), tz, "yyyy-MM-dd"); } catch(e) { utolsoGen = String(data[i][6]).slice(0, 10); } }
    var kezdoDatumStr = ""; if (data[i][8]) { try { kezdoDatumStr = Utilities.formatDate(new Date(data[i][8]), tz, "yyyy-MM-dd"); } catch(e) { kezdoDatumStr = String(data[i][8]).slice(0, 10); } }
    if (kezdoDatumStr && localISOTime < kezdoDatumStr) continue;

    var shouldGenerate = false;
    if (!utolsoGen) {
      if (ismTipus.indexOf("Heti - ") === 0) { var dayMap = { "Vasárnap": 0, "Hétfő": 1, "Kedd": 2, "Szerda": 3, "Csütörtök": 4, "Péntek": 5, "Szombat": 6 }; if (dayOfWeek === dayMap[ismTipus.replace("Heti - ", "")]) shouldGenerate = true; } 
      else { shouldGenerate = true; }
    } else {
      if (utolsoGen === localISOTime) continue; 
      var lastDate = new Date(utolsoGen + "T12:00:00"); var nextDueDate = new Date(lastDate.getTime()); 
      if (ismTipus === "Napi") { nextDueDate.setDate(nextDueDate.getDate() + 1); if (currDate >= nextDueDate) shouldGenerate = true; } 
      else if (ismTipus.indexOf("Heti - ") === 0) { var dayMap = { "Vasárnap": 0, "Hétfő": 1, "Kedd": 2, "Szerda": 3, "Csütörtök": 4, "Péntek": 5, "Szombat": 6 }; var diffTime = currDate.getTime() - lastDate.getTime(); var diffDays = diffTime / (1000 * 3600 * 24); if (diffDays >= 6 && dayOfWeek === dayMap[ismTipus.replace("Heti - ", "")]) { shouldGenerate = true; } } 
      else if (ismTipus === "Havi") { nextDueDate.setMonth(nextDueDate.getMonth() + 1); if (currDate >= nextDueDate) shouldGenerate = true; } 
      else if (ismTipus === "3 Havi") { nextDueDate.setMonth(nextDueDate.getMonth() + 3); if (currDate >= nextDueDate) shouldGenerate = true; } 
      else if (ismTipus === "6 Havi") { nextDueDate.setMonth(nextDueDate.getMonth() + 6); if (currDate >= nextDueDate) shouldGenerate = true; } 
      else if (ismTipus === "Éves") { nextDueDate.setFullYear(nextDueDate.getFullYear() + 1); if (currDate >= nextDueDate) shouldGenerate = true; }
    }

    if (shouldGenerate) {
      var foundIndex = -1; for (var f = 1; f < felData.length; f++) { if (felData[f][0] === targetId) { foundIndex = f; break; } }
      if (foundIndex > -1) {
        if (felData[foundIndex][1] === "Lezárt") { felSheet.getRange(foundIndex + 1, 2).setValue("Nyitott"); felSheet.getRange(foundIndex + 1, 3).setValue(new Date()); felSheet.getRange(foundIndex + 1, 12).setValue(""); felSheet.getRange(foundIndex + 1, 15).setValue(""); var regiMegoldas = felData[foundIndex][7] || ""; var elvalaszto = regiMegoldas ? regiMegoldas + "\n\n⏳ --- ÚJRA ESEDÉKES: " + localISOTime + " ---\n" : ""; felSheet.getRange(foundIndex + 1, 8).setValue(elvalaszto); modositva = true; }
      } else { felSheet.appendRow([ targetId, "Nyitott", new Date(), "Rendszer (Auto)", katGep, hiba, prio, "", "", "", "", "", checklist, "", "" ]); felData.push([targetId, "Nyitott", new Date(), "Rendszer (Auto)", katGep, hiba, prio, "", "", "", "", "", checklist, "", ""]); modositva = true; }
      ismSheet.getRange(i + 1, 7).setValue(localISOTime);
    }
  }
  if (modositva) clearCache();
}

function toLocalISOString(dateObj) { if(isNaN(dateObj)) return ""; const y = dateObj.getFullYear(), m = String(dateObj.getMonth() + 1).padStart(2, '0'), d = String(dateObj.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }
function createResponse(responseObject) { return ContentService.createTextOutput(JSON.stringify(responseObject)).setMimeType(ContentService.MimeType.JSON); }
function mentKepeket(kepekArray, prefix) {
  var targetFolder = DriveApp.getFoldersByName("Karbantartas_Kepek").hasNext() ? DriveApp.getFoldersByName("Karbantartas_Kepek").next() : DriveApp.createFolder("Karbantartas_Kepek"); var linkek = [];
  for (var i = 0; i < kepekArray.length; i++) {
    var ext = ".jpg"; var tipus = String(kepekArray[i].tipus).toLowerCase(); if (tipus.indexOf("video") !== -1) { if (tipus.indexOf("mp4") !== -1) ext = ".mp4"; else if (tipus.indexOf("webm") !== -1) ext = ".webm"; else ext = ".mov"; }
    var file = targetFolder.createFile(Utilities.newBlob(Utilities.base64Decode(kepekArray[i].base64), kepekArray[i].tipus, "Fajl_" + prefix + "_" + new Date().getTime() + "_" + i + ext)); file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); linkek.push("https://drive.google.com/uc?export=view&id=" + file.getId());
  } return linkek;
}