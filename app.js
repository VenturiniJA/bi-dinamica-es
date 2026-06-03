let predictChartInstance = null;
let currentSelectedEJId = null;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('network-status').textContent = 'Baixando cruzamento de dados (Tracking + Farol de Cluster)...';

    const trackingURL = 'https://docs.google.com/spreadsheets/d/163X5ADTJkHXK4INVs4KPdAXveUXhz0sYEoDGIdHWdOM/export?format=csv&gid=1067661499';
    const clusterURL = 'https://docs.google.com/spreadsheets/d/163X5ADTJkHXK4INVs4KPdAXveUXhz0sYEoDGIdHWdOM/export?format=csv&gid=1494647923';

    Promise.all([
        fetch(trackingURL).then(r => r.text()),
        fetch(clusterURL).then(r => r.text())
    ]).then(([trackingText, clusterText]) => {
        // Limpar cabecalho zoado do tracking
        const trackLines = trackingText.split('\n');
        trackLines.shift(); // Remove "Mês em Análise"
        const cleanTrackCSV = trackLines.join('\n');

        // Limpar cabecalho zoado do cluster
        const clusterLines = clusterText.split('\n');
        // A aba Farol de cluster tem as linhas: 1-11 vazias ou texto solto.
        // O header começa na linha que tem "ID,EJ,FEDERAÇÃO" (linha 12 indexada).
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
                        const parsedData = processData(trackResults.data, clusterResults.data);
                        if (!parsedData || parsedData.length === 0) {
                            document.getElementById('network-status').textContent = 'Nenhuma EJ encontrada.';
                            return;
                        }
                        initGlobalKPIs(parsedData);
                        initLeftPanel(parsedData);
                        initNetworkGraph(parsedData);
                        setupMeetingMode();
                    }
                });
            }
        });
    }).catch(err => {
        console.error("Erro no fetch:", err);
        document.getElementById('network-status').textContent = 'Erro ao baixar planilhas.';
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
    
    // Map cluster data by ID
    const clusterMap = {};
    clusterRows.forEach(row => {
        let id = safeFloat(row['ID']);
        if(id > 0) {
            clusterMap[id] = {
                situacao: String(row['SITUAÇÃO ATUAL'] || '').trim().toUpperCase(),
                clusterAlmejado: safeFloat(row['CLUSTER ALMEJADO']),
                indiceAtual: cleanMoney(row['ÍNDICE ATUAL']),
                indicePular: cleanMoney(row['ÍNDICE P/ SUBIR'])
            };
        }
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
        const clusterForecast = clusterMap[id] || { situacao: "DESCONHECIDO" };

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

function getSituacaoBadge(situacao) {
    if (situacao === 'SOBE') return '<span class="text-[10px] font-bold bg-status-emerald/20 text-status-emerald px-1.5 py-0.5 rounded ml-2">↑ SOBE</span>';
    if (situacao === 'CAI') return '<span class="text-[10px] font-bold bg-status-red/20 text-status-red px-1.5 py-0.5 rounded ml-2">↓ CAI</span>';
    if (situacao === 'PERMANECE') return '<span class="text-[10px] font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded ml-2">= PERMANECE</span>';
    return '';
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

    const palette = {
        "VERDE": "bg-status-emerald",
        "AMARELO": "bg-status-yellow",
        "VERMELHO": "bg-status-red",
        "ZERADA": "bg-status-zerada"
    };

    Object.keys(clusters).sort().forEach(clusterKey => {
        const clusterDiv = document.createElement('div');
        clusterDiv.className = 'mb-4';
        
        const title = document.createElement('h3');
        title.className = 'text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 border-b border-slate-100 pb-1';
        title.textContent = `Cluster ${clusterKey}`;
        clusterDiv.appendChild(title);

        const ejsList = document.createElement('div');
        ejsList.className = 'flex flex-col gap-2';

        clusters[clusterKey].sort((a,b) => a.nome.localeCompare(b.nome)).forEach(ej => {
            const card = document.createElement('div');
            card.className = 'flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 hover:border-es-blue/50 cursor-pointer transition-colors';
            card.onclick = () => {
                if (window.networkInstance) {
                    window.networkInstance.selectNodes([ej.id]);
                    window.networkInstance.focus(ej.id, { scale: 1.2, animation: true });
                }
                openTacticalProfile(ej);
            };

            const farolColor = palette[ej.farol] || "bg-slate-300";
            
            card.innerHTML = `
                <div class="flex items-center gap-2 truncate flex-1">
                    <span class="w-2.5 h-2.5 rounded-full ${farolColor} shrink-0"></span>
                    <span class="text-sm font-semibold text-slate-700 truncate">${ej.nome}</span>
                </div>
                ${getSituacaoBadge(ej.previsao.situacao)}
            `;
            ejsList.appendChild(card);
        });

        clusterDiv.appendChild(ejsList);
        listContainer.appendChild(clusterDiv);
    });
}

function initNetworkGraph(dados) {
    const container = document.getElementById("network-canvas");
    const nodesArray = [];
    const edgesArray = [];

    const palette = { "VERDE": "#10b981", "AMARELO": "#f59e0b", "VERMELHO": "#ef4444", "ZERADA": "#cbd5e1" };

    dados.forEach(ej => {
        let baseColor = palette[ej.farol] || "#78BCE2"; 
        let gapCount = 0;
        if (ej.faturamento.alcancado < ej.faturamento.metaAno) gapCount++;
        if (ej.csat.alcancado < ej.csat.meta) gapCount++;
        if (ej.tempo.alcancado < ej.tempo.meta) gapCount++;
        if (ej.engajamento.alcancado < ej.engajamento.meta) gapCount++;

        let nodeSize = 25 - (gapCount * 2); 
        if(nodeSize < 10) nodeSize = 10;

        nodesArray.push({
            id: ej.id, label: ej.nome, value: nodeSize, group: ej.cluster,
            color: { background: baseColor, border: "#FFFFFF", highlight: { background: baseColor, border: "#cbd5e1" } },
            font: { color: "#1e293b", face: "Inter", size: 14, strokeWidth: 3, strokeColor: "#ffffff" },
            shape: "dot", borderWidth: 2, shadow: true, rawEJData: ej 
        });
    });

    for (let i = 0; i < dados.length; i++) {
        for (let j = i + 1; j < dados.length; j++) {
            if (dados[i].cluster === dados[j].cluster && dados[i].cluster !== 0 && !isNaN(dados[i].cluster)) {
                edgesArray.push({ from: dados[i].id, to: dados[j].id, color: { color: "rgba(0, 0, 0, 0.05)" }, length: 150, width: 1 });
            }
        }
    }

    const nodes = new vis.DataSet(nodesArray);
    const edges = new vis.DataSet(edgesArray);
    
    const options = {
        nodes: { scaling: { customScalingFunction: function (min, max, total, value) { return value / max; }, min: 10, max: 30 }, label: { enabled: true, min: 12, max: 18 } },
        edges: { smooth: { type: "continuous" } },
        physics: { enabled: true, barnesHut: { gravitationalConstant: -2000, centralGravity: 0.1, springLength: 150, springConstant: 0.04, damping: 0.09, avoidOverlap: 0.2 }, stabilization: { enabled: true, iterations: 1000 } },
        interaction: { hover: true, tooltipDelay: 200, zoomView: true, dragView: true }
    };

    window.networkInstance = new vis.Network(container, { nodes, edges }, options);

    window.networkInstance.on("stabilizationIterationsDone", function () {
        document.getElementById('network-status').textContent = 'Rede Estática Ativa';
        setTimeout(() => { document.getElementById('network-status').style.opacity = '0'; }, 2000);
        window.networkInstance.setOptions( { physics: false } );
    });

    window.networkInstance.on("click", function (params) {
        if (params.nodes.length > 0) {
            openTacticalProfile(nodes.get(params.nodes[0]).rawEJData);
        } else {
            closeMeetingMode();
        }
    });
}

function generateAIStrategy(ej) {
    let insights = [];
    const fatGap = ej.faturamento.metaAno - ej.faturamento.alcancado;
    const csatGap = ej.csat.meta - ej.csat.alcancado;

    if (ej.previsao.situacao === 'CAI') {
        insights.push(`🚨 ALERTA: A projeção indica que a ${ej.nome} irá CAIR de cluster. Foco total em recuperar os Índices e bater as metas de farol.`);
    } else if (ej.previsao.situacao === 'SOBE') {
        insights.push(`🚀 EXCELENTE: A projeção indica que a ${ej.nome} vai SUBIR para o Cluster ${ej.previsao.clusterAlmejado}! Apenas mantenham o ritmo atual.`);
    } else {
        insights.push(`A ${ej.nome} está estagnada (PERMANECE no Cluster ${ej.cluster}). É preciso alavancar o faturamento teto para pleitear o salto.`);
    }

    if (fatGap > 0) {
        let percent = ej.faturamento.metaAno > 0 ? ((ej.faturamento.alcancado / ej.faturamento.metaAno) * 100) : 0;
        insights.push(`Com GAP de ${moneyFmt(fatGap)} (${percent.toFixed(1)}% alcançado), a máquina de vendas precisa tracionar agora.`);
    } else {
        insights.push(`A meta anual já foi atingida, cenário perfeito para projetos de inovação.`);
    }

    if (ej.csat.alcancado === 0 && ej.csat.meta > 0) {
        insights.push(`Coleta de NPS nula. Ações de CSAT urgentes!`);
    } else if (csatGap > 0) {
        insights.push(`CSAT de ${ej.csat.alcancado.toFixed(1)} abaixo da meta. Atenção aos detratores na execução.`);
    }

    return insights.join(" ");
}

function openTacticalProfile(ej) {
    currentSelectedEJId = ej.id;

    // Habilita Sidebar Direita
    document.getElementById("no-selection").classList.add("hidden");
    const details = document.getElementById("selection-details");
    details.classList.remove("hidden");
    details.classList.add("flex");
    
    // Header
    document.getElementById("ej-cluster").textContent = `CLUSTER ${ej.cluster}`;
    document.getElementById("ej-name").textContent = ej.nome;
    document.getElementById("ej-ai-strategy").textContent = generateAIStrategy(ej);

    // Progresso e GAPs Faturamento
    const fatGap = Math.max(0, ej.faturamento.metaAno - ej.faturamento.alcancado);
    document.getElementById("card-fat-alc").textContent = moneyFmt(ej.faturamento.alcancado);
    document.getElementById("card-fat-meta").textContent = moneyFmt(ej.faturamento.metaAno);
    document.getElementById("card-fat-gap").textContent = fatGap > 0 ? `- ${moneyFmt(fatGap)}` : 'Meta Batida!';
    
    const fatPerc = ej.faturamento.metaAno > 0 ? Math.min(100, (ej.faturamento.alcancado / ej.faturamento.metaAno) * 100) : 0;
    document.getElementById("card-fat-percent").textContent = `${fatPerc.toFixed(1)}%`;
    document.getElementById("card-fat-progress").style.width = `${fatPerc}%`;

    // Outros GAPs
    const csatGap = Math.max(0, ej.csat.meta - ej.csat.alcancado);
    document.getElementById("card-csat-alc").textContent = ej.csat.alcancado.toFixed(1);
    document.getElementById("card-csat-meta").textContent = ej.csat.meta.toFixed(1);
    document.getElementById("card-csat-gap").textContent = csatGap > 0 ? `- ${csatGap.toFixed(1)}` : 'OK!';

    const tempoGap = Math.max(0, ej.tempo.meta - ej.tempo.alcancado);
    document.getElementById("card-tempo-alc").textContent = ej.tempo.alcancado;
    document.getElementById("card-tempo-meta").textContent = ej.tempo.meta;
    document.getElementById("card-tempo-gap").textContent = tempoGap > 0 ? `- ${tempoGap}` : 'OK!';

    const engGap = Math.max(0, ej.engajamento.meta - ej.engajamento.alcancado);
    document.getElementById("card-eng-alc").textContent = ej.engajamento.alcancado;
    document.getElementById("card-eng-meta").textContent = ej.engajamento.meta;
    document.getElementById("card-eng-gap").textContent = engGap > 0 ? `- ${engGap}` : 'OK!';

    renderPredictChart(ej.faturamento.metaAno, ej.faturamento.alcancado, 6); 

    // Modo Reunião (Abre o Diário Central)
    const overlay = document.getElementById("meeting-overlay");
    const canvas = document.getElementById("network-canvas");
    document.getElementById("meeting-ej-name").textContent = ej.nome;
    
    // Recupera anotações do Local Storage
    const textarea = document.getElementById("meeting-notes");
    textarea.value = localStorage.getItem(`notas_ej_${ej.id}`) || '';

    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
    canvas.classList.add("opacity-10");
}

function closeMeetingMode() {
    currentSelectedEJId = null;
    document.getElementById("no-selection").classList.remove("hidden");
    const details = document.getElementById("selection-details");
    details.classList.add("hidden");
    details.classList.remove("flex");

    const overlay = document.getElementById("meeting-overlay");
    const canvas = document.getElementById("network-canvas");
    
    overlay.classList.add("hidden");
    overlay.classList.remove("flex");
    canvas.classList.remove("opacity-10");
}

function setupMeetingMode() {
    const textarea = document.getElementById("meeting-notes");
    textarea.addEventListener("input", (e) => {
        if (currentSelectedEJId) {
            localStorage.setItem(`notas_ej_${currentSelectedEJId}`, e.target.value);
        }
    });

    document.getElementById("btn-close-meeting").addEventListener("click", closeMeetingMode);
}

function renderPredictChart(metaTotalAno, alcancadoJunho, mesAtualIndex) {
    const ctx = document.getElementById('predictChart').getContext('2d');
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    const metaLinearData = months.map((m, i) => metaTotalAno * ((i + 1) / 12));
    const alcancadoData = [];
    for(let i=0; i<12; i++) {
        if(i < mesAtualIndex) alcancadoData.push(alcancadoJunho * ((i+1)/mesAtualIndex));
        else alcancadoData.push(null);
    }

    if (predictChartInstance) predictChartInstance.destroy();

    predictChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Fat. Alcançado',
                    data: alcancadoData,
                    borderColor: '#10b981', 
                    backgroundColor: '#10b981',
                    borderWidth: 3, pointRadius: 4, fill: false, tension: 0.1
                },
                {
                    label: 'Meta Linear',
                    data: metaLinearData,
                    borderColor: '#94a3b8', 
                    borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false, tension: 0.1
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true, position: 'bottom', labels: { color: '#64748b', boxWidth: 12, font: {family: 'Inter'} } } },
            scales: {
                x: { ticks: { color: '#64748b', font: { size: 10, family: 'Inter' } }, grid: { display: false } },
                y: { ticks: { color: '#64748b', font: { size: 10, family: 'Inter' }, callback: (v) => 'R$ '+v/1000+'k' }, grid: { color: 'rgba(0,0,0,0.05)' } }
            }
        }
    });
}
