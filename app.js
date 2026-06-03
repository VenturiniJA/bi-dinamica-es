let currentSelectedEJId = null;
let allEJs = [];

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('network-status').textContent = 'Baixando cruzamento de dados (Tracking + Farol)...';

    const trackingURL = 'https://docs.google.com/spreadsheets/d/163X5ADTJkHXK4INVs4KPdAXveUXhz0sYEoDGIdHWdOM/export?format=csv&gid=1067661499';
    const clusterURL = 'https://docs.google.com/spreadsheets/d/163X5ADTJkHXK4INVs4KPdAXveUXhz0sYEoDGIdHWdOM/export?format=csv&gid=1494647923';

    Promise.all([
        fetch(trackingURL).then(r => r.text()),
        fetch(clusterURL).then(r => r.text())
    ]).then(([trackingText, clusterText]) => {
        // Limpar cabecalho do tracking
        const trackLines = trackingText.split('\n');
        trackLines.shift(); // Remove "Mês em Análise"
        const cleanTrackCSV = trackLines.join('\n');

        // Limpar cabecalho do cluster
        const clusterLines = clusterText.split('\n');
        let headerIndex = clusterLines.findIndex(l => l.includes('ID') && l.includes('EJ') && l.includes('SITUAÇÃO ATUAL'));
        if(headerIndex === -1) headerIndex = clusterLines.findIndex(l => l.includes('SITUAÇÃO ATUAL'));
        if(headerIndex === -1) headerIndex = 2; // Fallback
        const cleanClusterCSV = clusterLines.slice(headerIndex).join('\n');

        Papa.parse(cleanTrackCSV, {
            header: true, skipEmptyLines: true,
            complete: function(trackResults) {
                Papa.parse(cleanClusterCSV, {
                    header: true, skipEmptyLines: true,
                    complete: function(clusterResults) {
                        allEJs = processData(trackResults.data, clusterResults.data);
                        if (!allEJs || allEJs.length === 0) {
                            document.getElementById('network-status').textContent = 'Nenhuma EJ encontrada.';
                            return;
                        }
                        
                        document.getElementById('network-status').textContent = 'CRM Atualizado';
                        setTimeout(() => { document.getElementById('network-status').style.display = 'none'; }, 2000);

                        initGlobalKPIs(allEJs);
                        initLeftPanel(allEJs);
                        renderKanban(allEJs);
                        setupEvents();
                    }
                });
            }
        });
    }).catch(err => {
        console.error("Erro no fetch:", err);
        document.getElementById('network-status').textContent = 'Erro de Conexão.';
    });
});

function cleanMoney(val) {
    if (!val) return 0.0;
    const cleaned = String(val).replace('R$', '').replaceAll('.', '').replace(',', '.').trim();
    const floatVal = parseFloat(cleaned);
    return isNaN(floatVal) ? 0.0 : floatVal;
}

function safeFloat(val) {
    if (!val) return 0.0;
    const cleaned = String(val).replace('%', '').replace(',', '.').trim();
    const floatVal = parseFloat(cleaned);
    return isNaN(floatVal) ? 0.0 : floatVal;
}

