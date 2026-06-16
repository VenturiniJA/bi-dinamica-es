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
        // Validação da Federação
        // Para garantir que a base de teste (Brasil Junior inteira) seja renderizada, 
        // vamos permitir todas as EJs, pois o cliente usou a base nacional como teste.
        // O branding continua sendo JUNIORES ES.
        const fed = colFed !== -1 ? String(row[keysEJs[colFed]]).trim().toUpperCase() : '';

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
function calcularSituacaoEJ(cluster, metricas) {
    const criterios = CLUSTER_CRITERIOS[cluster];
    if (!criterios) return { situacao: 'PERMANECE', proximidade: 0, trava: 'Dados insuficientes', travas: [], categoriaAposta: 'risco', impactoSDE: 0, detalhes: {} };

    const PESOS = { 1: 0.30, 2: 0.25, 3: 0.15, 4: 0.15, 5: 0.15 };
    const peso = PESOS[cluster];

    const detalhes = {};
    let situacao = 'PERMANECE';
    let proximidade = 50;
    let trava = null;
    let travas = [];

    // ---- Proximidade para SUBIR ----
    let proxSubir = 100;
    if (cluster < 5 && criterios.fatSubir) {
        // Faturamento (peso 40%)
        const fatPerc = criterios.fatSubir > 0 ? Math.min(100, (metricas.fatProjetado / criterios.fatSubir) * 100) : 100;
        detalhes.fatPercSubir = fatPerc;
        detalhes.fatFalta = Math.max(0, criterios.fatSubir - metricas.fatProjetado);

        // CSAT (peso 30%)
        const csatPerc = criterios.csatSubir > 0 ? Math.min(100, (metricas.csat / criterios.csatSubir) * 100) : 100;
        detalhes.csatPercSubir = csatPerc;
        detalhes.csatFalta = Math.max(0, criterios.csatSubir - metricas.csat);

        // ECM (peso 20%)
        const ecmPerc = criterios.ecmSubir > 0 ? Math.min(100, (metricas.ecm / criterios.ecmSubir) * 100) : 100;
        detalhes.ecmPercSubir = ecmPerc;

        // Fcolab (peso 10%)
        const fcolabPerc = criterios.fcolabSubir > 0 ? Math.min(100, (metricas.fcolab / criterios.fcolabSubir) * 100) : 100;
        detalhes.fcolabPercSubir = fcolabPerc;

        // Proximidade ponderada para subir
        proxSubir = (fatPerc * 0.4) + (csatPerc * 0.3) + (ecmPerc * 0.2) + (fcolabPerc * 0.1);

        // Identificar travas (indicadores abaixo de 100%)
        const indicadores = [
            { nome: 'Faturamento', perc: fatPerc, falta: `Faltam ${moneyFmt(detalhes.fatFalta)}` },
            { nome: 'CSAT', perc: csatPerc, falta: `Falta ${detalhes.csatFalta.toFixed(1)} pontos` },
            { nome: 'ECM', perc: ecmPerc, falta: `Meta: ${criterios.ecmSubir}%` },
            { nome: 'Fat. Colaborativo', perc: fcolabPerc, falta: `Meta: ${criterios.fcolabSubir}%` }
        ];

        indicadores.sort((a, b) => a.perc - b.perc);
        travas = indicadores.filter(ind => ind.perc < 100);
        trava = travas.length > 0 ? travas[0].nome : null;
    }

    // ---- Proximidade para MANTER (risco de cair) ----
    let proxManter = 100;
    const fatMantPerc = criterios.fatMinimo > 0 ? Math.min(100, (metricas.fatProjetado / criterios.fatMinimo) * 100) : 100;
    const csatMantPerc = criterios.csatMinimo > 0 ? Math.min(100, (metricas.csat / criterios.csatMinimo) * 100) : 100;
    const ecmMantPerc = criterios.ecmMinimo > 0 ? Math.min(100, (metricas.ecm / criterios.ecmMinimo) * 100) : 100;
    const fcolabMantPerc = criterios.fcolabMinimo > 0 ? Math.min(100, (metricas.fcolab / criterios.fcolabMinimo) * 100) : 100;
    
    proxManter = Math.min(fatMantPerc, csatMantPerc, ecmMantPerc, fcolabMantPerc);
    detalhes.proxManter = proxManter;
    
    if (proxManter < 100 && !trava) {
        if (fatMantPerc < 100) trava = 'Faturamento Mínimo';
        else if (csatMantPerc < 100) trava = 'CSAT Mínimo';
        else if (ecmMantPerc < 100) trava = 'ECM Mínimo';
        else if (fcolabMantPerc < 100) trava = 'Fat. Colaborativo Mínimo';
    }

    // ---- Determinar situação ----
    if (cluster === 5) {
        // Cluster 5: só pode manter ou cair
        if (proxManter >= 100) {
            situacao = 'PERMANECE';
            proximidade = proxManter;
        } else {
            situacao = 'CAI';
            proximidade = proxManter;
            trava = trava || 'Indicadores abaixo do mínimo para C5';
        }
    } else {
        // Clusters 1-4
        if (travas.length === 0 && proxSubir >= 100) {
            situacao = 'SOBE';
            proximidade = 100;
        } else if (proxManter < 100) {
            situacao = 'CAI';
            proximidade = proxManter;
            if (!trava) trava = 'Abaixo do mínimo para manter';
        } else {
            situacao = 'PERMANECE';
            proximidade = proxSubir; // mostra quão perto de subir
        }
    }

    // ---- Classificar categoria de aposta ----
    let categoriaAposta = 'risco';
    if (situacao === 'SOBE') {
        categoriaAposta = 'alto'; // já vai subir
    } else if (situacao === 'PERMANECE' && proxSubir >= 70) {
        categoriaAposta = 'alto'; // perto de subir → alto retorno
    } else if (situacao === 'PERMANECE' && proxSubir >= 40) {
        categoriaAposta = 'potencial';
    } else if (situacao === 'CAI') {
        categoriaAposta = 'alerta'; // risco de queda
    } else {
        categoriaAposta = 'risco'; // permanece mas longe de subir
    }

    // Impacto potencial no SDE
    let impactoSDE = 0;
    if (situacao === 'SOBE') impactoSDE = peso;
    else if (situacao === 'CAI') impactoSDE = -peso;
    // Para "permanece", o impacto é o que PODERIA ganhar se fizesse subir
    else impactoSDE = peso; // potencial

    return {
        situacao,
        proximidade: Math.round(proximidade * 10) / 10,
        trava: trava || 'Nenhuma',
        travas,
        categoriaAposta,
        impactoSDE: Math.round(impactoSDE * 100) / 100,
        detalhes
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
