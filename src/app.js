// src/app.js

document.addEventListener("DOMContentLoaded", () => {
    // Referências DOM
    const sidebar = document.getElementById("sidebar");
    const closeSidebarBtn = document.getElementById("close-sidebar");

    // Fecha a sidebar
    closeSidebarBtn.addEventListener("click", () => {
        sidebar.classList.remove("sidebar-active");
    });

    // Carregar dados e inicializar o grafo
    fetch('db.json')
        .then(response => response.json())
        .then(data => {
            initNetworkGraph(data);
        })
        .catch(error => {
            console.error("Erro ao carregar os dados:", error);
            // Fallback: mostrar um erro na UI se db.json falhar
        });
});

function initNetworkGraph(dados) {
    const container = document.getElementById("network-canvas");

    // Arrays para o vis-network
    const nodesArray = [];
    const edgesArray = [];

    // Cores (Baseadas no Tailwind config)
    const colorEmerald = "#10b981";
    const colorRed = "#ef4444";
    const colorBlue = "#78BCE2";
    const colorWhite = "#FFFFFF";

    // 1. Criar os Nós (Nodes)
    dados.forEach(ej => {
        // Lógica de Cor
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

        nodesArray.push({
            id: ej.id,
            label: ej.nome,
            value: ej.faturamento.projetado || 1000, // Tamanho baseado no volume financeiro
            group: ej.cluster,
            color: nodeColor,
            font: { color: "#e2e8f0", face: "Inter" },
            shape: "dot",
            borderWidth: 2,
            shadow: true,
            // Guardamos os dados completos dentro do nó para o click
            rawEJData: ej 
        });
    });

    // 2. Criar as Arestas (Edges)
    // Conecta EJs do mesmo cluster fortemente para gerar os aglomerados
    for (let i = 0; i < dados.length; i++) {
        for (let j = i + 1; j < dados.length; j++) {
            if (dados[i].cluster === dados[j].cluster) {
                edgesArray.push({
                    from: dados[i].id,
                    to: dados[j].id,
                    // Arestas invisíveis ou sutis, servem apenas para a física
                    color: { color: "rgba(255, 255, 255, 0.1)" },
                    length: 100, // Comprimento ideal da mola
                    width: 1
                });
            }
        }
    }

    const nodes = new vis.DataSet(nodesArray);
    const edges = new vis.DataSet(edgesArray);

    const data = { nodes, edges };

    // 3. Configuração da Engine Física (Spring-Embedder)
    const options = {
        nodes: {
            scaling: {
                min: 10,
                max: 50,
                label: { enabled: true, min: 12, max: 20 }
            }
        },
        physics: {
            enabled: true,
            barnesHut: {
                gravitationalConstant: -2000,
                centralGravity: 0.1,
                springLength: 95,
                springConstant: 0.04,
                damping: 0.09,
                avoidOverlap: 0.1
            },
            stabilization: {
                iterations: 200 // Estabiliza rápido ao carregar
            }
        },
        interaction: {
            hover: true,
            tooltipDelay: 200,
            zoomView: true,
            dragView: true
        }
    };

    // 4. Instanciar o Grafo
    const network = new vis.Network(container, data, options);

    // 5. Evento de Clique no Nó
    network.on("click", function (params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            const selectedNode = nodes.get(nodeId);
            openTacticalProfile(selectedNode.rawEJData);
        } else {
            // Clicou fora, fecha a sidebar
            document.getElementById("sidebar").classList.remove("sidebar-active");
        }
    });
}

function openTacticalProfile(ej) {
    const sidebar = document.getElementById("sidebar");
    
    // Atualizar Header
    document.getElementById("ej-cluster").textContent = `CLUSTER ${ej.cluster}`;
    document.getElementById("ej-name").textContent = ej.nome;
    document.getElementById("ej-fundacao").textContent = ej.fundacao;

    // Atualizar Alertas
    const riskAlert = document.getElementById("risk-alert");
    if (ej.atRisk) {
        riskAlert.classList.remove("hidden");
    } else {
        riskAlert.classList.add("hidden");
    }

    // Calcular Percentuais de Progresso
    const fatPercent = ej.faturamento.meta > 0 ? (ej.faturamento.alcancado / ej.faturamento.metaAno) * 100 : 0;
    const projPercent = ej.projetos.meta > 0 ? (ej.projetos.alcancado / ej.projetos.meta) * 100 : 0;

    // Atualizar Faturamento
    document.getElementById("faturamento-percent").textContent = `${fatPercent.toFixed(1)}%`;
    document.getElementById("faturamento-alcancado").textContent = `R$ ${ej.faturamento.alcancado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById("faturamento-meta").textContent = `Meta: R$ ${ej.faturamento.metaAno.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    
    // Animar a barra com timeout para trigger da transição CSS
    setTimeout(() => {
        document.getElementById("faturamento-bar").style.width = `${Math.min(fatPercent, 100)}%`;
    }, 50);

    // Atualizar Projetos
    document.getElementById("projetos-percent").textContent = `${projPercent.toFixed(1)}%`;
    document.getElementById("projetos-alcancado").textContent = ej.projetos.alcancado;
    document.getElementById("projetos-meta").textContent = `Meta: ${ej.projetos.meta}`;
    
    setTimeout(() => {
        document.getElementById("projetos-bar").style.width = `${Math.min(projPercent, 100)}%`;
    }, 50);

    // Atualizar KPIs
    document.getElementById("kpi-csat").textContent = ej.csat.alcancado.toFixed(1);
    
    const kpiAc = document.getElementById("kpi-ac");
    if (ej.altoCrescimento) {
        kpiAc.textContent = "Sim";
        kpiAc.className = "text-lg font-bold text-status-emerald";
    } else {
        kpiAc.textContent = "Não";
        kpiAc.className = "text-lg font-bold text-slate-400";
    }

    // Atualizar Resumo Firecrawl
    document.getElementById("ej-summary").textContent = ej.summary;

    // Mostrar Sidebar
    sidebar.classList.add("sidebar-active");
}
