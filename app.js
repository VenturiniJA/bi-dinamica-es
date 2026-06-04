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
        processCSVTexts(trackingText, clusterText);
    }).catch(err => {
        console.error("Erro no fetch:", err);
        document.getElementById('network-status').textContent = 'Erro de Conexão.';
    });
});

window.processLocalFiles = function() {
    const fileTrack = document.getElementById('upload-tracking').files[0];
    const fileFarol = document.getElementById('upload-farol').files[0];
    
    if (!fileTrack || !fileFarol) {
        alert("Por favor, selecione ambos os arquivos (Tracking e Farol).");
        return;
    }
    
    document.getElementById('network-status').style.display = 'block';
    document.getElementById('network-status').textContent = 'Processando arquivos locais...';

    Promise.all([
        readFileAsCSV(fileTrack),
        readFileAsCSV(fileFarol)
    ]).then(([trackingText, clusterText]) => {
        processCSVTexts(trackingText, clusterText);
    }).catch(err => {
        console.error(err);
        alert("Erro ao ler os arquivos locais.");
    });
};

function readFileAsCSV(file) {
    return new Promise((resolve, reject) => {
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, {type: 'array'});
                    const firstSheetName = workbook.SheetNames[0];
                    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
                    resolve(csv);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        } else {
            file.text().then(resolve).catch(reject);
        }
    });
}

function processCSVTexts(trackingText, clusterText) {
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
}

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
    
    const cHeaders = clusterRows.length > 0 ? Object.keys(clusterRows[0]) : [];
    const colCSit = cHeaders.find(k => k.includes('SITUA'));
    const colCAlm = cHeaders.find(k => k.includes('ALMEJADO'));
    const colCIndAtual = cHeaders.find(k => k.includes('ATUAL') && k.includes('NDICE'));
    const colCIndPrev = cHeaders.find(k => k.includes('PREVISTO') && k.includes('NDICE'));
    const colCIndMin = cHeaders.find(k => k.includes('NIMO') && k.includes('NDICE'));
    const colCIndPular = cHeaders.find(k => k.includes('SUBIR') && k.includes('NDICE'));

    clusterRows.forEach(row => {
        let id = safeFloat(row['ID'] || row['id']);
        let nomeEJ = String(row['EJ'] || row['ej'] || '').trim().toLowerCase();
        let forecast = {
            situacao: String(row[colCSit] || '').trim().toUpperCase(),
            clusterAlmejado: safeFloat(row[colCAlm]),
            indiceAtual: cleanMoney(row[colCIndAtual]),
            indicePrevisto: cleanMoney(row[colCIndPrev]),
            indiceMinimo: cleanMoney(row[colCIndMin]),
            indicePular: cleanMoney(row[colCIndPular])
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

        const id = safeFloat(row[colID]);

        let clusterForecast = clusterMapById[id] || clusterMapByName[nome.toLowerCase()] || { situacao: "PERMANECE" };

        let rawCsat = safeFloat(row[colCSAT]);
        if (rawCsat > 5) {
            rawCsat = (rawCsat / 100) * 5; // Converter de 0-100% para 1-5
        }
        
        let rawMetaCsat = safeFloat(row[colMetaCSAT]);
        if (rawMetaCsat > 10) rawMetaCsat = rawMetaCsat / 100;
        if (rawMetaCsat > 5) rawMetaCsat = 5.0;

        let metaCsatFinal = rawMetaCsat > 0 ? rawMetaCsat : 3.5;
        let metaEngFinal = safeFloat(row[colMetaEng]) > 0 ? safeFloat(row[colMetaEng]) : 75;
        let metaTempoFinal = safeFloat(row[colMetaTempo]) > 0 ? safeFloat(row[colMetaTempo]) : 50;
        
        // Se a CSAT for 0, garantimos o teto minimo 3.5
        if (rawCsat === 0) rawCsat = 3.5;

        ejs.push({
            id: id,
            nome: nome,
            farol: String(row[colExcelente]).trim().toUpperCase(),
            cluster: safeFloat(row[colCluster]),
            faturamento: { metaAno: cleanMoney(row[colMetaFat]), alcancado: cleanMoney(row[colFatAlcan]) },
            csat: { meta: metaCsatFinal, alcancado: rawCsat },
            engajamento: { meta: metaEngFinal, alcancado: safeFloat(row[colEng]) },
            tempo: { meta: metaTempoFinal, alcancado: safeFloat(row[colTempo]) },
            previsao: clusterForecast
        });
    });
    return ejs;
}

