// native_engine.js - Substitui o processamento local legado pelas 3 planilhas do Portal BJ

// Helper para encontrar colunas com fuzzy match
function findColIdx(headers, words) {
    return headers.findIndex(h => words.every(w => h.toUpperCase().includes(w.toUpperCase())));
}

window.processLocalFiles = function() {
    const fileEJs = document.getElementById('upload-farol').files[0]; // ejs.xlsx
    const fileAccum = document.getElementById('upload-tracking').files[0]; // monitoring_acumulated.xlsx
    const fileMon = document.getElementById('upload-mensal').files[0]; // monitoring.xlsx
    
    if (!fileEJs || !fileAccum || !fileMon) {
        alert("Por favor, selecione as 3 planilhas do Portal BJ: ejs, monitoring_acumulated, monitoring.");
        return;
    }
    
    document.getElementById('network-status').style.display = 'block';
    document.getElementById('network-status').textContent = 'Processando 3 Planilhas...';

    Promise.all([
        readFileAsCSV(fileEJs),
        readFileAsCSV(fileAccum),
        readFileAsCSV(fileMon)
    ]).then(([ejsCSV, accumCSV, monCSV]) => {
        Papa.parse(ejsCSV, { header: true, skipEmptyLines: true, complete: resEJs => {
            Papa.parse(accumCSV, { header: true, skipEmptyLines: true, complete: resAccum => {
                Papa.parse(monCSV, { header: true, skipEmptyLines: true, complete: resMon => {
                    allEJs = buildStatisticalModel(resEJs.data, resAccum.data, resMon.data);
                    if (!allEJs || allEJs.length === 0) {
                        alert("Nenhuma EJ encontrada nas planilhas.");
                        return;
                    }
                    document.getElementById('network-status').style.display = 'none';
                    initGlobalKPIs(allEJs);
                    initLeftPanel(allEJs);
                    renderKanban(allEJs);
                    setupEvents();
                }});
            }});
        }});
    }).catch(err => {
        console.error(err);
        alert("Erro ao ler planilhas locais.");
    });
};

