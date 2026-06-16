// ============================================
// NATIVE ENGINE v3.0 - Motor de Processamento
// Calculadora Analítica SDE | Rede Juniores ES
// ============================================

// Helper para encontrar colunas com fuzzy match
function findColIdx(headers, words) {
    return headers.findIndex(h => words.every(w => h.toUpperCase().includes(w.toUpperCase())));
}

// Helpers numéricos
function safeFloat(v) {
    if (v === null || v === undefined) return 0;
    let s = String(v).replace(/[^\d.,-]/g, '').replace(',', '.');
    return parseFloat(s) || 0;
}

function cleanMoney(v) {
    if (!v) return 0;
    let s = String(v).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(s) || 0;
}

function moneyFmt(v) {
    if (!v && v !== 0) return 'R$ 0';
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ============================================
// CRITÉRIOS DE CLUSTER (Sistema 4.0)
// ============================================
const CLUSTER_CRITERIOS = {
    1: {
        nome: 'Cluster 1',
        fatMinimo: 0,        // Qualquer faturamento
        csatMinimo: 0,
        ecmMinimo: 0,
        fcolabMinimo: 0,
        // Para SUBIR para C2:
        fatSubir: 50000,
        csatSubir: 3.5,
        ecmSubir: 50,
        fcolabSubir: 0,
    },
    2: {
        nome: 'Cluster 2',
        fatMinimo: 30000,
        csatMinimo: 3.0,
        ecmMinimo: 30,
        fcolabMinimo: 0,
        fatSubir: 120000,
        csatSubir: 3.8,
        ecmSubir: 60,
        fcolabSubir: 5,
    },
    3: {
        nome: 'Cluster 3',
        fatMinimo: 80000,
        csatMinimo: 3.5,
        ecmMinimo: 50,
        fcolabMinimo: 3,
        fatSubir: 250000,
        csatSubir: 4.0,
        ecmSubir: 70,
        fcolabSubir: 10,
    },
    4: {
        nome: 'Cluster 4',
        fatMinimo: 180000,
        csatMinimo: 3.8,
        ecmMinimo: 60,
        fcolabMinimo: 8,
        fatSubir: 500000,
        csatSubir: 4.2,
        ecmSubir: 80,
        fcolabSubir: 15,
    },
    5: {
        nome: 'Cluster 5',
        fatMinimo: 400000,
        csatMinimo: 4.0,
        ecmMinimo: 75,
        fcolabMinimo: 12,
        fatSubir: null, // Topo - não sobe
        csatSubir: null,
        ecmSubir: null,
        fcolabSubir: null,
    }
};

// ============================================
// PROCESSAMENTO DE PLANILHAS
// ============================================
function readFileAsCSV(file) {
    return new Promise((resolve, reject) => {
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
                    resolve(csv);
                } catch (err) { reject(err); }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        } else {
            file.text().then(resolve).catch(reject);
        }
    });
}