function moneyFmt(val) {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function processData(trackRows, clusterRows) {
    const ejs = [];
    if (trackRows.length === 0) return ejs;
    
    // Mapeamento super robusto para Farol de Cluster (Tenta por ID, faz fallback por Nome)
    const clusterMapById = {};
    const clusterMapByName = {};
    clusterRows.forEach(row => {
        let id = safeFloat(row['ID']);
        let nomeEJ = String(row['EJ'] || '').trim().toLowerCase();
        let forecast = {
            situacao: String(row['SITUAÇÃO ATUAL'] || '').trim().toUpperCase(),
            clusterAlmejado: safeFloat(row['CLUSTER ALMEJADO'])
        };
        if(id > 0) clusterMapById[id] = forecast;
        if(nomeEJ) clusterMapByName[nomeEJ] = forecast;
    });

    const headers = Object.keys(trackRows[0]);
    const colID = headers.find(c => c.includes('ID'));
    const colEJ = headers.find(c => c.includes('EJ') && !c.includes('EXCELENTE'));
    const colExcelente = headers.find(c => c.includes('EJ EXCELENTE'));
    const colCluster = headers.find(c => c.includes('Cluster') && !c.includes('Farol'));
    const colFed = headers.find(c => c.includes('Federa'));

    const colMetaFat = headers.find(c => c.includes('Meta de Faturamento'));
    const colFatAlcan = headers.find(c => c.includes('Faturamento') && c.includes('Alcan'));
    const colMetaCSAT = headers.find(c => c.includes('META de CSAT'));
    const colCSAT = headers.find(c => c.includes('CSAT') && !c.includes('META') && !c.includes('%'));
    const colMetaEng = headers.find(c => c.includes('Meta de Engajamento'));
    const colEng = headers.find(c => c.includes('Engajamento com o MEJ') && !c.includes('Meta'));
    const colMetaTempo = headers.find(c => c.includes('Meta de Tempo de Perman'));
    const colTempo = headers.find(c => c.includes('Tempo de Perman') && !c.includes('Meta'));

    trackRows.forEach(row => {
        if (String(row[colFed]).trim() !== 'Juniores') return;
        const nome = String(row[colEJ]).trim();
        if (!nome || nome.toUpperCase() === 'CONCENTRO' || nome.toUpperCase() === 'NAN') return;

        let rawCsat = safeFloat(row[colCSAT]);
        if (rawCsat > 10) rawCsat = rawCsat / 100;
        if (rawCsat > 5) rawCsat = 5.0;

        let rawMetaCsat = safeFloat(row[colMetaCSAT]);
        if (rawMetaCsat > 10) rawMetaCsat = rawMetaCsat / 100;
        if (rawMetaCsat > 5) rawMetaCsat = 5.0;

        const id = safeFloat(row[colID]);
        
        // Cruzamento
        let clusterForecast = clusterMapById[id] || clusterMapByName[nome.toLowerCase()] || { situacao: "PERMANECE" };

        ejs.push({
            id: id,
            nome: nome,
            farol: String(row[colExcelente]).trim().toUpperCase(),
            cluster: safeFloat(row[colCluster]),
            faturamento: { metaAno: cleanMoney(row[colMetaFat]), alcancado: cleanMoney(row[colFatAlcan]) },
            csat: { meta: rawMetaCsat, alcancado: rawCsat },
            engajamento: { meta: safeFloat(row[colMetaEng]), alcancado: safeFloat(row[colEng]) },
            tempo: { meta: safeFloat(row[colMetaTempo]), alcancado: safeFloat(row[colTempo]) },
            previsao: clusterForecast
        });
    });
    return ejs;
}

function initGlobalKPIs(dados) {
    let totalRevenue = 0;
    let acCount = 0;
    dados.forEach(ej => {
        totalRevenue += ej.faturamento.alcancado || 0;
        if (ej.farol === "VERDE") acCount++;
    });
    document.getElementById("global-revenue").textContent = moneyFmt(totalRevenue);
    document.getElementById("global-ac").textContent = `${acCount} / ${dados.length}`;
}

const PALETTE = {
    "VERDE": "bg-status-emerald",
    "AMARELO": "bg-status-yellow",
    "VERMELHO": "bg-status-red",
    "ZERADA": "bg-slate-300"
};

function getSituacaoBadge(situacao) {
    if (situacao === 'SOBE') return '<span class="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded shrink-0 shadow-sm border border-emerald-200">↑ SOBE</span>';
    if (situacao === 'CAI') return '<span class="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded shrink-0 shadow-sm border border-red-200">↓ CAI</span>';
    return '<span class="text-[10px] font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded shrink-0 shadow-sm border border-slate-300">= MANTÉM</span>';
}

function createMiniCard(ej) {
    const card = document.createElement('div');
    card.className = 'bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:border-es-blue hover:shadow-md cursor-pointer transition-all flex flex-col gap-2 group';
    card.onclick = () => openTacticalProfile(ej);

    const farolColor = PALETTE[ej.farol] || "bg-slate-300";
    
    // Calculo da porcentagem da fat.
    let fatPerc = ej.faturamento.metaAno > 0 ? (ej.faturamento.alcancado / ej.faturamento.metaAno) * 100 : 0;
    if (fatPerc > 100) fatPerc = 100;

    card.innerHTML = `
        <div class="flex justify-between items-start">
            <div class="flex items-center gap-2 flex-1 min-w-0 pr-2">
                <span class="w-3 h-3 rounded-full ${farolColor} shrink-0 ring-2 ring-white shadow-sm"></span>
                <span class="text-[13px] font-bold text-slate-700 truncate group-hover:text-es-blue transition-colors">${ej.nome}</span>
            </div>
            ${getSituacaoBadge(ej.previsao.situacao)}
        </div>
        <div>
            <div class="flex justify-between text-[10px] text-slate-500 mb-1 font-medium">
                <span>Fat: ${moneyFmt(ej.faturamento.alcancado)}</span>
                <span class="font-bold text-slate-700">${fatPerc.toFixed(0)}%</span>
            </div>
            <div class="w-full bg-slate-100 rounded-full h-1.5">
                <div class="bg-es-pink h-1.5 rounded-full" style="width: ${fatPerc}%"></div>
            </div>
        </div>
    `;
    return card;
}

function initLeftPanel(dados) {
    const listContainer = document.getElementById('cluster-list');
    listContainer.innerHTML = '';

    const clusters = {};
    dados.forEach(ej => {
        const c = ej.cluster || "Sem Cluster";
        if (!clusters[c]) clusters[c] = [];
        clusters[c].push(ej);
    });

    Object.keys(clusters).sort().forEach(clusterKey => {
        const clusterDiv = document.createElement('div');
        
        const title = document.createElement('h3');
        title.className = 'text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 pb-1 border-b border-slate-200';
        title.textContent = `CLUSTER ${clusterKey}`;
        clusterDiv.appendChild(title);

        const ejsList = document.createElement('div');
        ejsList.className = 'flex flex-col gap-2 mb-4';

        clusters[clusterKey].sort((a,b) => a.nome.localeCompare(b.nome)).forEach(ej => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between p-2 rounded bg-white border border-slate-100 hover:border-slate-300 cursor-pointer transition-colors shadow-sm';
            row.onclick = () => openTacticalProfile(ej);

            const farolColor = PALETTE[ej.farol] || "bg-slate-300";
            
            row.innerHTML = `
                <div class="flex items-center gap-2 truncate flex-1 pr-2">
                    <span class="w-2 h-2 rounded-full ${farolColor} shrink-0"></span>
                    <span class="text-[12px] font-medium text-slate-600 truncate">${ej.nome}</span>
                </div>
                ${getSituacaoBadge(ej.previsao.situacao)}
            `;
            ejsList.appendChild(row);
        });

        clusterDiv.appendChild(ejsList);
        listContainer.appendChild(clusterDiv);
    });
}