function getClusterFromIndice(indice) {
    if (!indice) return 1;
    if (indice <= 12000000) return 1;
    if (indice <= 24000000) return 2;
    if (indice <= 61000000) return 3;
    if (indice <= 130000000) return 4;
    return 5;
}

function initGlobalKPIs(dados) {
    let totalRevenue = 0;
    let countVerde = 0, countAmarelo = 0, countVermelho = 0, countZerada = 0;
    
    dados.forEach(ej => {
        totalRevenue += ej.faturamento.alcancado || 0;

        let farol = String(ej.farol).trim().toUpperCase();
        if(farol === "VERDE" || farol === "EXCELENTE") countVerde++;
        else if(farol === "AMARELO" || farol === "ATENÇÃO") countAmarelo++;
        else if(farol === "VERMELHO" || farol === "ALERTA") countVermelho++;
        else countZerada++;
    });
    
    // Conforme layout/demanda: Saldo de Evolução da Rede
    let saldoEvolucao = countVerde - (countVermelho + countZerada);

    document.getElementById("global-revenue").textContent = moneyFmt(totalRevenue);
    
    let saldoEl = document.getElementById("global-ac");
    saldoEl.textContent = saldoEvolucao > 0 ? `+${saldoEvolucao}` : saldoEvolucao;
    if(saldoEvolucao > 0) saldoEl.className = "text-2xl font-bold text-status-emerald";
    else if(saldoEvolucao < 0) saldoEl.className = "text-2xl font-bold text-status-red";
    else saldoEl.className = "text-2xl font-bold text-slate-900";

    document.getElementById("count-verde").textContent = countVerde;
    document.getElementById("count-amarelo").textContent = countAmarelo;
    document.getElementById("count-vermelho").textContent = countVermelho;
    document.getElementById("count-zerada").textContent = countZerada;
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

window.updateStrategyFor = function(kpiType) {
    let ej = allEJs.find(e => e.id === currentSelectedEJId);
    if(!ej) return;
    
    let text = "";
    if (kpiType === 'faturamento') {
        text = `💡 <b>FOCO EM FATURAMENTO (${ej.nome}):</b><br><br>A EJ possui uma meta anual de ${moneyFmt(ej.faturamento.metaAno)}. No momento, alcançou ${moneyFmt(ej.faturamento.alcancado)}.<br><br>` + 
               (ej.faturamento.alcancado >= ej.faturamento.metaAno ? "Meta financeira batida! O foco agora é investir caixa em inovação e reter equipe para entregar a alta demanda com excelência." : "A EJ precisa tracionar urgemente suas vendas. Estratégia Pragmática: Foque em prospecção ativa via Inbound, recupere propostas perdidas (follow-up) e tente realizar upsell em contratos antigos para alavancar rapidamente.");
    } else if (kpiType === 'csat') {
        text = `💡 <b>FOCO EM QUALIDADE CSAT (${ej.nome}):</b><br><br>A meta de nota média é ${ej.csat.meta}, e a atual é ${ej.csat.alcancado}.<br><br>` + 
               (ej.csat.alcancado >= ej.csat.meta ? "Excelente qualidade de entrega. A estratégia aqui é usar os clientes promotores (NPS 9-10) para pedir indicações (Marketing de Indicação) e vender novos serviços (Upsell)." : "Urgente: O índice do Cluster está ameaçado pela baixa qualidade. Reestruture o pós-venda, crie alinhamentos semanais de expectativa com os clientes e pause vendas de projetos excessivamente complexos até sanar a entrega.");
    } else if (kpiType === 'engajamento') {
        text = `💡 <b>FOCO EM ENGAJAMENTO DA REDE (${ej.nome}):</b><br><br>A meta de Engajamento MEJ é de ${ej.engajamento.meta}, e o atual está em ${ej.engajamento.alcancado}.<br><br>` + 
               (ej.engajamento.alcancado >= ej.engajamento.meta ? "Equipe conectada! Membros engajados produzem mais e ficam mais tempo na EJ." : "Estratégia Pragmática: Incentive fortemente a participação dos membros em Eventos da Federação/Núcleo (EDL, ENEJ) e crie benchmarks semanais obrigatórios com outras EJs da rede para inflar o engajamento.");
    } else if (kpiType === 'tempo') {
        text = `💡 <b>FOCO EM TEMPO DE PERMANÊNCIA (${ej.nome}):</b><br><br>O tempo médio da equipe deveria ser ${ej.tempo.meta} meses, mas a retenção está em ${ej.tempo.alcancado} meses.<br><br>` + 
               (ej.tempo.alcancado >= ej.tempo.meta ? "Boa retenção de talentos. A gestão do conhecimento e o engajamento estão funcionando. Foco em criar planos de liderança." : "Alto Turnover: Membros estão saindo rápido. Estratégia Pragmática: Estruture um PDI (Plano de Desenvolvimento Individual) cristalino no momento do Trainee, conecte as metas pessoais ao projeto e evite sobrecarga extrema (Burnout) que destrói a permanência.");
    }

    // Adiciona botão para voltar à visão geral
    text += `<br><br><button onclick="document.getElementById('profile-ai-text').innerHTML = generateAIStrategy(allEJs.find(e => e.id === currentSelectedEJId))" class="text-xs text-es-blue hover:text-es-pink font-bold mt-2">← Voltar para Análise Holística</button>`;

    document.getElementById("profile-ai-text").innerHTML = text;
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

let currentFarolFilter = null;
window.filterByFarol = function(farolType) {
    if (currentFarolFilter === farolType) {
        currentFarolFilter = null; // Remove o filtro
    } else {
        currentFarolFilter = farolType;
    }
    renderKanban(allEJs); // Atualiza a tabela com os dados filtrados
};

function renderKanban(dados) {
    const tbody = document.getElementById("dashboard-table-body");
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let filteredData = dados;
    if (currentFarolFilter) {
        filteredData = dados.filter(ej => {
            let f = String(ej.farol).trim().toUpperCase();
            if (currentFarolFilter === 'VERDE') return f === 'VERDE' || f === 'EXCELENTE';
            if (currentFarolFilter === 'AMARELO') return f === 'AMARELO' || f === 'ATENÇÃO';
            if (currentFarolFilter === 'VERMELHO') return f === 'VERMELHO' || f === 'ALERTA';
            if (currentFarolFilter === 'ZERADA') return f === 'ZERADA' || (!f.includes('VERDE') && !f.includes('AMARELO') && !f.includes('VERMELHO') && !f.includes('EXCELENTE') && !f.includes('ATENÇÃO') && !f.includes('ALERTA'));
            return true;
        });
    }

    const sorted = [...filteredData].sort((a,b) => {
        if(a.cluster !== b.cluster) return b.cluster - a.cluster;
        return a.nome.localeCompare(b.nome);
    });

    const farolColorMap = {
        "VERDE": "bg-status-emerald", "EXCELENTE": "bg-status-emerald",
        "AMARELO": "bg-status-yellow", "ATENÇÃO": "bg-status-yellow",
        "VERMELHO": "bg-status-red", "ALERTA": "bg-status-red",
        "ZERADA": "bg-slate-400"
    };

    const sitMap = {
        "SOBE": "bg-emerald-100 text-emerald-700 border-emerald-200",
        "CAI": "bg-red-100 text-red-700 border-red-200",
        "PERMANECE": "bg-slate-200 text-slate-700 border-slate-300"
    };

    sorted.forEach(ej => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 cursor-pointer transition-colors group";
        tr.onclick = () => openTacticalProfile(ej);
        
        let fColor = farolColorMap[ej.farol] || 'bg-slate-400';
        let sitClass = sitMap[ej.previsao.situacao] || sitMap["PERMANECE"];
        
        tr.innerHTML = `
            <td class="py-4 px-4 font-bold text-slate-800 text-sm group-hover:text-es-blue transition-colors">
                <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full ${fColor}"></span>
                    ${ej.nome}
                </div>
            </td>
            <td class="py-4 px-4 text-sm text-slate-600 text-center">C${ej.cluster}</td>
            <td class="py-4 px-4 text-center">
                <span class="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded text-white ${fColor}">${ej.farol}</span>
            </td>
            <td class="py-4 px-4 text-sm font-medium text-slate-700 text-right">${moneyFmt(ej.faturamento.alcancado)}</td>
            <td class="py-4 px-4 text-sm font-medium text-slate-700 text-center">${ej.csat.alcancado}</td>
            <td class="py-4 px-4 text-center">
                <span class="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded border ${sitClass}">${ej.previsao.situacao}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
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

function formatM(val) {
    if (!val) return '0';
    if (val >= 1000000) return (val / 1000000).toFixed(1).replace('.0', '') + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1).replace('.0', '') + 'k';
    return val.toString();
}

function generateAIStrategy(ej) {
    let insights = [];
    
    let kpisProblematicos = [];
    let kpisExcelentes = [];
    
    // Análise de Faturamento
    let fatPerc = ej.faturamento.metaAno > 0 ? ((ej.faturamento.alcancado / ej.faturamento.metaAno) * 100) : 0;
    if (fatPerc < 100) kpisProblematicos.push(`Faturamento (GAP ${moneyFmt(ej.faturamento.metaAno - ej.faturamento.alcancado)})`);
    else kpisExcelentes.push('Faturamento');

    // Análise de CSAT
    if (ej.csat.meta > 0) {
        if (ej.csat.alcancado < ej.csat.meta) kpisProblematicos.push(`CSAT (${ej.csat.alcancado.toFixed(1)} de ${ej.csat.meta.toFixed(1)})`);
        else kpisExcelentes.push('CSAT');
    }

    // Análise de Engajamento
    if (ej.engajamento.meta > 0) {
        if (ej.engajamento.alcancado < ej.engajamento.meta) kpisProblematicos.push(`Engajamento MEJ (${ej.engajamento.alcancado})`);
        else kpisExcelentes.push('Engajamento');
    }

    // Análise de Tempo de Permanência
    if (ej.tempo.meta > 0) {
        if (ej.tempo.alcancado < ej.tempo.meta) kpisProblematicos.push(`Tempo de Permanência (${ej.tempo.alcancado})`);
        else kpisExcelentes.push('Tempo de Permanência');
    }

    // Parte 1: Situação do Mês (Curto Prazo)
    if (kpisProblematicos.length === 0) {
        insights.push(`🔥 MÊS EXCELENTE: A EJ bateu todas as metas de curto prazo (${kpisExcelentes.join(", ")}).`);
    } else {
        insights.push(`📊 FOCO DO MÊS: Ações imediatas devem ser tomadas nos seguintes indicadores numéricos que estão travando a evolução mensal: ${kpisProblematicos.join("; ")}.`);
    }

    // Parte 2: Projeção de Longo Prazo (Cluster)
    if (ej.previsao.situacao === 'CAI') {
        insights.push(`🚨 ALERTA DE QUEDA: A projeção anual (Índice de ${formatM(ej.previsao.indicePrevisto)}) não atinge a nota de corte para se manter no Cluster ${ej.cluster} (Mínimo de ${formatM(ej.previsao.indiceMinimo)}). Alavancar resultados acima das metas traçadas é urgente.`);
    } else if (ej.previsao.situacao === 'SOBE') {
        insights.push(`🚀 TRAÇÃO DE SUBIDA: O Índice Previsto (${formatM(ej.previsao.indicePrevisto)}) ultrapassa a nota de corte para salto de Cluster (${formatM(ej.previsao.indicePular)}). O objetivo estratégico de longo prazo é não desacelerar a máquina de vendas.`);
    } else {
        insights.push(`⚖️ ESTABILIDADE: A projeção de Índice (${formatM(ej.previsao.indicePrevisto)}) garante a manutenção no Cluster ${ej.cluster}. Há um gap para alcançar os ${formatM(ej.previsao.indicePular)} necessários para subir no fim do ano.`);
    }

    // Parte 3: Dica Pragmática Baseada nas Dores do Cluster (Substituindo dicas genéricas)
    let c = parseInt(ej.cluster);
    if (c === 1) {
        insights.push("💡 ATAQUE PRAGMÁTICO (CL 1): A maior dor neste cluster é a ausência de funil de vendas. Focar em Ligações e Prospecção Ativa diária é a chave. O engajamento baixo se resolve alocando os membros em projetos rapidamente.");
    } else if (c === 2) {
        insights.push("💡 ATAQUE PRAGMÁTICO (CL 2): Vendas pontuais e de baixo ticket travam o avanço para o C3. O foco principal deve ser a captação de leads constantes via Inbound Marketing e estruturação de um portfólio de ticket levemente maior.");
    } else if (c === 3) {
        insights.push("💡 ATAQUE PRAGMÁTICO (CL 3): A dor central do C3 é a Retenção e a Qualidade de Entrega. Com mais projetos rodando, o CSAT cai e os membros saem. É urgente estruturar um setor de Sucesso do Cliente (CS) e investir em PDI (Plano de Desenvolvimento Individual).");
    } else if (c === 4) {
        insights.push("💡 ATAQUE PRAGMÁTICO (CL 4): Estagnação comercial. Para pular pro topo (C5), a EJ deve parar de focar em alto volume de pequenos projetos e iniciar o ataque a Contratos B2B longos e serviços de altíssimo Ticket Médio. Participação na Federação conta muito.");
    } else if (c === 5) {
        insights.push("💡 ATAQUE PRAGMÁTICO (CL 5): O desafio do topo é a Inovação. É dificílimo manter altos percentuais de crescimento com metodologias tradicionais. Explorar novos mercados regionais, produtos escaláveis recorrentes e garantir NPS Promotor nos clientes chave.");
    } else {
        insights.push("💡 ATAQUE PRAGMÁTICO: Estruture planos de ação focados nos gargalos do mês.");
    }

    return insights.join(" <br><br> ");
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
    document.getElementById('profile-ai-text').innerHTML = generateAIStrategy(ej);

    // Calculadora de Cluster
    const min = ej.previsao.indiceMinimo || 0;
    const alvo = ej.previsao.indicePular || 0;
    const prev = ej.previsao.indicePrevisto || 0;
    
    document.getElementById("calc-indice-atual").textContent = formatM(ej.previsao.indiceAtual || 0);
    document.getElementById("calc-indice-previsto").textContent = formatM(prev);
    
    document.getElementById("calc-val-minimo").textContent = formatM(min);
    document.getElementById("calc-val-alvo").textContent = formatM(alvo);

    let calcPercent = 0;
    let minMarkerPercent = 0;

    // Se o alvo for 0 (Cluster 5 já no topo), a barra fica 100%
    if (alvo <= 0) {
        calcPercent = 100;
        minMarkerPercent = 10;
        document.getElementById("calc-label-alvo").textContent = 'Teto';
    } else {
        document.getElementById("calc-label-alvo").textContent = 'Alvo (Subir)';
        calcPercent = Math.min(100, (prev / alvo) * 100);
        minMarkerPercent = Math.min(100, (min / alvo) * 100);
    }
    
    document.getElementById("calc-bar-previsto").style.width = `${calcPercent}%`;
    document.getElementById("calc-marker-min").style.left = `${minMarkerPercent}%`;
    
    // Cores da Calculadora
    const calcPrevEl = document.getElementById("calc-indice-previsto");
    const calcBarEl = document.getElementById("calc-bar-previsto");
    if (prev < min) {
        calcPrevEl.className = "text-lg font-extrabold text-status-red";
        calcBarEl.className = "bg-status-red h-2 rounded-full absolute top-0 left-0 transition-all duration-500";
    } else if (prev >= alvo && alvo > 0) {
        calcPrevEl.className = "text-lg font-extrabold text-status-emerald";
        calcBarEl.className = "bg-status-emerald h-2 rounded-full absolute top-0 left-0 transition-all duration-500";
    } else {
        calcPrevEl.className = "text-lg font-extrabold text-es-blue";
        calcBarEl.className = "bg-es-blue h-2 rounded-full absolute top-0 left-0 transition-all duration-500";
    }

    // Progresso do Cluster nas barras
    let distPerc = 0;
    if (ej.previsao.situacao === 'CAI') {
        distPerc = ej.previsao.indiceMinimo > 0 ? (ej.previsao.indiceAtual / ej.previsao.indiceMinimo) * 100 : 0;
    } else {
        distPerc = ej.previsao.indicePular > 0 ? (ej.previsao.indiceAtual / ej.previsao.indicePular) * 100 : 100;
    }
    if (isNaN(distPerc) || !isFinite(distPerc)) distPerc = 0;
    if (distPerc > 100) distPerc = 100;

    let csatPerc = ej.csat.meta > 0 ? (ej.csat.alcancado / ej.csat.meta) * 100 : 0;
    if(csatPerc > 100) csatPerc = 100;
    let engPerc = ej.engajamento.meta > 0 ? (ej.engajamento.alcancado / ej.engajamento.meta) * 100 : 0;
    if(engPerc > 100) engPerc = 100;
    let tempPerc = ej.tempo.meta > 0 ? (ej.tempo.alcancado / ej.tempo.meta) * 100 : 0;
    if(tempPerc > 100) tempPerc = 100;

    fillProgressCard('fat', ej.faturamento.alcancado, ej.faturamento.metaAno, moneyFmt);
    fillProgressCard('csat', ej.csat.alcancado, ej.csat.meta);
    fillProgressCard('eng', ej.engajamento.alcancado, ej.engajamento.meta);
    fillProgressCard('tempo', ej.tempo.alcancado, ej.tempo.meta);

    // Diário de Bordo
    const textarea = document.getElementById("meeting-notes");
    textarea.value = localStorage.getItem(`notas_ej_v2_${ej.id}`) || '';
}