window.syncOnlineData = function() {
    const urlEJs = "https://docs.google.com/spreadsheets/d/1Ap1K4IPFBH6EW2lyW7vjEOnyoSWJ_sFB/export?format=csv";
    const urlAccum = "https://docs.google.com/spreadsheets/d/1TR14rF66nZY9TJtp-I7eeNOFN6E8om2c/export?format=csv";
    const urlMon = "https://docs.google.com/spreadsheets/d/1g6zr45fDFt5EPpdV3I7JeAniHlUTJJxc/export?format=csv";

    const statusEl = document.getElementById('network-status');
    if (statusEl) {
        statusEl.textContent = 'Processando planilhas online...';
        statusEl.style.color = 'var(--brand-pink)';
    }

    Promise.all([
        fetch(urlEJs).then(r => r.text()),
        fetch(urlAccum).then(r => r.text()),
        fetch(urlMon).then(r => r.text())
    ]).then(([ejsCSV, accumCSV, monCSV]) => {
        Papa.parse(ejsCSV, { header: true, skipEmptyLines: true, complete: resEJs => {
            Papa.parse(accumCSV, { header: true, skipEmptyLines: true, complete: resAccum => {
                Papa.parse(monCSV, { header: true, skipEmptyLines: true, complete: resMon => {
                    window.rawEJsData = resEJs.data;
                    window.rawAccumData = resAccum.data;
                    window.rawMonData = resMon.data;
                    const dados = buildStatisticalModel(resEJs.data, resAccum.data, resMon.data);
                    if (!dados || dados.length === 0) {
                        alert("Nenhuma EJ encontrada nas planilhas online.");
                        return;
                    }
                    if (statusEl) {
                        statusEl.textContent = '✓ Dados sincronizados';
                        statusEl.style.color = 'var(--status-sobe)';
                        setTimeout(() => { statusEl.style.opacity = '0.5'; }, 2000);
                    }
                    
                    const loadingOverlay = document.getElementById('global-loading');
                    if (loadingOverlay) {
                        loadingOverlay.style.opacity = '0';
                        setTimeout(() => loadingOverlay.style.display = 'none', 500);
                    }

                    // Inicializar toda a plataforma
                    window.allEJs = dados;
                    initPlatform(dados);
                }});
            }});
        }});
    }).catch(err => {
        console.error(err);
        if (statusEl) statusEl.textContent = 'Erro de sincronização';
        alert("Erro ao buscar as planilhas do Google Sheets: " + err.message);
    });
};