function renderKanban(dados) {
    const colSobe = document.getElementById('kanban-sobe');
    const colPerm = document.getElementById('kanban-permanece');
    const colCai = document.getElementById('kanban-cai');

    colSobe.innerHTML = ''; colPerm.innerHTML = ''; colCai.innerHTML = '';
    
    let countSobe = 0, countPerm = 0, countCai = 0;

    // Ordenar por gap financeiro ou ordem alfabetica
    const sorted = [...dados].sort((a,b) => a.nome.localeCompare(b.nome));

    sorted.forEach(ej => {
        const sit = ej.previsao.situacao;
        const card = createMiniCard(ej);
        
        if (sit === 'SOBE') { colSobe.appendChild(card); countSobe++; }
        else if (sit === 'CAI') { colCai.appendChild(card); countCai++; }
        else { colPerm.appendChild(card); countPerm++; }
    });

    document.getElementById('count-sobe').textContent = countSobe;
    document.getElementById('count-permanece').textContent = countPerm;
    document.getElementById('count-cai').textContent = countCai;
}

function setupEvents() {
    const textarea = document.getElementById("meeting-notes");
    textarea.addEventListener("input", (e) => {
        if (currentSelectedEJId) {
            localStorage.setItem(`notas_ej_v2_${currentSelectedEJId}`, e.target.value);
        }
    });

    document.getElementById("btn-back").addEventListener("click", () => {
        currentSelectedEJId = null;
        document.getElementById("ej-profile").classList.add("hidden");
        document.getElementById("ej-profile").classList.remove("flex");
        document.getElementById("crm-dashboard").classList.remove("opacity-0", "pointer-events-none");
    });
}

