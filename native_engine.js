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

window.processLocalFiles = function() {
    const fileEJs = document.getElementById('upload-farol').files[0];
    const fileAccum = document.getElementById('upload-tracking').files[0];
    const fileMon = document.getElementById('upload-mensal').files[0];

    if (!fileEJs || !fileAccum || !fileMon) {
        alert("Por favor, selecione as 3 planilhas do Portal BJ:\n1. EJs (Farol)\n2. Acumulado (Faturamento)\n3. Mensal (CSAT)");
        return;
    }

    document.getElementById('network-status').textContent = 'Processando planilhas...';
    document.getElementById('network-status').style.color = 'var(--brand-pink)';

    Promise.all([
        readFileAsCSV(fileEJs),
        readFileAsCSV(fileAccum),
        readFileAsCSV(fileMon)
    ]).then(([ejsCSV, accumCSV, monCSV]) => {
        Papa.parse(ejsCSV, { header: true, skipEmptyLines: true, complete: resEJs => {
            Papa.parse(accumCSV, { header: true, skipEmptyLines: true, complete: resAccum => {
                Papa.parse(monCSV, { header: true, skipEmptyLines: true, complete: resMon => {
                    const dados = buildStatisticalModel(resEJs.data, resAccum.data, resMon.data);
                    if (!dados || dados.length === 0) {
                        alert("Nenhuma EJ encontrada nas planilhas.");
                        return;
                    }
                    document.getElementById('network-status').textContent = '✓ Dados carregados';
                    document.getElementById('network-status').style.color = 'var(--status-sobe)';
                    setTimeout(() => {
                        document.getElementById('network-status').style.opacity = '0.5';
                    }, 2000);

                    // Inicializar toda a plataforma
                    window.allEJs = dados;
                    initPlatform(dados);
                }});
            }});
        }});
    }).catch(err => {
        console.error(err);
        alert("Erro ao processar planilhas: " + err.message);
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
    const colNomeEJ = findColIdx(keysEJs, ["NOME"]);
    const colSigla = findColIdx(keysEJs, ["SIGLA"]);
    const colCluster = findColIdx(keysEJs, ["CLUSTER"]);
    const colStatus = findColIdx(keysEJs, ["STATUS"]);
    const colFed = findColIdx(keysEJs, ["FEDERA"]);

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
        const fed = keysEJs[colFed] ? String(row[keysEJs[colFed]]).trim() : '';
        if (fed && fed.toUpperCase() !== 'JUNIORES') return;

        const nome = keysEJs[colNomeEJ] ? String(row[keysEJs[colNomeEJ]]).trim() : '';
        const sigla = keysEJs[colSigla] ? String(row[keysEJs[colSigla]]).trim() : '';
        if (!nome || nome.toUpperCase() === 'CONCENTRO' || nome.toUpperCase() === 'NAN') return;

        const statusStr = keysEJs[colStatus] ? String(row[keysEJs[colStatus]]).trim().toUpperCase() : '';
        if (statusStr.includes("DESFILIADA") || statusStr.includes("INATIVA")) return;

        let clusterStr = keysEJs[colCluster] ? String(row[keysEJs[colCluster]]).trim() : '0';
        let clusterNum = parseFloat(clusterStr.replace(/\D/g, '')) || 1;
        if (clusterNum < 1) clusterNum = 1;
        if (clusterNum > 5) clusterNum = 5;

        // Buscar dados acumulados
        let fatAlcancado = 0, fatMetaAno = 0, fcolab = 0;
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

        // Buscar dados mensais
        let csatAlcancado = 3.5, engAlcancado = 0, tempoAlcancado = 0, ecmAlcancado = 0;
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
    if (criterios.fatMinimo > 0 || criterios.csatMinimo > 0) {
        const fatMantPerc = criterios.fatMinimo > 0 ? Math.min(100, (metricas.fatProjetado / criterios.fatMinimo) * 100) : 100;
        const csatMantPerc = criterios.csatMinimo > 0 ? Math.min(100, (metricas.csat / criterios.csatMinimo) * 100) : 100;
        proxManter = Math.min(fatMantPerc, csatMantPerc);
        detalhes.proxManter = proxManter;
    }

    // ---- Determinar situação ----
    if (cluster === 5) {
        // Cluster 5: só pode manter ou cair
        if (proxManter >= 85) {
            situacao = 'PERMANECE';
            proximidade = proxManter;
        } else {
            situacao = 'CAI';
            proximidade = proxManter;
            trava = trava || 'Faturamento abaixo do mínimo para C5';
        }
    } else {
        // Clusters 1-4
        if (proxSubir >= 90) {
            situacao = 'SOBE';
            proximidade = proxSubir;
        } else if (proxManter < 70) {
            situacao = 'CAI';
            proximidade = proxManter;
            if (!trava) trava = 'Indicadores abaixo do mínimo para manter';
        } else {
            situacao = 'PERMANECE';
            proximidade = proxSubir; // mostrar quão perto de subir
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