// ============================================
// MODELO ESTATÍSTICO PRINCIPAL
// ============================================
function buildStatisticalModel(ejsData, accumData, monData) {
    const ejs = [];
    const currentMonth = new Date().getMonth() + 1;
    const prorataRatio = currentMonth / 12.0;

    const keysEJs = Object.keys(ejsData[0] || {});
    // Busca colunas da planilha principal 2026
    const colNomeEJ = keysEJs.findIndex(k => k.includes('EMPRESA_JUNIOR') || k.includes('NOME'));
    const colSigla = keysEJs.findIndex(k => k.includes('SIGLA') || k.includes('EMPRESA'));
    const colCluster = keysEJs.findIndex(k => k.includes('CLUSTER_2026') || k.includes('CLUSTER'));
    const colStatus = keysEJs.findIndex(k => k.includes('E_FEDERADA') || k.includes('STATUS'));
    const colFed = keysEJs.findIndex(k => k.includes('FEDERACAO') || k.includes('FEDERA'));

    // Novas colunas (dados já na planilha principal em 2026)
    const colFatEJ = keysEJs.findIndex(k => k === 'FATURAMENTO');
    const colFatMetaEJ = keysEJs.findIndex(k => k === 'META_DE_REVENUE');
    const colCsatEJ = keysEJs.findIndex(k => k === 'CSAT');
    const colCsatMetaEJ = keysEJs.findIndex(k => k === 'META_DE_CSAT');
    const colEcmEJ = keysEJs.findIndex(k => k === 'PORCENTAGEM_DE_MEMBROS_ENGAJADOS_COM_MEJ');
    const colFcolabEJ = keysEJs.findIndex(k => k === 'TAXA_DE_COLABORACAO');
    const colEngEJ = keysEJs.findIndex(k => k === 'PORCENTAGEM_DE_MEMBROS_QUE_EXECUTARAM_CONTRATOS_NO_MES');

    const keysAccum = Object.keys(accumData[0] || {});
    const colAcNome = findColIdx(keysAccum, ["EJ"]);
    const colAcFat = findColIdx(keysAccum, ["FATURAMENTO", "ALCAN"]);
    const colAcMetaFat = findColIdx(keysAccum, ["META", "FATURAMENTO"]);
    const colAcFcolab = findColIdx(keysAccum, ["COLABORA"]);

    const keysMon = Object.keys(monData[0] || {});
    const colMoNome = findColIdx(keysMon, ["EJ"]);
    const colMoCsat = findColIdx(keysMon, ["CSAT"]);
    const colMoEng = findColIdx(keysMon, ["ENGAJAMENTO"]);
    const colMoTempo = findColIdx(keysMon, ["TEMPO"]);
    const colMoEcm = findColIdx(keysMon, ["ECM"]);

    ejsData.forEach((row, i) => {
        // Validação da Federação - Foco estrito na JUNIORES ES
        const fed = colFed !== -1 ? String(row[keysEJs[colFed]]).trim().toUpperCase() : '';
        if (colFed !== -1 && !fed.includes('JUNIORES') && !fed.includes('ES') && fed !== '') {
            return; // Bloqueia tudo que não for do Espírito Santo/Juniores
        }

        const nome = colNomeEJ !== -1 ? String(row[keysEJs[colNomeEJ]]).trim() : '';
        const sigla = colSigla !== -1 ? String(row[keysEJs[colSigla]]).trim() : nome;
        if (!nome || nome.toUpperCase() === 'NAN') return;

        const statusStr = colStatus !== -1 ? String(row[keysEJs[colStatus]]).trim().toUpperCase() : 'SIM';
        if (statusStr.includes("DESFILIADA") || statusStr.includes("INATIVA") || statusStr === 'NÃO' || statusStr === 'NAO') return;

        let clusterStr = colCluster !== -1 ? String(row[keysEJs[colCluster]]).trim() : '0';
        let clusterNum = parseFloat(clusterStr.replace(/\D/g, '')) || 1;
        if (clusterNum < 1) clusterNum = 1;
        if (clusterNum > 5) clusterNum = 5;

        // Puxar primeiro da planilha principal (Tracking 2026 é unificado)
        let fatAlcancado = colFatEJ !== -1 ? cleanMoney(row[keysEJs[colFatEJ]]) : 0;
        let fatMetaAno = colFatMetaEJ !== -1 ? cleanMoney(row[keysEJs[colFatMetaEJ]]) : 0;
        let fcolab = colFcolabEJ !== -1 ? safeFloat(row[keysEJs[colFcolabEJ]]) : 0;
        let csatAlcancado = colCsatEJ !== -1 ? safeFloat(row[keysEJs[colCsatEJ]]) : 3.5;
        let csatMetaAno = colCsatMetaEJ !== -1 ? safeFloat(row[keysEJs[colCsatMetaEJ]]) : 0;
        let ecmAlcancado = colEcmEJ !== -1 ? safeFloat(row[keysEJs[colEcmEJ]]) : 0;
        let engAlcancado = colEngEJ !== -1 ? safeFloat(row[keysEJs[colEngEJ]]) : 0;
        let tempoAlcancado = 0;

        // Sobrescrever se existir nas planilhas secundárias (para compatibilidade legada)
        if (colAcNome !== -1) {
            const accumRow = accumData.find(r => {
                const ejN = String(r[keysAccum[colAcNome]]).toUpperCase();
                return ejN === nome.toUpperCase() || ejN === sigla.toUpperCase();
            });
            if (accumRow) {
                if (colAcFat !== -1) fatAlcancado = cleanMoney(accumRow[keysAccum[colAcFat]]);
                if (colAcMetaFat !== -1) fatMetaAno = cleanMoney(accumRow[keysAccum[colAcMetaFat]]);
                if (colAcFcolab !== -1) fcolab = safeFloat(accumRow[keysAccum[colAcFcolab]]);
            }
        }

        if (colMoNome !== -1) {
            const monRow = monData.find(r => {
                const ejN = String(r[keysMon[colMoNome]]).toUpperCase();
                return ejN === nome.toUpperCase() || ejN === sigla.toUpperCase();
            });
            if (monRow) {
                if (colMoCsat !== -1) csatAlcancado = safeFloat(monRow[keysMon[colMoCsat]]);
                if (colMoEng !== -1) engAlcancado = safeFloat(monRow[keysMon[colMoEng]]);
                if (colMoTempo !== -1) tempoAlcancado = safeFloat(monRow[keysMon[colMoTempo]]);
                if (colMoEcm !== -1) ecmAlcancado = safeFloat(monRow[keysMon[colMoEcm]]);
            }
        }

        if (csatAlcancado === 0) csatAlcancado = 3.5;
        if (csatAlcancado > 5) csatAlcancado = (csatAlcancado / 100) * 5;

        // Projeção pro-rata
        let fatProjetado = prorataRatio > 0 ? fatAlcancado / prorataRatio : fatAlcancado;

        // Calcular situação e proximidade
        const analise = calcularSituacaoEJ(clusterNum, {
            faturamento: fatAlcancado,
            fatProjetado: fatProjetado,
            fatMeta: fatMetaAno,
            csat: csatAlcancado,
            ecm: ecmAlcancado,
            fcolab: fcolab,
            engajamento: engAlcancado
        });

        ejs.push({
            id: `ej_${i}`,
            nome: sigla || nome,
            nomeCompleto: nome,
            cluster: clusterNum,
            faturamento: { metaAno: fatMetaAno, alcancado: fatAlcancado, projetado: fatProjetado },
            csat: { meta: CLUSTER_CRITERIOS[clusterNum]?.csatSubir || 3.5, alcancado: csatAlcancado },
            ecm: { alcancado: ecmAlcancado },
            fcolab: fcolab,
            engajamento: { meta: 75, alcancado: engAlcancado },
            tempo: { meta: 50, alcancado: tempoAlcancado },
            situacao: analise.situacao,
            situacaoOriginal: analise.situacao,
            proximidade: analise.proximidade,
            trava: analise.trava,
            travas: analise.travas,
            categoriaAposta: analise.categoriaAposta,
            impactoSDE: analise.impactoSDE,
            detalhes: analise.detalhes
        });
    });

    return ejs;
}