function buildStatisticalModel(ejsData, accumData, monData) {
    const ejs = [];
    
    const currentMonth = new Date().getMonth() + 1; // 1 a 12
    const prorataRatio = currentMonth / 12.0;

    const colNomeEJ = findColIdx(Object.keys(ejsData[0] || {}), ["NOME"]);
    const colSigla = findColIdx(Object.keys(ejsData[0] || {}), ["SIGLA"]);
    const colCluster = findColIdx(Object.keys(ejsData[0] || {}), ["CLUSTER"]);
    const colStatus = findColIdx(Object.keys(ejsData[0] || {}), ["STATUS"]);
    const colFed = findColIdx(Object.keys(ejsData[0] || {}), ["FEDERA"]);
    const keysEJs = Object.keys(ejsData[0] || {});

    const keysAccum = Object.keys(accumData[0] || {});
    const colAcNome = findColIdx(keysAccum, ["EJ"]);
    const colAcFat = findColIdx(keysAccum, ["FATURAMENTO", "ALCAN"]);
    const colAcMetaFat = findColIdx(keysAccum, ["META", "FATURAMENTO"]);
    
    const keysMon = Object.keys(monData[0] || {});
    const colMoNome = findColIdx(keysMon, ["EJ"]);
    const colMoCsat = findColIdx(keysMon, ["CSAT"]);
    const colMoEng = findColIdx(keysMon, ["ENGAJAMENTO"]);
    const colMoTempo = findColIdx(keysMon, ["TEMPO"]); 

    ejsData.forEach((row, i) => {
        const fed = keysEJs[colFed] ? String(row[keysEJs[colFed]]).trim() : '';
        if (fed && fed.toUpperCase() !== 'JUNIORES') return; 
        
        const nome = keysEJs[colNomeEJ] ? String(row[keysEJs[colNomeEJ]]).trim() : '';
        const sigla = keysEJs[colSigla] ? String(row[keysEJs[colSigla]]).trim() : '';
        if (!nome || nome.toUpperCase() === 'CONCENTRO' || nome.toUpperCase() === 'NAN') return;
        
        const statusStr = keysEJs[colStatus] ? String(row[keysEJs[colStatus]]).trim().toUpperCase() : '';
        if (statusStr.includes("DESFILIADA") || statusStr.includes("INATIVA")) return;

        let clusterStr = keysEJs[colCluster] ? String(row[keysEJs[colCluster]]).trim() : '0';
        let clusterNum = parseFloat(clusterStr.replace(/\\D/g, '')) || 0;

        let fatAlcancado = 0;
        let fatMetaAno = 0;
        if (colAcNome !== -1) {
            const accumRow = accumData.find(r => {
                const ejN = String(r[keysAccum[colAcNome]]).toUpperCase();
                return ejN === nome.toUpperCase() || ejN === sigla.toUpperCase();
            });
            if (accumRow) {
                if (colAcFat !== -1) fatAlcancado = cleanMoney(accumRow[keysAccum[colAcFat]]);
                if (colAcMetaFat !== -1) fatMetaAno = cleanMoney(accumRow[keysAccum[colAcMetaFat]]);
            }
        }

        let csatAlcancado = 3.5;
        let engAlcancado = 0;
        let tempoAlcancado = 0;
        if (colMoNome !== -1) {
            const monRow = monData.find(r => {
                const ejN = String(r[keysMon[colMoNome]]).toUpperCase();
                return ejN === nome.toUpperCase() || ejN === sigla.toUpperCase();
            });
            if (monRow) {
                if (colMoCsat !== -1) csatAlcancado = safeFloat(monRow[keysMon[colMoCsat]]);
                if (colMoEng !== -1) engAlcancado = safeFloat(monRow[keysMon[colMoEng]]);
                if (colMoTempo !== -1) tempoAlcancado = safeFloat(monRow[keysMon[colMoTempo]]);
            }
        }
        
        if (csatAlcancado === 0) csatAlcancado = 3.5;

        let fatProjetado = 0;
        if (prorataRatio > 0) fatProjetado = fatAlcancado / prorataRatio;

        let previsaoObj = { situacao: 'PERMANECE', indexAtual: 0, indexPrevisto: 0 };
        
        if (clusterNum === 5) {
            if (fatProjetado >= fatMetaAno) {
                previsaoObj.situacao = 'PERMANECE';
                previsaoObj.indexPrevisto = 1.0;
            } else if (fatProjetado < (fatMetaAno * 0.7)) {
                previsaoObj.situacao = 'CAI';
                previsaoObj.indexPrevisto = 0.5;
            }
        } else {
            if (fatMetaAno > 0) {
                const ratio = fatProjetado / fatMetaAno;
                previsaoObj.indexPrevisto = ratio;
                if (ratio >= 1.0 && csatAlcancado >= 3.5) previsaoObj.situacao = 'SOBE';
                else if (ratio < 0.7) previsaoObj.situacao = 'CAI';
            } else {
                if (csatAlcancado >= 4.0 && engAlcancado >= 70) previsaoObj.situacao = 'SOBE';
                else if (csatAlcancado < 3.5) previsaoObj.situacao = 'CAI';
            }
        }

        let farolStr = 'VERMELHO';
        if (previsaoObj.situacao === 'SOBE') farolStr = 'VERDE';
        if (previsaoObj.situacao === 'PERMANECE') farolStr = 'AMARELO';
        if (clusterNum === 5 && previsaoObj.situacao === 'PERMANECE') farolStr = 'VERDE';

        ejs.push({
            id: `ej_${i}`,
            nome: sigla || nome,
            farol: farolStr,
            cluster: clusterNum,
            faturamento: { metaAno: fatMetaAno, alcancado: fatAlcancado },
            csat: { meta: 3.5, alcancado: csatAlcancado },
            engajamento: { meta: 75, alcancado: engAlcancado },
            tempo: { meta: 50, alcancado: tempoAlcancado },
            previsao: previsaoObj
        });
    });

    return ejs;
}