function generateAIStrategy(ej) {
    let insights = [];
    const fatGap = ej.faturamento.metaAno - ej.faturamento.alcancado;

    if (ej.previsao.situacao === 'CAI') {
        insights.push(`🚨 ALERTA: A projeção atual indica que a ${ej.nome} está em RISCO DE QUEDA de Cluster. É obrigatório recuperar o Farol Verde batendo as metas dos KPIs.`);
    } else if (ej.previsao.situacao === 'SOBE') {
        insights.push(`🚀 EXCELENTE: A projeção aponta que a ${ej.nome} VAI SUBIR para o Cluster ${ej.previsao.clusterAlmejado}! O momento é de tracionar para blindar esse resultado.`);
    } else {
        insights.push(`Estabilidade: A ${ej.nome} se MANTÉM no Cluster ${ej.cluster}. Para sonhar com o salto, é necessário escalar drasticamente o ticket médio de projetos.`);
    }

    if (fatGap > 0) {
        let percent = ej.faturamento.metaAno > 0 ? ((ej.faturamento.alcancado / ej.faturamento.metaAno) * 100) : 0;
        insights.push(`Financeiro: Existe um GAP de ${moneyFmt(fatGap)} (${percent.toFixed(1)}% alcançado da meta).`);
    } else {
        insights.push(`O Faturamento anual já foi batido. Excelente saúde financeira.`);
    }

    return insights.join(" ");
}

function fillProgressCard(idPrefix, alcancado, meta, formatter = (v) => v, isReverse = false) {
    document.getElementById(`card-${idPrefix}-alc`).textContent = formatter(alcancado);
    document.getElementById(`card-${idPrefix}-meta`).textContent = formatter(meta);
    
    let perc = 0;
    if (meta > 0) {
        perc = (alcancado / meta) * 100;
    }
    
    // Trava em 100% para visual da barra
    let visualPerc = Math.min(100, perc);
    document.getElementById(`card-${idPrefix}-bar`).style.width = `${visualPerc}%`;

    // Atualiza percentual no topo (se existir)
    const elPerc = document.getElementById(`card-${idPrefix}-percent`);
    if(elPerc) {
        elPerc.textContent = `${perc.toFixed(1)}%`;
        if (perc >= 100) {
            elPerc.className = "text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700";
        } else {
            elPerc.className = "text-xs font-bold px-2 py-0.5 rounded bg-pink-50 text-es-pink";
        }
    }
}

function openTacticalProfile(ej) {
    currentSelectedEJId = ej.id;

    // Switch Views
    document.getElementById("crm-dashboard").classList.add("opacity-0", "pointer-events-none");
    document.getElementById("ej-profile").classList.remove("hidden");
    document.getElementById("ej-profile").classList.add("flex");
    
    // Topbar
    document.getElementById("profile-cluster").textContent = `CLUSTER ${ej.cluster}`;
    document.getElementById("profile-name").textContent = ej.nome;
    
    const farolColorMap = {
        "VERDE": "bg-status-emerald", "AMARELO": "bg-status-yellow", 
        "VERMELHO": "bg-status-red", "ZERADA": "bg-slate-400"
    };
    document.getElementById("profile-farol").className = `text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded text-white ${farolColorMap[ej.farol] || 'bg-slate-400'}`;
    document.getElementById("profile-farol").textContent = ej.farol;

    const sitMap = {
        "SOBE": "bg-emerald-100 text-emerald-700 border-emerald-200",
        "CAI": "bg-red-100 text-red-700 border-red-200",
        "PERMANECE": "bg-slate-200 text-slate-700 border-slate-300"
    };
    const sitClass = sitMap[ej.previsao.situacao] || sitMap["PERMANECE"];
    document.getElementById("profile-forecast").className = `text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded border ${sitClass}`;
    document.getElementById("profile-forecast").textContent = `PREVISÃO: ${ej.previsao.situacao}`;

    // AI
    document.getElementById("profile-ai-text").textContent = generateAIStrategy(ej);

    // Diário de Bordo
    const textarea = document.getElementById("meeting-notes");
    textarea.value = localStorage.getItem(`notas_ej_v2_${ej.id}`) || '';

    // Cards
    fillProgressCard('fat', ej.faturamento.alcancado, ej.faturamento.metaAno, moneyFmt);
    fillProgressCard('csat', ej.csat.alcancado, ej.csat.meta, (v) => v.toFixed(1));
    fillProgressCard('eng', ej.engajamento.alcancado, ej.engajamento.meta);
    fillProgressCard('tempo', ej.tempo.alcancado, ej.tempo.meta);
}