// ============================================
// CALCULAR SITUAÇÃO E PROXIMIDADE DE UMA EJ
// ============================================
function calcularSituacaoEJ(clusterAtual, metricas) {
    let fat = metricas.fatProjetado || metricas.faturamento || 0;
    let fatColab = metricas.fcolab || 0; // Faturamento colaborativo (R$)
    let csat = metricas.csat || 0;
    let engajamento = metricas.engajamento || 0;
    let seloEJ = metricas.seloEJ !== false; // Assumimos true por padrão se não for explícito
    let impacto = metricas.impacto === true;

    // Fórmula: Faturamento x CSAT x (1 + Eng. MEJ (%)) x (1 + % Fat. Colab.) x 100 = Índice do Cluster
    let percColab = fat > 0 ? (fatColab / fat) : 0;
    let indiceCalculado = fat * csat * (1 + (engajamento / 100)) * (1 + percColab) * 100;

    // Regras da Régua de Cluster
    function getClusterMeta(indice) {
        if (indice <= 12000000) return 1;
        if (indice <= 24000000) return 2;
        if (indice <= 61000000) return 3;
        if (indice <= 130000000) return 4;
        return 5;
    }

    let novoCluster = getClusterMeta(indiceCalculado);

    // Restrições aplicadas:
    // 1. Para subir de cluster, deve estar em conformidade com o Selo EJ.
    if (!seloEJ && novoCluster > clusterAtual) novoCluster = clusterAtual;
    // 2. Sem faturamento = rebaixada pro Cluster 1.
    if (fat <= 0) novoCluster = 1;
    // 3. Só pode subir 1 cluster por vez.
    if (novoCluster > clusterAtual + 1) novoCluster = clusterAtual + 1;
    // 4. Cluster 5 exige Projeto de Impacto.
    if (novoCluster === 5 && !impacto && clusterAtual < 5) novoCluster = 4;

    // Determinar Situação
    let situacao = 'PERMANECE';
    if (novoCluster > clusterAtual) situacao = 'SOBE';
    else if (novoCluster < clusterAtual) situacao = 'CAI';

    // Proximidade do próximo cluster
    let pontosProximoCluster = 0;
    if (clusterAtual === 1) pontosProximoCluster = 12000000.01;
    else if (clusterAtual === 2) pontosProximoCluster = 24000000.01;
    else if (clusterAtual === 3) pontosProximoCluster = 61000000.01;
    else if (clusterAtual === 4) pontosProximoCluster = 130000000.01;

    let proximidade = 100;
    let pontosFaltantes = 0;
    if (clusterAtual < 5 && indiceCalculado < pontosProximoCluster) {
        proximidade = (indiceCalculado / pontosProximoCluster) * 100;
        pontosFaltantes = pontosProximoCluster - indiceCalculado;
    }

    let trava = 'Nenhuma';
    if (situacao !== 'SOBE') {
        if (fat <= 0) trava = 'Sem Faturamento';
        else if (novoCluster > clusterAtual && !seloEJ) trava = 'Falta Selo EJ';
        else if (novoCluster === 5 && !impacto) trava = 'Falta Projeto Impacto';
        else if (indiceCalculado < pontosProximoCluster) trava = 'Pontos Insuficientes';
    }

    let impactoSDE = 0;
    const PESOS = { 1: 0.30, 2: 0.25, 3: 0.15, 4: 0.15, 5: 0.15 };
    const peso = PESOS[clusterAtual] || 0.15;
    
    if (situacao === 'SOBE') impactoSDE = peso;
    if (situacao === 'CAI') impactoSDE = -peso;

    let catAposta = proximidade >= 70 && situacao !== 'SOBE' ? 'alto' : (situacao === 'CAI' ? 'risco' : 'potencial');

    return {
        situacao: situacao,
        proximidade: Math.min(100, Math.max(0, proximidade)),
        trava: trava,
        travas: [trava],
        impactoSDE: impactoSDE,
        categoriaAposta: catAposta,
        indiceCalculado: indiceCalculado,
        pontosFaltantes: pontosFaltantes,
        pontosProximoCluster: pontosProximoCluster,
        detalhes: 'Índice de Cluster: ' + moneyFmt(indiceCalculado) + ' (Faltam ' + moneyFmt(pontosFaltantes) + ' pontos)'
    };
}

