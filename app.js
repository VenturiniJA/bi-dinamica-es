// src/app.js

let predictChartInstance = null;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('network-status').textContent = 'Baixando dados reais (Tracking)...';

    const sheetURL = 'https://docs.google.com/spreadsheets/d/163X5ADTJkHXK4INVs4KPdAXveUXhz0sYEoDGIdHWdOM/export?format=csv&gid=1067661499';

    fetch(sheetURL)
        .then(response => response.text())
        .then(text => {
            // Remove a primeira linha inútil ("Mês em Análise: Junho")
            const lines = text.split('\n');
            lines.shift();
            const cleanCSV = lines.join('\n');

            Papa.parse(cleanCSV, {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    const parsedData = processTrackingData(results.data);
                    if (!parsedData || parsedData.length === 0) {
                        document.getElementById('network-status').textContent = 'Nenhuma EJ da Juniores encontrada.';
                        return;
                    }
                    initGlobalKPIs(parsedData);
                    initCharts(parsedData);
                    initNetworkGraph(parsedData);
                },
                error: function(err) {
                    console.error("Erro ao fazer parse do CSV:", err);
                    document.getElementById('network-status').textContent = 'Falha ao conectar no Google Sheets.';
                }
            });
        })
        .catch(err => {
            console.error("Erro no fetch:", err);
            document.getElementById('network-status').textContent = 'Erro ao baixar planilha.';
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
    const floatVal = parseFloat(String(val).replace(',', '.'));
    return isNaN(floatVal) ? 0.0 : floatVal;
}

function processTrackingData(rows) {
    const ejs = [];

    // Localizar as colunas exatas pelas substrings como fizemos no Python para segurança de charset
    if (rows.length === 0) return ejs;
    const headers = Object.keys(rows[0]);

    const colID = headers.find(c => c.includes('ID'));
    const colEJ = headers.find(c => c.includes('EJ') && !c.includes('EXCELENTE'));
    const colExcelente = headers.find(c => c.includes('EJ EXCELENTE'));
    const colCluster = headers.find(c => c.includes('Cluster') && !c.includes('Farol'));
    const colFed = headers.find(c => c.includes('Federa'));

    const colMetaFat = headers.find(c => c.includes('Meta de Faturamento'));
    const colFatAlcan = headers.find(c => c.includes('Faturamento') && c.includes('Alcan'));
    const colMetaMes = headers.find(c => c.includes('Meta do M'));

    const colMetaCSAT = headers.find(c => c.includes('META de CSAT'));
    const colCSAT = headers.find(c => c.includes('CSAT') && !c.includes('META') && !c.includes('%'));

    const colMetaEng = headers.find(c => c.includes('Meta de Engajamento'));
    const colEng = headers.find(c => c.includes('Engajamento com o MEJ') && !c.includes('Meta'));

    const colMetaTempo = headers.find(c => c.includes('Meta de Tempo de Perman'));
    const colTempo = headers.find(c => c.includes('Tempo de Perman') && !c.includes('Meta'));

    rows.forEach(row => {
        // Filtrar apenas Juniores e ignorar Concentro
        if (String(row[colFed]).trim() !== 'Juniores') return;
        
        const nome = String(row[colEJ]).trim();
        if (!nome || nome.toUpperCase() === 'CONCENTRO' || nome.toUpperCase() === 'NAN') return;

        ejs.push({
            id: safeFloat(row[colID]),
            nome: nome,
            farol: String(row[colExcelente]).trim().toUpperCase(),
            cluster: safeFloat(row[colCluster]),
            faturamento: {
                metaAno: cleanMoney(row[colMetaFat]),
                alcancado: cleanMoney(row[colFatAlcan]),
                metaMes: cleanMoney(row[colMetaMes])
            },
            csat: {
                meta: safeFloat(row[colMetaCSAT]),
                alcancado: safeFloat(row[colCSAT])
            },
            engajamento: {
                meta: safeFloat(row[colMetaEng]),
                alcancado: safeFloat(row[colEng])
            },
            tempo: {
                meta: safeFloat(row[colMetaTempo]),
                alcancado: safeFloat(row[colTempo])
            },
            summary: "Conexão Local (Web Fetch). Resumos de PDF não estão disponíveis neste modo estático."
        });
    });

    return ejs;
}

function initGlobalKPIs(dados) {
    let totalRevenue = 0;
    let totalCSAT = 0;
    let csatCount = 0;
    let acCount = 0;

    dados.forEach(ej => {
        totalRevenue += ej.faturamento.alcancado || 0;
        if (ej.csat && ej.csat.alcancado > 0) {
            totalCSAT += ej.csat.alcancado;
            csatCount++;
        }
        if (ej.farol === "VERDE") {
            acCount++;
        }
    });

    const avgCSAT = csatCount > 0 ? (totalCSAT / csatCount).toFixed(1) : "0.0";
    
    document.getElementById("global-revenue").textContent = `R$ ${totalRevenue.toLocaleString('pt-BR', {maximumFractionDigits: 0})}`;
    document.getElementById("global-csat").textContent = avgCSAT;
    document.getElementById("global-ac").textContent = `${acCount} / ${dados.length}`;
}

function initCharts(dados) {
    const colorBlue = '#78BCE2';
    const colorEmerald = '#10b981';

    // Top 10 Faturamento
    const sortedByRevenue = [...dados].sort((a, b) => (b.faturamento.alcancado || 0) - (a.faturamento.alcancado || 0)).slice(0, 10);
    const revenueLabels = sortedByRevenue.map(d => d.nome.substring(0, 15));
    const revenueData = sortedByRevenue.map(d => d.faturamento.alcancado || 0);

    const ctxRev = document.getElementById('revenueChart').getContext('2d');
    new Chart(ctxRev, {
        type: 'bar',
        data: {
            labels: revenueLabels,
            datasets: [{
                label: 'Faturamento Alcançado',
                data: revenueData,
                backgroundColor: colorBlue,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
                y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });

    // Top 10 Engajamento
    const sortedByEng = [...dados].sort((a, b) => (b.engajamento.alcancado || 0) - (a.engajamento.alcancado || 0)).slice(0, 10);
    const engLabels = sortedByEng.map(d => d.nome.substring(0, 15));
    const engData = sortedByEng.map(d => d.engajamento.alcancado || 0);

    const ctxEng = document.getElementById('engChart').getContext('2d');
    new Chart(ctxEng, {
        type: 'bar',
        data: {
            labels: engLabels,
            datasets: [{
                label: 'Engajamento Alcançado',
                data: engData,
                backgroundColor: colorEmerald,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
                y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function initNetworkGraph(dados) {
    const container = document.getElementById("network-canvas");

    const nodesArray = [];
    const edgesArray = [];

    const palette = {
        VERDE: "#10b981",
        AMARELO: "#f59e0b",
        VERMELHO: "#ef4444",
        ZERADA: "#334155"
    };

    dados.forEach(ej => {
        let baseColor = palette[ej.farol] || "#78BCE2"; // Fallback blue
        
        let nodeColor = {
            background: baseColor,
            border: "#FFFFFF",
            highlight: { background: baseColor, border: "#FFFFFF" }
        };

        const fatValue = ej.faturamento.metaAno || 1000;
        const nodeSize = Math.max(10, Math.min(35, Math.log10(fatValue) * 4));

        nodesArray.push({
            id: ej.id,
            label: ej.nome,
            value: nodeSize, 
            group: ej.cluster,
            color: nodeColor,
            font: { color: "#e2e8f0", face: "Inter", size: 16, strokeWidth: 4, strokeColor: "#0b1121" },
            shape: "dot",
            borderWidth: 2,
            shadow: true,
            rawEJData: ej 
        });
    });

    for (let i = 0; i < dados.length; i++) {
        for (let j = i + 1; j < dados.length; j++) {
            if (dados[i].cluster === dados[j].cluster && dados[i].cluster !== 0 && !isNaN(dados[i].cluster)) {
                edgesArray.push({
                    from: dados[i].id,
                    to: dados[j].id,
                    color: { color: "rgba(255, 255, 255, 0.1)" },
                    length: 120, 
                    width: 1
                });
            }
        }
    }

    const nodes = new vis.DataSet(nodesArray);
    const edges = new vis.DataSet(edgesArray);
    const data = { nodes, edges };

    const options = {
        nodes: {
            scaling: {
                customScalingFunction: function (min, max, total, value) { return value / max; },
                min: 15, max: 35,
                label: { enabled: true, min: 14, max: 20 }
            }
        },
        edges: { smooth: { type: "continuous" } },
        physics: {
            enabled: true,
            barnesHut: {
                gravitationalConstant: -2000,
                centralGravity: 0.1,
                springLength: 100,
                springConstant: 0.05,
                damping: 0.09,
                avoidOverlap: 0.3
            },
            stabilization: { enabled: true, iterations: 1000, updateInterval: 100 }
        },
        interaction: { hover: true, tooltipDelay: 200, zoomView: true, dragView: true }
    };

    const network = new vis.Network(container, data, options);

    network.on("stabilizationProgress", function (params) {
        document.getElementById('network-status').textContent = `Agrupando clusters: ${Math.round((params.iterations/params.total)*100)}%`;
    });

    network.on("stabilizationIterationsDone", function () {
        document.getElementById('network-status').textContent = 'Rede Estática Ativa (Tracking Oficial)';
        setTimeout(() => { document.getElementById('network-status').style.opacity = '0'; }, 3000);
        network.setOptions( { physics: false } );
    });

    network.on("click", function (params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            const selectedNode = nodes.get(nodeId);
            openTacticalProfile(selectedNode.rawEJData);
        } else {
            document.getElementById("no-selection").classList.remove("hidden");
            document.getElementById("selection-details").classList.add("hidden");
            document.getElementById("selection-details").classList.remove("flex");
        }
    });
}

function openTacticalProfile(ej) {
    document.getElementById("no-selection").classList.add("hidden");
    const details = document.getElementById("selection-details");
    details.classList.remove("hidden");
    details.classList.add("flex");
    
    // Header
    const ejCluster = document.getElementById("ej-cluster");
    ejCluster.textContent = `CLUSTER ${ej.cluster}`;
    
    // Cor de destaque baseada no farol
    const palette = { "VERDE": "bg-status-emerald/20 text-status-emerald", "AMARELO": "bg-status-yellow/20 text-status-yellow", "VERMELHO": "bg-status-red/20 text-status-red", "ZERADA": "bg-slate-700 text-slate-300" };
    ejCluster.className = `text-xs font-bold tracking-wider uppercase px-2 py-1 rounded-md ${palette[ej.farol] || "bg-es-blue/10 text-es-blue"}`;
    
    document.getElementById("ej-name").textContent = ej.nome;

    // 4 Metas Cards
    document.getElementById("card-fat-alc").textContent = `R$ ${ej.faturamento.alcancado.toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
    document.getElementById("card-fat-meta").textContent = `R$ ${ej.faturamento.metaAno.toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;

    document.getElementById("card-csat-alc").textContent = ej.csat.alcancado.toFixed(1);
    document.getElementById("card-csat-meta").textContent = ej.csat.meta.toFixed(1);

    document.getElementById("card-tempo-alc").textContent = ej.tempo.alcancado;
    document.getElementById("card-tempo-meta").textContent = ej.tempo.meta;

    document.getElementById("card-eng-alc").textContent = ej.engajamento.alcancado;
    document.getElementById("card-eng-meta").textContent = ej.engajamento.meta;

    // Context
    document.getElementById("ej-summary").textContent = ej.summary;

    // Line Chart Previsibilidade
    renderPredictChart(ej.faturamento.metaAno, ej.faturamento.alcancado, 6); // 6 = Mês de Junho
}

function renderPredictChart(metaTotalAno, alcançadoJunho, mesAtualIndex) {
    const ctx = document.getElementById('predictChart').getContext('2d');
    
    // Meses
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    // Meta Linear: Distribui a meta igualmente nos 12 meses
    const metaLinearData = months.map((m, i) => metaTotalAno * ((i + 1) / 12));
    
    // Alcançado: Reta do zero até o mês atual
    const alcançadoData = [];
    for(let i=0; i<12; i++) {
        if(i < mesAtualIndex) {
            alcançadoData.push(alcançadoJunho * ((i+1)/mesAtualIndex));
        } else {
            alcançadoData.push(null);
        }
    }

    if (predictChartInstance) {
        predictChartInstance.destroy();
    }

    predictChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Faturamento Alcançado',
                    data: alcançadoData,
                    borderColor: '#10b981', // Verde
                    backgroundColor: '#10b981',
                    borderWidth: 3,
                    pointRadius: 4,
                    fill: false,
                    tension: 0.1
                },
                {
                    label: 'Meta Linear 2026',
                    data: metaLinearData,
                    borderColor: '#94a3b8', // Cinza
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true, position: 'bottom', labels: { color: '#cbd5e1', boxWidth: 12 } } },
            scales: {
                x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
                y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}
