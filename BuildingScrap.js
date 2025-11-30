(function () {
    if (window.BuildingScrapRunning) {
        alert("BuildingScrap už běží.");
        return;
    }
    window.BuildingScrapRunning = true;

    function cleanSingleLine(str) {
        return (str || "")
            .toString()
            .replace(/[\r\n]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function getLevelFromCell(td) {
        if (!td) return "0";
        const m = td.textContent.match(/\d+/);
        return m ? m[0] : "0";
    }

    const buildingDefs = [
        "hlavni",          // Hlavní budova
        "kasarna",         // Kasárna
        "staje",           // Stáje
        "dilna",           // Dílna
        "vez",             // Věž
        "pansky_dvur",     // Pánský dvůr
        "kovarna",         // Kovárna
        "nadvori",         // Nádvoří
        "socha",           // Socha
        "trziste",         // Tržiště
        "drevorubec",      // Dřevorubec
        "lom",             // Lom na těžbu hlíny
        "zelezny_dvur",    // Železný dvůr
        "selsky_dvur",     // Selský dvůr
        "skladiste",       // Skladiště
        "skrys",           // Skrýš
        "hradby"           // Hradby
    ];

    const memberSelect =
        document.querySelector("select[name='player_id']") ||
        document.querySelector("select[name='player']") ||
        document.querySelector("select[id*='player']");

    if (!memberSelect) {
        alert("Nenalezeno menu 'Vybrat člena'. Běž prosím na stránku Rekapitulace → Budovy.");
        window.BuildingScrapRunning = false;
        return;
    }

    const options = Array.from(memberSelect.options).filter(o => o.value && o.value !== "0");
    if (!options.length) {
        alert("V selectu 'Vybrat člena' nejsou žádní hráči.");
        window.BuildingScrapRunning = false;
        return;
    }

    const baseUrl = new URL(window.location.href);

    async function fetchPlayerDoc(playerId) {
        const url = new URL(baseUrl.href);
        url.searchParams.set("player_id", playerId);
        url.searchParams.delete("player");
        const resp = await fetch(url.toString(), { credentials: "same-origin" });
        const html = await resp.text();
        return new DOMParser().parseFromString(html, "text/html");
    }

    // najde tabulku, kde je řádek s (xxx|yyy) a hodně <td> (budovy)
    function findBuildingsTable(doc) {
        const tables = doc.querySelectorAll("table");
        for (const tbl of tables) {
            const rows = Array.from(tbl.querySelectorAll("tr"));
            for (const tr of rows) {
                const tds = Array.from(tr.querySelectorAll("td"));
                if (tds.length < 15) continue; // musí to být široké
                if (!/\(\d+\|\d+\)/.test(tr.textContent || "")) continue;
                // našli jsme datový řádek → tahle tabulka je ta správná
                return tbl;
            }
        }
        return null;
    }

    function parseVillageCell(td) {
        const txt = cleanSingleLine(td.textContent);
        const m = txt.match(/^(.+?)\s*\((\d+)\|(\d+)\)/);
        if (!m) return { name: txt, x: "", y: "" };
        return { name: m[1].trim(), x: m[2], y: m[3] };
    }

    function parsePointsCell(td) {
        const txt = td.textContent.trim().replace(/\./g, "").replace(/\s/g, "");
        const num = parseInt(txt, 10);
        return isNaN(num) ? "" : num.toString();
    }

    // stažení souboru (txt/csv)
    function downloadFile(filename, content, mimeType) {
        const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function run() {
        const lines = [];

        for (const opt of options) {
            const playerName = cleanSingleLine(opt.textContent);
            try {
                const doc = await fetchPlayerDoc(opt.value);
                const table = findBuildingsTable(doc);
                if (!table) {
                    console.warn("Nenalezena tabulka budov pro hráče", playerName);
                    continue;
                }

                const rows = Array.from(table.querySelectorAll("tr"));

                for (const tr of rows) {
                    const tds = Array.from(tr.querySelectorAll("td"));
                    if (tds.length < 5) continue;
                    const rowText = tr.textContent || "";
                    if (!/\(\d+\|\d+\)/.test(rowText)) continue; // musí mít souřadnice

                    // sloupce: 0 = vesnice, 1 = body, 2+ = budovy
                    const vCell = tds[0];
                    const pCell = tds[1];

                    const village = parseVillageCell(vCell);
                    const points = parsePointsCell(pCell);
                    if (!points) continue; // vyhodíme bordel bez bodů

                    const line = [
                        playerName,
                        cleanSingleLine(village.name),
                        village.x,
                        village.y,
                        points
                    ];

                    const startIdx = 2;
                    for (let i = 0; i < buildingDefs.length; i++) {
                        const td = tds[startIdx + i];
                        const val = getLevelFromCell(td);
                        line.push(val);
                    }

                    lines.push(line.join(";"));
                }
            } catch (e) {
                console.error("Chyba u hráče", playerName, e);
            }
        }

        const output = lines.join("\r\n");

        // ---- overlay stejně jako u UnitScrap ----
        const old = document.getElementById("buildingscrap-overlay");
        if (old) old.remove();

        const overlay = document.createElement("div");
        overlay.id = "buildingscrap-overlay";
        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.background = "rgba(0,0,0,0.7)";
        overlay.style.zIndex = "99999";
        overlay.style.display = "flex";
        overlay.style.alignItems = "center";
        overlay.style.justifyContent = "center";

        const box = document.createElement("div");
        box.style.background = "#f4e4bc";
        box.style.border = "2px solid #804000";
        box.style.padding = "10px";
        box.style.width = "80%";
        box.style.maxWidth = "900px";
        box.style.height = "70%";
        box.style.boxSizing = "border-box";
        box.style.display = "flex";
        box.style.flexDirection = "column";
        box.style.gap = "5px";

        const title = document.createElement("div");
        title.textContent = "BuildingScrap - Export budov – zkopíruj / stáhni soubor";
        title.style.fontWeight = "bold";
        title.style.marginBottom = "5px";

        const ta = document.createElement("textarea");
        ta.style.flex = "1";
        ta.style.width = "100%";
        ta.style.boxSizing = "border-box";
        ta.value = output;

        const btnRow = document.createElement("div");
        btnRow.style.display = "flex";
        btnRow.style.justifyContent = "space-between";
        btnRow.style.marginTop = "5px";
        btnRow.style.gap = "10px";
        btnRow.style.alignItems = "center";
        btnRow.style.flexWrap = "wrap";

        const leftGroup = document.createElement("div");
        leftGroup.style.display = "flex";
        leftGroup.style.gap = "10px";
        leftGroup.style.alignItems = "center";
        leftGroup.style.flexWrap = "wrap";

        const info = document.createElement("span");
        info.textContent = "Ctrl+A, Ctrl+C → zkopíruj vše.";

        const copyBtn = document.createElement("button");
        copyBtn.textContent = "Zkopírovat RAW data";
        copyBtn.style.cursor = "pointer";
        copyBtn.onclick = async () => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                try {
                    await navigator.clipboard.writeText(output);
                    copyBtn.textContent = "Zkopírováno!";
                    setTimeout(() => (copyBtn.textContent = "Zkopírovat RAW data"), 1500);
                    return;
                } catch (e) {
                    console.warn("Clipboard API selhalo, použiju označení textu.", e);
                }
            }
            ta.focus();
            ta.select();
            alert("Obsah je označen – stiskni Ctrl+C pro zkopírování.");
        };

        const txtBtn = document.createElement("button");
        txtBtn.textContent = "Stáhnout .txt";
        txtBtn.style.cursor = "pointer";
        txtBtn.onclick = () => {
            downloadFile("buildingscrap_export.txt", output + "\r\n", "text/plain;charset=utf-8;");
        };

        const csvBtn = document.createElement("button");
        csvBtn.textContent = "Stáhnout CSV (Excel)";
        csvBtn.style.cursor = "pointer";
        csvBtn.onclick = () => {
            // hlavička pro CSV
            const buildingLabels = {
                hlavni: "Hlavní budova",
                kasarna: "Kasárna",
                staje: "Stáje",
                dilna: "Dílna",
                vez: "Věž",
                pansky_dvur: "Panský dvůr",
                kovarna: "Kovárna",
                nadvori: "Nádvoří",
                socha: "Socha",
                trziste: "Tržiště",
                drevorubec: "Dřevorubec",
                lom: "Lom na hlínu",
                zelezny_dvur: "Železný důl",
                selsky_dvur: "Selský dvůr",
                skladiste: "Skladiště",
                skrys: "Skrýš",
                hradby: "Hradby"
            };

            const header = [
                "Hráč",
                "Vesnice",
                "X",
                "Y",
                "Body",
                ...buildingDefs.map(b => buildingLabels[b] || b)
            ].join(";");

            const csvContent = header + "\r\n" + output;
            downloadFile("buildingscrap_export.csv", csvContent, "text/csv;charset=utf-8;");
        };

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "Zavřít";
        closeBtn.style.cursor = "pointer";
        closeBtn.onclick = function () {
            document.body.removeChild(overlay);
            window.BuildingScrapRunning = false;
        };

        leftGroup.appendChild(info);
        leftGroup.appendChild(copyBtn);
        leftGroup.appendChild(txtBtn);
        leftGroup.appendChild(csvBtn);

        btnRow.appendChild(leftGroup);
        btnRow.appendChild(closeBtn);

        box.appendChild(title);
        box.appendChild(ta);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        ta.focus();
        ta.select();
    }

    run().catch(e => {
        console.error(e);
        alert("Nastala chyba ve skriptu BuildingScrap (viz konzoli).");
        window.BuildingScrapRunning = false;
    });
})();