// ============================================
// MOTOR DE PREDIÇÃO ESTRATÉGICA (10 CENÁRIOS)
// ============================================
function gerarEstrategiasEvolucao(ej) {
    const cenarios = [];
    const cr = CLUSTER_CRITERIOS[ej.cluster];
    
    if (ej.cluster === 5) {
        return [{ titulo: "Manutenção de Topo", desc: "A EJ já está no cluster máximo. O foco é manter indicadores altos.", esforco: "Baixo", viabilidade: "Alta" }];
    }
    
    const fatAtual = ej.faturamento.alcancado || 0;
    const fatMetaCluster = cr.fatSubir || 0;
    const gapFat = Math.max(0, fatMetaCluster - fatAtual);
    
    const csatAtual = ej.csat.alcancado || 0;
    const csatMeta = cr.csatSubir || 0;
    const gapCsat = Math.max(0, csatMeta - csatAtual);

    const ecmAtual = ej.ecm.alcancado || 0;
    const ecmMeta = cr.ecmSubir || 0;
    const gapEcm = Math.max(0, ecmMeta - ecmAtual);

    // Se já atingiu tudo, gera estratégias para o próximo cluster do próximo
    if (gapFat === 0 && gapCsat === 0 && gapEcm === 0) {
        cenarios.push({ titulo: "Subida Garantida", desc: "A EJ já atingiu as metas matemáticas para subir de cluster.", esforco: "Baixo", viabilidade: "Garantido" });
        return cenarios;
    }

    // Estimar Ticket Médio base do histórico (simplificado: se não tem, chuta um padrão do cluster)
    let ticketBase = 1500;
    if (ej.cluster === 2) ticketBase = 2500;
    if (ej.cluster === 3) ticketBase = 4000;
    if (ej.cluster === 4) ticketBase = 8000;
    
    // Calcular quantos projetos no ticket base
    const projetosFaltantesBase = Math.ceil(gapFat / ticketBase);

    // Estratégia 1: Volume Bruto (Mesmo Ticket)
    if (gapFat > 0) {
        cenarios.push({
            titulo: `Volume Bruto (Ticket Padrão)`,
            desc: `Vender mais ${projetosFaltantesBase} projeto(s) com o ticket médio histórico de ${moneyFmt(ticketBase)}.`,
            esforco: "Médio", viabilidade: "Alta"
        });
        
        // Estratégia 2: Ticket Aumentado (+20%)
        let ticketAumentado = ticketBase * 1.2;
        let projAumentado = Math.ceil(gapFat / ticketAumentado);
        cenarios.push({
            titulo: `Aumento de Ticket (+20%)`,
            desc: `Subir o ticket para ${moneyFmt(ticketAumentado)} e fechar ${projAumentado} projeto(s). Foco em clientes B2B.`,
            esforco: "Médio", viabilidade: "Média"
        });

        // Estratégia 3: High-Ticket (Um super projeto)
        cenarios.push({
            titulo: `Projeto High-Ticket`,
            desc: `Fechar 1 único projeto grande no valor de ${moneyFmt(gapFat)} focado em alta complexidade.`,
            esforco: "Alto", viabilidade: "Baixa"
        });

        // Estratégia 4: Combo Promocional (Ticket Baixo, Alto Volume)
        let ticketPromocional = ticketBase * 0.6;
        let projPromo = Math.ceil(gapFat / ticketPromocional);
        cenarios.push({
            titulo: `Campanha de Volume (Ticket -40%)`,
            desc: `Fazer uma campanha focada em produtos de entrada: vender ${projPromo} projeto(s) a ${moneyFmt(ticketPromocional)}.`,
            esforco: "Alto", viabilidade: "Alta"
        });
        
        // Estratégia 5: Upsell na base de clientes
        let projUpsell = Math.ceil(projetosFaltantesBase * 0.5);
        cenarios.push({
            titulo: `Upsell em Clientes Ativos`,
            desc: `Vender serviços adicionais para clientes recentes. Meta: ${projUpsell} upsells de ${moneyFmt(ticketBase)}.`,
            esforco: "Baixo", viabilidade: "Média"
        });
    } else {
        cenarios.push({ titulo: "Faturamento Atingido", desc: "A meta de faturamento já foi batida.", esforco: "Nenhum", viabilidade: "Alta" });
    }

    // Estratégias de Faturamento Colaborativo
    if (cr.fcolabSubir > 0) {
        let fatColabNeces = fatMetaCluster * (cr.fcolabSubir / 100);
        cenarios.push({
            titulo: `Foco em Colaborativo`,
            desc: `Priorizar Faturamento Colab: Realizar projetos em parceria somando ${moneyFmt(fatColabNeces)}.`,
            esforco: "Médio", viabilidade: "Média"
        });
    }

    // Estratégias de CSAT e Qualidade
    if (gapCsat > 0) {
        cenarios.push({
            titulo: `Recuperação de CSAT (NPS)`,
            desc: `Falta ${gapCsat.toFixed(1)} no CSAT. Aplicar ouvidoria emergencial nos últimos 3 clientes detratores e rodar novo NPS.`,
            esforco: "Alto", viabilidade: "Média"
        });
        cenarios.push({
            titulo: `Qualidade Extrema (CSAT 5.0)`,
            desc: `Garantir CSAT 5.0 nos próximos 2 projetos entregues para compensar o gap atual. Instituir checkpoints semanais com o cliente.`,
            esforco: "Médio", viabilidade: "Alta"
        });
    }

    // Estratégias de ECM
    if (gapEcm > 0) {
        cenarios.push({
            titulo: `Mutirão de ECM`,
            desc: `Falta ${gapEcm.toFixed(1)}% de ECM. Alocar membros ociosos em projetos internos rápidos documentados no Portal BJ.`,
            esforco: "Baixo", viabilidade: "Alta"
        });
        cenarios.push({
            titulo: `Programa de Trainees (ECM)`,
            desc: `Aprovar novos trainees diretamente em projetos ágeis (sombra) para inflar a taxa de ECM nos próximos meses.`,
            esforco: "Médio", viabilidade: "Alta"
        });
    }

    // Complementar até dar 10 estratégias
    if (cenarios.length < 10) {
        cenarios.push({
            titulo: `Renegociação de Inadimplentes`,
            desc: `Cobrar ativamente faturas em atraso ou renegociar contratos paralisados para injetar caixa rápido.`,
            esforco: "Baixo", viabilidade: "Média"
        });
    }
    if (cenarios.length < 10) {
        cenarios.push({
            titulo: `Parcerias Institucionais`,
            desc: `Buscar parcerias com professores e coordenadores para projetos subsidiados ou indicações diretas.`,
            esforco: "Médio", viabilidade: "Alta"
        });
    }

    return cenarios.slice(0, 10);
}
