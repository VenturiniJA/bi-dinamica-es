// src/app.js

document.addEventListener("DOMContentLoaded", () => {
    // Carregar dados e inicializar o dashboard
    fetch('db.json')
        .then(response => response.json())
        .then(data => {
            if (!data || data.length === 0) {
                console.error("Nenhum dado encontrado no db.json");
                return;
            }
            // 1. Atualiza KPIs Globais
            initGlobalKPIs(data);
            
            // 2. Cria os gráficos do lado esquerdo (Chart.js)
            initCharts(data);
            
            // 3. Renderiza o Grafo
            initNetworkGraph(data);
        })
        .catch(error => {
            console.error("Erro ao carregar os dados:", error);
            document.getElementById('network-status').textContent = 'Falha ao carregar db.json';
        });
});

function initGlobalKPIs(dados) {
    let totalRevenue = 0;
    let totalCSAT = 0;
    let csatCount = 0;
    let acCount = 0;

    dados.forEach(ej => {
        totalRevenue += ej.faturamento.projetado || 0;
        if (ej.csat && ej.csat.alcancado > 0) {
            totalCSAT += ej.csat.alcancado;
            csatCount++;
        }
        if (ej.altoCrescimento) {
            acCount++;
        }
    });

    const avgCSAT = csatCount > 0 ? (totalCSAT / csatCount).toFixed(1) : "0.0";
    
    document.getElementById("global-revenue").textContent = `R$ ${totalRevenue.toLocaleString('pt-BR', {maximumFractionDigits: 0})}`;
    document.getElementById("global-csat").textContent = avgCSAT;
    document.getElementById("global-ac").textContent = `${acCount} / ${dados.length}`;
}