// Override initGlobalKPIs
window.initGlobalKPIs = function(dados) {
    let totalRevenue = 0;
    let countVerde = 0, countAmarelo = 0, countVermelho = 0, countZerada = 0;
    
    const PESOS_CLUSTER = { 1: 3.0, 2: 2.5, 3: 1.5, 4: 1.5, 5: 1.5 };

    let saldoEvolucao = 0;
    let sobe = 0, cai = 0, perm = 0;
    let somaCsat = 0, somaEng = 0, somaTempo = 0;

    dados.forEach(ej => {
        totalRevenue += ej.faturamento.alcancado || 0;

        let farol = String(ej.farol).trim().toUpperCase();
        if(farol === 'VERDE' || farol === 'EXCELENTE') countVerde++;
        else if(farol === 'AMARELO' || farol === 'ATENÇÃO') countAmarelo++;
        else if(farol === 'VERMELHO' || farol === 'ALERTA') countVermelho++;
        else countZerada++;
        
        let peso = PESOS_CLUSTER[ej.cluster] || 0.2;

        if (ej.previsao) {
            if (ej.previsao.situacao === 'SOBE') { saldoEvolucao += peso; sobe++; }
            else if (ej.previsao.situacao === 'CAI') { saldoEvolucao -= peso; cai++; }
            else { perm++; }
        }
        somaCsat += ej.csat.alcancado || 0;
        somaEng += ej.engajamento.alcancado || 0;
        somaTempo += ej.tempo.alcancado || 0;
    });

    let saldoEvolucaoFinal = parseFloat(saldoEvolucao.toFixed(1));

    document.getElementById('global-revenue').textContent = moneyFmt(totalRevenue);
    document.getElementById('global-ac').textContent = saldoEvolucaoFinal > 0 ? `+${saldoEvolucaoFinal}` : `${saldoEvolucaoFinal}`;
    
    let saldoEl = document.getElementById('global-ac');
    if(saldoEvolucaoFinal > 0) saldoEl.className = 'text-2xl font-bold text-emerald-500';
    else if(saldoEvolucaoFinal < 0) saldoEl.className = 'text-2xl font-bold text-red-500';
    else saldoEl.className = 'text-2xl font-bold text-slate-900';

    const totalEjs = dados.length || 1;
    document.getElementById('stat-total-ejs').textContent = dados.length;
    document.getElementById('stat-avg-csat').textContent = (somaCsat / totalEjs).toFixed(2);
    document.getElementById('stat-avg-eng').textContent = (somaEng / totalEjs).toFixed(1) + '%';
    document.getElementById('stat-avg-tempo').textContent = (somaTempo / totalEjs).toFixed(0) + ' d';
    
    document.getElementById('stat-saldo-final').textContent = saldoEvolucaoFinal > 0 ? `+${saldoEvolucaoFinal}` : `${saldoEvolucaoFinal}`;
    document.getElementById('stat-saldo-sobe').textContent = sobe;
    document.getElementById('stat-saldo-cai').textContent = cai;
    document.getElementById('stat-saldo-perm').textContent = perm;

    document.getElementById('count-verde').textContent = countVerde;
    document.getElementById('count-amarelo').textContent = countAmarelo;
    document.getElementById('count-vermelho').textContent = countVermelho;
};

// Override do gerarInsights
window.gerarInsights = function(ejData) {
    const currentMonth = new Date().getMonth() + 1;
    const prorataRatio = currentMonth / 12.0;
    const insights = [];
    
    // Se ejData não foi passado, tenta usar variável global 'ej' ou pega do DOM
    const dataObj = ejData || (typeof ej !== 'undefined' ? ej : null);
    if (!dataObj) return "";

    let metaProporcional = dataObj.faturamento.metaAno * prorataRatio;
    
    if (dataObj.faturamento.alcancado >= metaProporcional) {
        insights.push(`<span class='text-green-600'>✅ <b>Faturamento:</b> Está batendo a meta proporcional até o mês atual (${moneyFmt(dataObj.faturamento.alcancado)} / ${moneyFmt(metaProporcional)}).</span>`);
    } else {
        insights.push(`<span class='text-red-600'>⚠️ <b>Faturamento:</b> Abaixo da meta mensal (Resta ${moneyFmt(metaProporcional - dataObj.faturamento.alcancado)} para regularizar).</span>`);
    }

    if (dataObj.csat.alcancado < dataObj.csat.meta) {
        insights.push(`<span class='text-orange-500'>⚠️ <b>CSAT:</b> A avaliação dos clientes (${dataObj.csat.alcancado}) está abaixo do mínimo exigido (${dataObj.csat.meta}). Necessário investigar detratores.</span>`);
    } else {
        insights.push(`<span class='text-green-600'>✅ <b>CSAT:</b> Excelente! Nível de satisfação saudável e dentro da meta.</span>`);
    }
    
    if (dataObj.previsao && dataObj.previsao.situacao === 'CAI') {
        insights.push(`<span class='text-red-600 font-bold'>🔥 ALERTA CRÍTICO: Ritmo atual aponta QUEDA de cluster no fim do ano.</span>`);
    } else if (dataObj.previsao && dataObj.previsao.situacao === 'SOBE') {
        insights.push(`<span class='text-emerald-600 font-bold'>🚀 Ritmo de crescimento consistente apontando para salto de Cluster.</span>`);
    } else {
        if(dataObj.cluster === 5) {
             insights.push(`<span class='text-emerald-600 font-bold'>🚀 Mantendo a estabilidade exigida no Cluster 5.</span>`);
        } else {
             insights.push(`<span class='text-slate-600 font-bold'>📊 EJ no ritmo exato para permanecer no mesmo cluster.</span>`);
        }
    }

    return insights.join(" <br><br> ");
};
