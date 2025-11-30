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

        const overlay = document.createElement("div");
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
        box.style.height = "70%";
        box.style.boxSizing = "border-box";
        box.style.display = "flex";
        box.style.flexDirection = "column";

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "Zavřít";
        closeBtn.style.marginBottom = "5px";
        closeBtn.onclick = function () {
            document.body.removeChild(overlay);
            window.BuildingScrapRunning = false;
        };

        const ta = document.createElement("textarea");
        ta.style.flex = "1";
        ta.style.width = "100%";
        ta.value = output;

        box.appendChild(closeBtn);
        box.appendChild(ta);
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