function initCharts(dados) {
    // Definir as cores usando as configurações do tailwind
    const colorBlue = '#78BCE2';
    const colorPink = '#F080A8';

    // Chart.js requires array of labels and array of data
    // Ordenar por Faturamento
    const sortedByRevenue = [...dados].sort((a, b) => (b.faturamento.alcancado || 0) - (a.faturamento.alcancado || 0)).slice(0, 10);
    const revenueLabels = sortedByRevenue.map(d => d.nome.substring(0, 15));
    const revenueData = sortedByRevenue.map(d => d.faturamento.alcancado || 0);

    const ctxRev = document.getElementById('revenueChart').getContext('2d');
    new Chart(ctxRev, {
        type: 'bar',
        data: {
            labels: revenueLabels,
            datasets: [{
                label: 'Faturamento Atual',
                data: revenueData,
                backgroundColor: colorBlue,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
                y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });

    // Ordenar por Projetos
    const sortedByProj = [...dados].sort((a, b) => (b.projetos.alcancado || 0) - (a.projetos.alcancado || 0)).slice(0, 10);
    const projLabels = sortedByProj.map(d => d.nome.substring(0, 15));
    const projData = sortedByProj.map(d => d.projetos.alcancado || 0);

    const ctxProj = document.getElementById('projectsChart').getContext('2d');
    new Chart(ctxProj, {
        type: 'bar',
        data: {
            labels: projLabels,
            datasets: [{
                label: 'Projetos Realizados',
                data: projData,
                backgroundColor: colorPink,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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

    const colorEmerald = "#10b981";
    const colorRed = "#ef4444";
    const colorBlue = "#78BCE2";
    const colorWhite = "#FFFFFF";

    // 1. Criar os Nós (Nodes) com tamanhos visíveis e logarítmicos
    dados.forEach(ej => {
        let nodeColor = {
            background: colorBlue,
            border: colorWhite,
            highlight: { background: colorBlue, border: colorWhite }
        };

        if (ej.altoCrescimento) {
            nodeColor.background = colorEmerald;
            nodeColor.highlight.background = colorEmerald;
        } else if (ej.atRisk) {
            nodeColor.background = colorRed;
            nodeColor.highlight.background = colorRed;
        }

        // Tamanho base logarítmico para não estourar na tela
        const fatValue = ej.faturamento.projetado || 1000;
        const nodeSize = Math.max(10, Math.min(30, Math.log10(fatValue) * 4));

        nodesArray.push({
            id: ej.id,
            label: ej.nome, // NOME AGORA APARECE SEMPRE
            value: nodeSize, 
            group: ej.cluster,
            color: nodeColor,
            font: { color: "#e2e8f0", face: "Inter", size: 14, strokeWidth: 3, strokeColor: "#0b1121" },
            shape: "dot",
            borderWidth: 2,
            shadow: true,
            rawEJData: ej 
        });
    });

    // 2. Criar as Arestas (Edges)
    for (let i = 0; i < dados.length; i++) {
        for (let j = i + 1; j < dados.length; j++) {
            if (dados[i].cluster === dados[j].cluster && dados[i].cluster !== 0) {
                edgesArray.push({
                    from: dados[i].id,
                    to: dados[j].id,
                    color: { color: "rgba(255, 255, 255, 0.15)" },
                    length: 150, 
                    width: 1
                });
            }
        }
    }

    const nodes = new vis.DataSet(nodesArray);
    const edges = new vis.DataSet(edgesArray);
    const data = { nodes, edges };

    // 3. Configuração
    const options = {
        nodes: {
            scaling: {
                customScalingFunction: function (min, max, total, value) { return value / max; },
                min: 10,
                max: 30,
                label: { enabled: true, min: 14, max: 20 }
            }
        },
        edges: {
            smooth: { type: "continuous" }
        },
        physics: {
            enabled: true, // Habilitado apenas para o carregamento inicial
            barnesHut: {
                gravitationalConstant: -3000,
                centralGravity: 0.3,
                springLength: 150,
                springConstant: 0.04,
                damping: 0.09,
                avoidOverlap: 0.5
            },
            stabilization: {
                enabled: true,
                iterations: 500, // Maior iteração para arrumar bem antes de mostrar
                updateInterval: 50
            }
        },
        interaction: {
            hover: true,
            tooltipDelay: 200,
            zoomView: true,
            dragView: true
        }
    };

    const network = new vis.Network(container, data, options);

    // 4. Congelar a Física quando estiver pronto
    network.on("stabilizationProgress", function (params) {
        document.getElementById('network-status').textContent = `Agrupando clusters... ${Math.round((params.iterations/params.total)*100)}%`;
    });

    network.on("stabilizationIterationsDone", function () {
        document.getElementById('network-status').textContent = 'Rede Estática Ativa';
        setTimeout(() => {
            document.getElementById('network-status').style.opacity = '0';
        }, 3000);
        // DESLIGA A FÍSICA PARA O GRAFO FICAR ESTÁTICO!
        network.setOptions( { physics: false } );
    });

    // 5. Clique no Nó -> Mostrar Perfil
    network.on("click", function (params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            const selectedNode = nodes.get(nodeId);
            openTacticalProfile(selectedNode.rawEJData);
        } else {
            // Se clicar no vazio
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
    
    document.getElementById("ej-cluster").textContent = `CLUSTER ${ej.cluster}`;
    document.getElementById("ej-name").textContent = ej.nome;
    document.getElementById("ej-fundacao").textContent = ej.fundacao;

    const riskAlert = document.getElementById("risk-alert");
    if (ej.atRisk) {
        riskAlert.classList.remove("hidden");
    } else {
        riskAlert.classList.add("hidden");
    }

    const fatPercent = ej.faturamento.meta > 0 ? (ej.faturamento.alcancado / ej.faturamento.metaAno) * 100 : 0;
    const projPercent = ej.projetos.meta > 0 ? (ej.projetos.alcancado / ej.projetos.meta) * 100 : 0;

    document.getElementById("faturamento-percent").textContent = `${fatPercent.toFixed(1)}%`;
    document.getElementById("faturamento-alcancado").textContent = `R$ ${ej.faturamento.alcancado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById("faturamento-meta").textContent = `Meta: R$ ${ej.faturamento.metaAno.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    
    document.getElementById("faturamento-bar").style.width = `0%`;
    setTimeout(() => { document.getElementById("faturamento-bar").style.width = `${Math.min(fatPercent, 100)}%`; }, 50);

    document.getElementById("projetos-percent").textContent = `${projPercent.toFixed(1)}%`;
    document.getElementById("projetos-alcancado").textContent = ej.projetos.alcancado;
    document.getElementById("projetos-meta").textContent = `Meta: ${ej.projetos.meta}`;
    
    document.getElementById("projetos-bar").style.width = `0%`;
    setTimeout(() => { document.getElementById("projetos-bar").style.width = `${Math.min(projPercent, 100)}%`; }, 50);

    document.getElementById("kpi-csat").textContent = ej.csat.alcancado.toFixed(1);
    
    const kpiAc = document.getElementById("kpi-ac");
    if (ej.altoCrescimento) {
        kpiAc.textContent = "Sim";
        kpiAc.className = "text-lg font-bold text-status-emerald";
    } else {
        kpiAc.textContent = "Não";
        kpiAc.className = "text-lg font-bold text-slate-400";
    }

    document.getElementById("ej-summary").textContent = ej.summary;
}
