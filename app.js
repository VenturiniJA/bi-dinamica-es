// ============================================
// APP.JS - Motor Principal da Calculadora SDE
// Rede Juniores ES | Ciclo 2026
// ============================================

window.allEJs = [];
var currentView = 'dashboard';
var simulatedEJs = [];
var currentApostaFilter = 'all';

var PESOS_CLUSTER = { 1: 0.30, 2: 0.25, 3: 0.15, 4: 0.15, 5: 0.15 };
var CLUSTER_COLORS = {
    1: { color: '#F26487', bg: 'rgba(242,100,135,0.12)', name: 'C1' },
    2: { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', name: 'C2' },
    3: { color: '#6BB0D1', bg: 'rgba(107,176,209,0.12)', name: 'C3' },
    4: { color: '#22d3ee', bg: 'rgba(34,211,238,0.12)', name: 'C4' },
    5: { color: '#34d399', bg: 'rgba(52,211,153,0.12)', name: 'C5' }
};

function calcularSDE(ejs) {
    var sde = 0;
    var breakdown = {};
    for (var c = 1; c <= 5; c++) {
        var sobe = ejs.filter(function(e) { return e.cluster === c && e.situacao === 'SOBE'; }).length;
        var cai = ejs.filter(function(e) { return e.cluster === c && e.situacao === 'CAI'; }).length;
        var perm = ejs.filter(function(e) { return e.cluster === c && e.situacao === 'PERMANECE'; }).length;
        var contrib = PESOS_CLUSTER[c] * (sobe - cai);
        sde += contrib;
        breakdown[c] = { sobe: sobe, cai: cai, perm: perm, total: sobe + cai + perm, contrib: Math.round(contrib * 100) / 100 };
    }
    return { sde: Math.round(sde * 100) / 100, breakdown: breakdown };
}

function switchView(view) {
    currentView = view;
    var tabs = document.querySelectorAll('.nav-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    document.querySelector('.nav-tab[data-view="' + view + '"]').classList.add('active');
    var panels = document.querySelectorAll('.view-panel');
    for (var j = 0; j < panels.length; j++) panels[j].classList.remove('active');
    document.getElementById('view-' + view).classList.add('active');
}

function initPlatform(dados) {
    window.allEJs = dados;
    simulatedEJs = JSON.parse(JSON.stringify(dados));
    updateHeaderKPIs(dados);
    renderSidebar(dados);
    renderDashboard(dados);
    renderSimulator(dados);
    renderApostas(dados);
    document.getElementById('sidebar-search').addEventListener('input', function() {
        renderSidebar(dados, this.value);
    });
    var totalAlto = dados.filter(function(e) { return e.categoriaAposta === 'alto'; }).length;
    var badgeSimEl = document.getElementById('tab-badge-sim');
    if (badgeSimEl) badgeSimEl.textContent = dados.length;
    var badgeApostasEl = document.getElementById('tab-badge-apostas');
    if (badgeApostasEl) badgeApostasEl.textContent = totalAlto;
    
    // Render raw datasets if available
    renderRawDataTables();
}

function renderRawDataTables() {
    function createTable(dataArray, containerId) {
        if (!dataArray || dataArray.length === 0) return;
        var headers = Object.keys(dataArray[0]);
        var html = '<table class="data-table"><thead><tr>';
        headers.forEach(h => html += '<th>' + h + '</th>');
        html += '</tr></thead><tbody>';
        dataArray.forEach(row => {
            html += '<tr>';
            headers.forEach(h => html += '<td>' + (row[h] || '') + '</td>');
            html += '</tr>';
        });
        html += '</tbody></table>';
        var container = document.getElementById(containerId);
        if (container) container.innerHTML = html;
    }

    if (window.rawEJsData) createTable(window.rawEJsData, 'table-container-ejs');
    if (window.rawAccumData) createTable(window.rawAccumData, 'table-container-accum');
    if (window.rawMonData) createTable(window.rawMonData, 'table-container-mon');
}

function updateHeaderKPIs(dados) {
    var result = calcularSDE(dados);
    var sde = result.sde;
    var totalFat = 0, sobe = 0, cai = 0, perm = 0;
    dados.forEach(function(ej) {
        totalFat += ej.faturamento.alcancado || 0;
        if (ej.situacao === 'SOBE') sobe++;
        else if (ej.situacao === 'CAI') cai++;
        else perm++;
    });
    var sdeEl = document.getElementById('header-sde');
    if (sdeEl) {
        sdeEl.textContent = sde >= 0 ? '+' + sde.toFixed(2) : sde.toFixed(2);
        sdeEl.className = 'kpi-value ' + (sde > 0 ? 'positive' : sde < 0 ? 'negative' : 'neutral');
    }
    
    var totalEjsEl = document.getElementById('header-total-ejs');
    if (totalEjsEl) totalEjsEl.textContent = dados.length;
    
    var fatEl = document.getElementById('header-faturamento');
    if (fatEl) fatEl.textContent = moneyFmt(totalFat);
    
    var sobeEl = document.getElementById('header-sobe');
    if (sobeEl) sobeEl.textContent = sobe;
    
    var caiEl = document.getElementById('header-cai');
    if (caiEl) caiEl.textContent = cai;
    
    var permEl = document.getElementById('header-perm');
    if (permEl) permEl.textContent = perm;
}

function renderSidebar(dados, searchTerm) {
    var container = document.getElementById('sidebar-list');
    var filtered = searchTerm ? dados.filter(function(e) { return e.nome.toLowerCase().includes(searchTerm.toLowerCase()); }) : dados;
    var countEl = document.getElementById('sidebar-count');
    if (countEl) countEl.textContent = filtered.length;
    var html = '';
    for (var c = 1; c <= 5; c++) {
        var clusterEjs = filtered.filter(function(e) { return e.cluster === c; });
        if (clusterEjs.length === 0) continue;
        var cc = CLUSTER_COLORS[c];
        html += '<div class="cluster-group"><div class="cluster-group-header">';
        html += '<span class="cluster-group-label" style="color:' + cc.color + ';">' + cc.name + ' - Peso ' + PESOS_CLUSTER[c] + '</span>';
        html += '<span class="cluster-group-count">' + clusterEjs.length + '</span></div>';
        clusterEjs.forEach(function(ej) {
            var dotClass = ej.situacao === 'SOBE' ? 'sobe' : ej.situacao === 'CAI' ? 'cai' : 'permanece';
            html += '<div class="ej-mini-card" onclick="highlightEJ(\'' + ej.id + '\')">';
            html += '<div class="ej-status-dot ' + dotClass + '"></div>';
            html += '<span class="ej-name">' + ej.nome + '</span>';
            html += '<span style="font-size:0.65rem;font-weight:700;color:' + cc.color + ';">' + Math.round(ej.proximidade) + '%</span></div>';
        });
        html += '</div>';
    }
    if (container) container.innerHTML = html || '<div class="empty-state"><p style="font-size:0.78rem;">Nenhuma EJ</p></div>';
}

function highlightEJ(id) {
    var row = document.querySelector('[data-ej-id="' + id + '"]');
    if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.style.background = 'rgba(59,130,246,0.15)';
        setTimeout(function() { row.style.background = ''; }, 2000);
    }
    openPredictionModal(id);
}

function openPredictionModal(id) {
    var ej = window.allEJs.find(e => e.id === id);
    if (!ej) return;

    document.getElementById('predicao-modal-title').textContent = 'Calculadora de Cluster - ' + ej.nome;
    document.getElementById('predicao-modal-subtitle').textContent = 'Simule e entenda os indicadores para evolução';
    
    // Extraindo dados para a calculadora
    var fat = ej.faturamento ? ej.faturamento.projetado || ej.faturamento.alcancado || 0 : 0;
    var fatColab = ej.fcolab || 0;
    var csat = ej.csat ? ej.csat.alcancado || 0 : 0;
    var engajamento = ej.engajamento ? ej.engajamento.alcancado || 0 : 0;
    
    var percColab = fat > 0 ? (fatColab / fat) : 0;
    var engPerc = engajamento / 100;
    var indiceCalculado = fat * csat * (1 + engPerc) * (1 + percColab) * 100;
    
    var html = `
    <div style="display:flex;gap:24px;margin-top:16px;flex-wrap:wrap;">
        
        <!-- Lado Esquerdo: Inputs da Calculadora -->
        <div style="flex:1;min-width:300px;display:flex;flex-direction:column;gap:12px;">
            <h3 style="font-size:0.9rem;color:var(--text-accent);margin-bottom:8px;">Informações</h3>
            
            <div>
                <label style="font-size:0.75rem;color:var(--text-muted);font-weight:600;">Cluster atual</label>
                <div style="background:rgba(255,255,255,0.05);padding:8px;border-radius:4px;font-weight:700;">${ej.cluster}</div>
            </div>
            
            <div>
                <label style="font-size:0.75rem;color:var(--text-muted);font-weight:600;">Faturamento Projetado/Alcançado (R$)</label>
                <div style="background:rgba(255,255,255,0.05);padding:8px;border-radius:4px;font-weight:700;color:var(--status-sobe);">${moneyFmt(fat)}</div>
            </div>
            
            <div>
                <label style="font-size:0.75rem;color:var(--text-muted);font-weight:600;">Faturamento Colaborativo (R$)</label>
                <div style="background:rgba(255,255,255,0.05);padding:8px;border-radius:4px;font-weight:700;">${moneyFmt(fatColab)}</div>
            </div>
            
            <div>
                <label style="font-size:0.75rem;color:var(--text-muted);font-weight:600;">CSAT</label>
                <div style="background:rgba(255,255,255,0.05);padding:8px;border-radius:4px;font-weight:700;">${csat.toFixed(2)}</div>
            </div>
            
            <div>
                <label style="font-size:0.75rem;color:var(--text-muted);font-weight:600;">Engajamento com o MEJ (%)</label>
                <div style="background:rgba(255,255,255,0.05);padding:8px;border-radius:4px;font-weight:700;">${engajamento.toFixed(2)}%</div>
            </div>
            
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
                <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--text-primary);">
                    <input type="checkbox" checked disabled> Está de acordo com Selo EJ
                </label>
                <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--text-primary);">
                    <input type="checkbox" checked disabled> Atingiu o indicador de Projeto de Impacto
                </label>
            </div>
        </div>
        
        <!-- Lado Direito: Resultados -->
        <div style="flex:1;min-width:300px;display:flex;flex-direction:column;gap:16px;">
            
            <!-- Card Azul Portal BJ -->
            <div style="background:var(--brand-blue);border-radius:var(--radius-lg);padding:32px;text-align:center;color:#fff;">
                <p style="font-size:0.85rem;font-weight:600;margin-bottom:8px;opacity:0.9;">O Cluster da EJ é:</p>
                <div style="font-size:4rem;font-weight:900;line-height:1;margin-bottom:4px;">${ej.situacao === 'SOBE' ? ej.cluster+1 : ej.situacao === 'CAI' ? Math.max(1, ej.cluster-1) : ej.cluster}</div>
                <div style="font-size:1.1rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:32px;">
                    ${['INCUBADA', 'INCUBADA', 'OPERAÇÃO', 'TRAÇÃO', 'TRAÇÃO', 'ALTO CRESCIMENTO'][ej.situacao === 'SOBE' ? ej.cluster+1 : ej.situacao === 'CAI' ? Math.max(1, ej.cluster-1) : ej.cluster] || 'CLUSTER'}
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;background:rgba(0,0,0,0.15);border-radius:8px;padding:16px;">
                    <div>
                        <div style="font-size:0.7rem;opacity:0.8;font-weight:600;margin-bottom:4px;">CSAT</div>
                        <div style="font-size:1.1rem;font-weight:800;">${csat.toFixed(2)}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;opacity:0.8;font-weight:600;margin-bottom:4px;">Engajamento MEJ (%)</div>
                        <div style="font-size:1.1rem;font-weight:800;">${engajamento.toFixed(2)}%</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;opacity:0.8;font-weight:600;margin-bottom:4px;">% Faturamento Colab.</div>
                        <div style="font-size:1.1rem;font-weight:800;">${(percColab*100).toFixed(2)}%</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;opacity:0.8;font-weight:600;margin-bottom:4px;color:var(--brand-pink);">Índice Calculado</div>
                        <div style="font-size:1.1rem;font-weight:800;">${moneyFmt(indiceCalculado).replace('R$ ','')}</div>
                    </div>
                </div>
            </div>
            
        </div>
    </div>
    
    <!-- Detalhamento do Cálculo -->
    <div style="margin-top:24px;border-top:1px solid var(--border-medium);padding-top:24px;">
        <h3 style="font-size:1rem;color:var(--text-accent);margin-bottom:16px;">Detalhamento do Cálculo</h3>
        
        <div style="display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:16px;background:rgba(255,255,255,0.03);padding:24px;border-radius:var(--radius-md);">
            <div style="text-align:center;">
                <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">Faturamento</div>
                <div style="font-weight:700;">${moneyFmt(fat)}</div>
            </div>
            <div style="color:var(--brand-blue);font-weight:800;">×</div>
            <div style="text-align:center;">
                <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">CSAT</div>
                <div style="font-weight:700;">${csat.toFixed(2)}</div>
            </div>
            <div style="color:var(--brand-blue);font-weight:800;">×</div>
            <div style="text-align:center;">
                <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">1 + Eng. MEJ (%)</div>
                <div style="font-weight:700;">${(1+engPerc).toFixed(2)}</div>
            </div>
            <div style="color:var(--brand-blue);font-weight:800;">×</div>
            <div style="text-align:center;">
                <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">1 + % Fat. Colab.</div>
                <div style="font-weight:700;">${(1+percColab).toFixed(2)}</div>
            </div>
            <div style="color:var(--brand-blue);font-weight:800;">×</div>
            <div style="text-align:center;">
                <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">Constante</div>
                <div style="font-weight:700;">100</div>
            </div>
            <div style="color:var(--brand-blue);font-weight:800;">=</div>
            <div style="text-align:center;background:var(--brand-blue);padding:8px 16px;border-radius:4px;color:#fff;">
                <div style="font-size:0.7rem;opacity:0.9;margin-bottom:2px;">Índice do Cluster</div>
                <div style="font-weight:800;font-size:1.1rem;">${moneyFmt(indiceCalculado).replace('R$ ','')}</div>
            </div>
        </div>
    </div>
    
    <!-- Diagnóstico e Evolução -->
    <div style="margin-top:24px;border-top:1px solid var(--border-medium);padding-top:24px;display:flex;gap:24px;">
        <div style="flex:1;">
            <h3 style="font-size:0.9rem;color:var(--text-accent);margin-bottom:12px;">Diagnóstico e Próximo Passo</h3>
            <div style="padding:16px;background:rgba(255,255,255,0.03);border-radius:8px;border-left:4px solid ${ej.situacao === 'SOBE' ? 'var(--status-sobe)' : ej.situacao === 'CAI' ? 'var(--status-cai)' : 'var(--brand-blue)'}">
                <p style="font-weight:700;color:var(--text-primary);margin-bottom:8px;">Situação: <span class="badge badge-${ej.situacao.toLowerCase()}">${ej.situacao}</span></p>
                <p style="font-size:0.85rem;color:var(--text-muted);line-height:1.5;">${ej.detalhes}</p>
                ${ej.trava !== 'Nenhuma' ? `<p style="font-size:0.85rem;color:var(--status-cai);line-height:1.5;margin-top:8px;font-weight:600;">Trava Crítica: ${ej.trava}</p>` : ''}
            </div>
        </div>
    </div>
    
    <!-- Estratégias Funcionais -->
    <div style="margin-top:24px;border-top:1px solid var(--border-medium);padding-top:24px;">
        <h3 style="font-size:1rem;color:var(--text-accent);margin-bottom:16px;">Plano Estratégico de Evolução</h3>
        <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:16px;">Ações recomendadas para alavancar os indicadores e garantir o alcance do próximo cluster.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;">
    `;
    
    var estrategias = gerarEstrategiasEvolucao(ej);
    estrategias.forEach((est, idx) => {
        var effColor = est.esforco === 'Baixo' ? 'var(--status-sobe)' : est.esforco === 'Médio' ? 'var(--brand-blue)' : 'var(--status-cai)';
        html += '<div class="glass-card" style="position:relative;overflow:hidden;border-top:3px solid ' + effColor + ';">';
        html += '<div style="position:absolute;top:-10px;right:-10px;font-size:3rem;opacity:0.05;font-weight:900;">' + (idx+1) + '</div>';
        html += '<h3 style="font-size:0.9rem;font-weight:700;color:var(--text-primary);margin-bottom:8px;">' + est.titulo + '</h3>';
        html += '<p style="font-size:0.75rem;color:var(--text-secondary);line-height:1.4;margin-bottom:12px;">' + est.desc + '</p>';
        html += '<div style="display:flex;justify-content:space-between;font-size:0.65rem;font-weight:600;">';
        html += '<span style="color:' + effColor + ';">Esforço: ' + est.esforco + '</span>';
        html += '<span style="color:var(--text-muted);">Viabilidade: ' + est.viabilidade + '</span>';
        html += '</div></div>';
    });
    
    html += `
        </div>
    </div>
    `;
    
    document.getElementById('predicao-modal-content').innerHTML = html;
    document.getElementById('predicao-modal').style.display = 'flex';
}

function renderDashboard(dados) {
    var result = calcularSDE(dados);
    var sde = result.sde;
    var breakdown = result.breakdown;
    var sdeValEl = document.getElementById('dash-sde-value');
    if (sdeValEl) {
        sdeValEl.textContent = sde >= 0 ? '+' + sde.toFixed(2) : sde.toFixed(2);
        sdeValEl.style.color = sde > 0 ? 'var(--status-sobe)' : sde < 0 ? 'var(--status-cai)' : 'var(--text-primary)';
    }
    var statusEl = document.getElementById('dash-sde-status');
    if (statusEl) {
        if (sde > 0) { statusEl.className = 'badge badge-sobe'; statusEl.textContent = 'POSITIVO'; }
        else if (sde < 0) { statusEl.className = 'badge badge-cai'; statusEl.textContent = 'NEGATIVO'; }
        else { statusEl.className = 'badge badge-permanece'; statusEl.textContent = 'NEUTRO'; }
    }

    var bHTML = '';
    for (var c = 1; c <= 5; c++) {
        var b = breakdown[c] || { sobe:0, cai:0, perm:0, total:0, contrib:0 };
        var cc = CLUSTER_COLORS[c];
        if (!cc) continue;
        var sw = b.total > 0 ? (b.sobe/b.total)*100 : 0;
        var cw = b.total > 0 ? (b.cai/b.total)*100 : 0;
        bHTML += '<div class="cluster-row"><span class="cluster-badge c'+c+'">'+cc.name+'</span>';
        bHTML += '<div style="display:flex;flex-direction:column;gap:4px;"><div style="display:flex;gap:2px;height:8px;border-radius:4px;overflow:hidden;background:rgba(148,163,184,0.08);">';
        bHTML += '<div style="width:'+sw+'%;background:var(--status-sobe);border-radius:4px;"></div>';
        bHTML += '<div style="width:'+cw+'%;background:var(--status-cai);border-radius:4px;"></div></div></div>';
        bHTML += '<span style="font-size:0.72rem;font-weight:700;color:var(--status-sobe);text-align:center;">+'+b.sobe+'</span>';
        bHTML += '<span style="font-size:0.72rem;font-weight:700;color:var(--status-cai);text-align:center;">-'+b.cai+'</span>';
        bHTML += '<span style="font-size:0.82rem;font-weight:800;text-align:center;color:'+(b.contrib>=0?'var(--status-sobe)':'var(--status-cai)')+';">'+(b.contrib>=0?'+':'')+b.contrib.toFixed(2)+'</span></div>';
    }
    var breakdownContainer = document.getElementById('dash-cluster-breakdown');
    if (breakdownContainer) breakdownContainer.innerHTML = bHTML;

    var kHTML = '';
    for (var c2 = 1; c2 <= 5; c2++) {
        var b2 = breakdown[c2] || { sobe:0, cai:0, perm:0, total:0, contrib:0 };
        var cc2 = CLUSTER_COLORS[c2];
        if (!cc2) continue;
        kHTML += '<div class="glass-card animate-slide-up delay-'+c2+'" style="border-left:3px solid '+cc2.color+';">';
        kHTML += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        kHTML += '<span class="cluster-badge c'+c2+'">'+cc2.name+'</span>';
        kHTML += '<span style="font-size:0.65rem;font-weight:700;color:var(--text-muted);background:'+cc2.bg+';padding:2px 8px;border-radius:var(--radius-full);">Peso '+(PESOS_CLUSTER[c2]*100)+'%</span></div>';
        kHTML += '<div style="font-family:var(--font-heading);font-size:1.5rem;font-weight:800;color:'+(b2.contrib>=0?'var(--status-sobe)':'var(--status-cai)')+';margin-bottom:4px;">'+(b2.contrib>=0?'+':'')+b2.contrib.toFixed(2)+'</div>';
        kHTML += '<div style="display:flex;gap:12px;font-size:0.7rem;color:var(--text-muted);"><span>'+b2.total+' EJs</span><span style="color:var(--status-sobe);">+'+b2.sobe+'</span><span style="color:var(--status-cai);">-'+b2.cai+'</span></div></div>';
    }
    var kpiCardsEl = document.getElementById('dash-kpi-cards');
    if (kpiCardsEl) kpiCardsEl.innerHTML = kHTML;
    renderDashboardTable();
}
function renderDashboardTable() {
    var filterClusterEl = document.getElementById('dash-filter-cluster');
    var filterSitEl = document.getElementById('dash-filter-situacao');
    var filterCluster = filterClusterEl ? filterClusterEl.value : 'all';
    var filterSit = filterSitEl ? filterSitEl.value : 'all';
    
    var filtered = window.allEJs.slice();
    if (filterCluster !== 'all') filtered = filtered.filter(function(e) { return e.cluster === parseInt(filterCluster); });
    if (filterSit !== 'all') filtered = filtered.filter(function(e) { return e.situacao === filterSit; });
    filtered.sort(function(a, b) {
        var ord = { 'CAI': 0, 'PERMANECE': 1, 'SOBE': 2 };
        if (ord[a.situacao] !== ord[b.situacao]) return ord[a.situacao] - ord[b.situacao];
        return b.proximidade - a.proximidade;
    });
    var html = '';
    filtered.forEach(function(ej) {
        var cc = CLUSTER_COLORS[ej.cluster];
        if (!cc) cc = { name: 'C' + ej.cluster, color: '#ccc' };
        var sitClass = ej.situacao === 'SOBE' ? 'badge-sobe' : ej.situacao === 'CAI' ? 'badge-cai' : 'badge-permanece';
        var sitIcon = ej.situacao === 'SOBE' ? '+' : ej.situacao === 'CAI' ? '-' : '=';
        var proxColor = ej.proximidade >= 70 ? 'var(--status-sobe)' : ej.proximidade >= 40 ? 'var(--brand-blue)' : 'var(--status-cai)';
        html += '<tr data-ej-id="' + ej.id + '" style="cursor:pointer;" onclick="openPredictionModal(\'' + ej.id + '\')">';
        html += '<td style="font-weight:600;">' + ej.nome + '</td>';
        html += '<td style="text-align:center;"><span class="cluster-badge c' + ej.cluster + '">' + cc.name + '</span></td>';
        html += '<td style="text-align:right;font-weight:600;">' + moneyFmt(ej.faturamento ? ej.faturamento.alcancado : 0) + '</td>';
        html += '<td style="text-align:center;font-weight:600;">' + (ej.csat && ej.csat.alcancado ? ej.csat.alcancado.toFixed(1) : '0.0') + '</td>';
        html += '<td style="text-align:center;"><div style="display:flex;align-items:center;gap:6px;justify-content:center;">';
        html += '<div class="progress-bar-bg" style="width:60px;"><div class="progress-bar-fill" style="width:' + Math.min(100, ej.proximidade) + '%;background:' + proxColor + ';"></div></div>';
        html += '<span style="font-size:0.72rem;font-weight:700;color:' + proxColor + ';">' + Math.round(ej.proximidade) + '%</span></div></td>';
        html += '<td style="text-align:center;"><span class="badge ' + sitClass + '">' + sitIcon + ' ' + ej.situacao + '</span></td>';
        html += '<td style="text-align:center;">';
        if (ej.trava !== 'Nenhuma') { html += '<span class="trava-tag">Trava: ' + ej.trava + '</span>'; }
        else { html += '<span style="font-size:0.72rem;color:var(--text-muted);">-</span>'; }
        html += '</td></tr>';
    });
    var tbodyEl = document.getElementById('dash-table-body');
    if (tbodyEl) tbodyEl.innerHTML = html || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">Nenhuma EJ encontrada</td></tr>';
}

function renderSimulator(dados) {
    simulatedEJs = JSON.parse(JSON.stringify(dados));
    updateSimSDE();
    renderSimTable();
    runSolver();
}

function updateSimSDE() {
    var original = calcularSDE(window.allEJs);
    var simulado = calcularSDE(simulatedEJs);
    var delta = Math.round((simulado.sde - original.sde) * 100) / 100;
    var origEl = document.getElementById('sim-sde-original');
    origEl.textContent = original.sde >= 0 ? '+' + original.sde.toFixed(2) : original.sde.toFixed(2);
    origEl.className = 'kpi-value ' + (original.sde > 0 ? 'positive' : original.sde < 0 ? 'negative' : 'neutral');
    var simEl = document.getElementById('sim-sde-simulado');
    simEl.textContent = simulado.sde >= 0 ? '+' + simulado.sde.toFixed(2) : simulado.sde.toFixed(2);
    simEl.className = 'kpi-value ' + (simulado.sde > 0 ? 'positive' : simulado.sde < 0 ? 'negative' : 'neutral');
    var deltaEl = document.getElementById('sim-sde-delta');
    deltaEl.textContent = delta >= 0 ? '+' + delta.toFixed(2) : delta.toFixed(2);
    deltaEl.className = 'sim-delta ' + (delta > 0 ? 'positive' : delta < 0 ? 'negative' : '');
}

function renderSimTable() {
    var sorted = simulatedEJs.slice().sort(function(a, b) { return a.cluster - b.cluster || a.nome.localeCompare(b.nome); });
    var html = '';
    sorted.forEach(function(ej, idx) {
        var cc = CLUSTER_COLORS[ej.cluster];
        var peso = PESOS_CLUSTER[ej.cluster];
        var original = window.allEJs.find(function(e) { return e.id === ej.id; });
        var origSit = original ? original.situacao : ej.situacaoOriginal;
        var changed = ej.situacao !== origSit;
        var impacto = 0;
        if (changed) {
            if (ej.situacao === 'SOBE' && origSit !== 'SOBE') impacto = peso;
            if (ej.situacao === 'CAI' && origSit !== 'CAI') impacto = -peso;
            if (origSit === 'SOBE' && ej.situacao !== 'SOBE') impacto = -peso;
            if (origSit === 'CAI' && ej.situacao !== 'CAI') impacto = peso;
        }
        var origBadge = origSit === 'SOBE' ? 'badge-sobe' : origSit === 'CAI' ? 'badge-cai' : 'badge-permanece';
        var origIcon = origSit === 'SOBE' ? '+' : origSit === 'CAI' ? '-' : '=';
        html += '<tr data-ej-id="' + ej.id + '" style="' + (changed ? 'background:rgba(59,130,246,0.06);' : '') + '">';
        html += '<td style="font-weight:600;">' + ej.nome + '</td>';
        html += '<td style="text-align:center;"><span class="cluster-badge c' + ej.cluster + '">' + cc.name + '</span></td>';
        html += '<td style="text-align:center;font-weight:700;color:' + cc.color + ';">' + peso.toFixed(2) + '</td>';
        html += '<td style="text-align:center;"><span class="badge ' + origBadge + '">' + origIcon + ' ' + origSit + '</span></td>';
        html += '<td style="text-align:center;"><select class="sim-select" data-sim-id="' + ej.id + '" onchange="onSimChange(this)">';
        html += '<option value="SOBE"' + (ej.situacao === 'SOBE' ? ' selected' : '') + '>SOBE</option>';
        html += '<option value="PERMANECE"' + (ej.situacao === 'PERMANECE' ? ' selected' : '') + '>PERMANECE</option>';
        html += '<option value="CAI"' + (ej.situacao === 'CAI' ? ' selected' : '') + '>CAI</option></select></td>';
        html += '<td style="text-align:center;font-weight:700;' + (impacto > 0 ? 'color:var(--status-sobe);' : impacto < 0 ? 'color:var(--status-cai);' : 'color:var(--text-muted);') + '">';
        html += impacto !== 0 ? (impacto > 0 ? '+' : '') + impacto.toFixed(2) : '-';
        html += '</td></tr>';
    });
    document.getElementById('sim-table-body').innerHTML = html;
}

function onSimChange(select) {
    var ejId = select.dataset.simId;
    var ej = simulatedEJs.find(function(e) { return e.id === ejId; });
    if (ej) ej.situacao = select.value;
    updateSimSDE();
    renderSimTable();
}

function resetSimulation() {
    simulatedEJs = JSON.parse(JSON.stringify(window.allEJs));
    updateSimSDE();
    renderSimTable();
}

function runSolver() {
    var metaSDE = parseFloat(document.getElementById('solver-meta').value) || 0;
    var sdeAtual = calcularSDE(window.allEJs).sde;
    var deficit = metaSDE - sdeAtual;
    var html = '';
    if (deficit <= 0) {
        html = '<div style="padding:8px 16px;background:rgba(52,211,153,0.1);border-radius:var(--radius-md);border:1px solid rgba(52,211,153,0.2);">';
        html += '<span style="font-size:0.82rem;font-weight:700;color:var(--status-sobe);">Meta ja atingida! SDE atual: ' + (sdeAtual >= 0 ? '+' : '') + sdeAtual.toFixed(2) + '</span></div>';
    } else {
        html = '<div style="display:flex;gap:var(--space-md);flex-wrap:wrap;align-items:stretch;">';
        for (var c = 1; c <= 5; c++) {
            var peso = PESOS_CLUSTER[c]; var ejsN = Math.ceil(deficit / peso); var cc = CLUSTER_COLORS[c];
            var ejsD = window.allEJs.filter(function(e) { return e.cluster === c && e.situacao !== 'SOBE'; }).length;
            var viavel = ejsN <= ejsD;
            var rgb = c===1?'242,100,135':c===2?'167,139,250':c===3?'107,176,209':c===4?'34,211,238':'52,211,153';
            html += '<div style="background:'+cc.bg+';border:1px solid rgba('+rgb+',0.2);border-radius:var(--radius-md);padding:12px 16px;min-width:120px;text-align:center;">';
            html += '<div style="font-size:0.65rem;font-weight:700;color:'+cc.color+';text-transform:uppercase;margin-bottom:4px;">'+cc.name+' (peso '+peso+')</div>';
            html += '<div class="solver-result" style="font-size:1.8rem;">'+ejsN+'</div>';
            html += '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">EJs precisam subir</div>';
            html += '<div style="font-size:0.62rem;margin-top:4px;font-weight:600;color:'+(viavel?'var(--status-sobe)':'var(--status-cai)')+';">'+(viavel?'OK ':'Apenas ')+ejsD+' disponiveis</div></div>';
        }
        html += '</div>';
    }
    document.getElementById('solver-results').innerHTML = html;
}
function renderApostas(dados) {
    var counts = { alto: 0, potencial: 0, risco: 0, alerta: 0 };
    dados.forEach(function(e) { counts[e.categoriaAposta] = (counts[e.categoriaAposta] || 0) + 1; });
    document.getElementById('count-alto').textContent = counts.alto;
    document.getElementById('count-potencial').textContent = counts.potencial;
    document.getElementById('count-risco').textContent = counts.risco;
    document.getElementById('count-alerta').textContent = counts.alerta;
    var sdeAtual = calcularSDE(dados).sde;
    var projetado = JSON.parse(JSON.stringify(dados));
    projetado.forEach(function(e) {
        if (e.categoriaAposta === 'alto' && e.situacao !== 'SOBE') e.situacao = 'SOBE';
    });
    var sdeProj = calcularSDE(projetado).sde;
    document.getElementById('proj-sde-atual').textContent = sdeAtual >= 0 ? '+' + sdeAtual.toFixed(2) : sdeAtual.toFixed(2);
    document.getElementById('proj-sde-projetado').textContent = sdeProj >= 0 ? '+' + sdeProj.toFixed(2) : sdeProj.toFixed(2);
    document.getElementById('proj-sde-projetado').style.color = sdeProj > sdeAtual ? 'var(--status-sobe)' : 'var(--status-cai)';
    renderApostasCards(dados);
}

function filterApostas(categoria) {
    currentApostaFilter = categoria;
    renderApostasCards(window.allEJs);
}

function renderApostasCards(dados) {
    var filtered = dados;
    if (currentApostaFilter !== 'all') filtered = dados.filter(function(e) { return e.categoriaAposta === currentApostaFilter; });
    filtered = filtered.slice().sort(function(a, b) {
        var co = { alto:0, alerta:1, potencial:2, risco:3 };
        if ((co[a.categoriaAposta]||3) !== (co[b.categoriaAposta]||3)) return (co[a.categoriaAposta]||3) - (co[b.categoriaAposta]||3);
        if (PESOS_CLUSTER[a.cluster] !== PESOS_CLUSTER[b.cluster]) return PESOS_CLUSTER[b.cluster] - PESOS_CLUSTER[a.cluster];
        return b.proximidade - a.proximidade;
    });
    var container = document.getElementById('apostas-container');
    if (filtered.length === 0) { container.innerHTML = '<div class="empty-state"><p>Nenhuma EJ nesta categoria</p></div>'; return; }
    var html = '';
    filtered.forEach(function(ej) {
        var cc = CLUSTER_COLORS[ej.cluster];
        var catCfg = { alto: { label:'Alto Retorno', color:'var(--aposta-alto)', bc:'badge-alto' }, potencial: { label:'Potencial', color:'var(--aposta-potencial)', bc:'badge-potencial' }, risco: { label:'Em Risco', color:'var(--aposta-risco)', bc:'badge-risco' }, alerta: { label:'Alerta Vermelho', color:'var(--aposta-alerta)', bc:'badge-alerta' } };
        var cat = catCfg[ej.categoriaAposta] || catCfg.risco;
        var sitClass = ej.situacao === 'SOBE' ? 'badge-sobe' : ej.situacao === 'CAI' ? 'badge-cai' : 'badge-permanece';
        var indHTML = '';
        var det = ej.detalhes || {};
        if (det.fatPercSubir !== undefined) indHTML += buildMiniProgress('Faturamento', det.fatPercSubir, moneyFmt(ej.faturamento.alcancado));
        if (det.csatPercSubir !== undefined) indHTML += buildMiniProgress('CSAT', det.csatPercSubir, ej.csat.alcancado.toFixed(1));
        if (det.ecmPercSubir !== undefined) indHTML += buildMiniProgress('ECM', det.ecmPercSubir, ej.ecm.alcancado + '%');
        if (det.fcolabPercSubir !== undefined) indHTML += buildMiniProgress('Fat. Colab', det.fcolabPercSubir, ej.fcolab + '%');
        html += '<div class="aposta-card ' + ej.categoriaAposta + '" onclick="openPredictionModal(\'' + ej.id + '\')" style="cursor:pointer;"><div class="accent-strip"></div><div style="padding-left:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px;"><div>';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">';
        html += '<span style="font-size:0.92rem;font-weight:700;color:var(--text-primary);">' + ej.nome + '</span>';
        html += '<span class="cluster-badge c' + ej.cluster + '">' + cc.name + '</span>';
        html += '<span class="badge ' + sitClass + '">' + ej.situacao + '</span></div>';
        html += '<span class="badge ' + cat.bc + '">' + cat.label + '</span></div>';
        html += '<div style="text-align:right;"><div style="font-size:0.65rem;color:var(--text-muted);font-weight:600;">Impacto SDE</div>';
        html += '<div style="font-family:var(--font-heading);font-size:1.2rem;font-weight:800;color:' + cat.color + ';">' + (ej.impactoSDE >= 0 ? '+' : '') + ej.impactoSDE.toFixed(2) + '</div></div></div>';
        var proxColor = ej.proximidade >= 70 ? 'var(--status-sobe)' : ej.proximidade >= 40 ? 'var(--brand-blue)' : 'var(--status-cai)';
        html += '<div style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;margin-bottom:4px;">';
        html += '<span style="font-size:0.7rem;font-weight:600;color:var(--text-secondary);">Proximidade</span>';
        html += '<span style="font-size:0.72rem;font-weight:700;color:' + proxColor + ';">' + Math.round(ej.proximidade) + '%</span></div>';
        html += '<div class="progress-bar-bg" style="height:8px;"><div class="progress-bar-fill" style="width:' + Math.min(100, ej.proximidade) + '%;background:' + proxColor + ';"></div></div></div>';
        if (ej.trava !== 'Nenhuma') {
            html += '<div style="margin-bottom:12px;"><span class="trava-tag">Trava: ' + ej.trava + '</span>';
            if (ej.travas && ej.travas.length > 0 && ej.travas[0].falta) html += '<span style="font-size:0.68rem;color:var(--text-muted);margin-left:8px;">' + ej.travas[0].falta + '</span>';
            html += '</div>';
        }
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' + indHTML + '</div></div></div>';
    });
    container.innerHTML = html;
}

function buildMiniProgress(label, percent, value) {
    var color = percent >= 100 ? 'var(--status-sobe)' : percent >= 70 ? 'var(--brand-blue)' : percent >= 40 ? 'var(--aposta-risco)' : 'var(--status-cai)';
    return '<div style="padding:6px 8px;background:rgba(148,163,184,0.05);border-radius:var(--radius-sm);"><div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:0.65rem;font-weight:600;color:var(--text-muted);">' + label + '</span><span style="font-size:0.65rem;font-weight:700;color:' + color + ';">' + value + '</span></div><div class="progress-bar-bg" style="height:4px;"><div class="progress-bar-fill" style="width:' + Math.min(100, percent) + '%;background:' + color + ';"></div></div></div>';
}

function generateAllActionPlans(scope) {
    var filtered;
    if (scope === 'all') filtered = window.allEJs.filter(function(e) { return e.categoriaAposta !== 'risco' || e.situacao === 'CAI'; });
    else filtered = window.allEJs.filter(function(e) { return e.categoriaAposta === 'alto' || e.categoriaAposta === 'alerta'; });
    var sorted = filtered.slice().sort(function(a, b) {
        var co = { alerta:0, alto:1, potencial:2, risco:3 };
        return (co[a.categoriaAposta]||3) - (co[b.categoriaAposta]||3);
    });
    var container = document.getElementById('action-plans-container');
    if (sorted.length === 0) { container.innerHTML = '<div class="empty-state"><p>Nenhuma EJ priorizada</p></div>'; return; }
    var html = '';
    sorted.forEach(function(ej, idx) {
        var plan = generateActionPlan(ej);
        var cc = CLUSTER_COLORS[ej.cluster];
        var catCfg = { alto: { label:'Alto Retorno', color:'var(--aposta-alto)' }, potencial: { label:'Potencial', color:'var(--aposta-potencial)' }, risco: { label:'Em Risco', color:'var(--aposta-risco)' }, alerta: { label:'Alerta Vermelho', color:'var(--aposta-alerta)' } };
        var cat = catCfg[ej.categoriaAposta] || catCfg.risco;
        html += '<div class="action-card animate-slide-up delay-' + ((idx%5)+1) + '" style="margin-bottom:var(--space-md);border-left:4px solid ' + cat.color + ';">';
        html += '<div class="action-card-header"><div style="display:flex;align-items:center;gap:12px;">';
        html += '<span style="font-size:1rem;font-weight:700;color:var(--text-primary);">' + ej.nome + '</span>';
        html += '<span class="cluster-badge c' + ej.cluster + '">' + cc.name + '</span>';
        html += '<span style="font-size:0.72rem;font-weight:700;color:' + cat.color + ';">' + cat.label + '</span></div>';
        html += '<div style="text-align:right;"><div style="font-size:0.65rem;color:var(--text-muted);">Impacto SDE</div>';
        html += '<div style="font-weight:800;color:' + cat.color + ';">' + (ej.impactoSDE >= 0 ? '+' : '') + ej.impactoSDE.toFixed(2) + '</div></div></div>';
        html += '<div class="action-card-body">';
        plan.steps.forEach(function(step) {
            html += '<div class="action-step"><div class="action-step-icon" style="background:' + step.iconBg + ';color:' + step.iconColor + ';">' + step.icon + '</div>';
            html += '<div style="flex:1;"><div style="font-size:0.78rem;font-weight:700;color:var(--text-accent);margin-bottom:4px;">' + step.title + '</div>';
            html += '<div style="font-size:0.75rem;color:var(--text-secondary);line-height:1.5;">' + step.description + '</div></div></div>';
        });
        html += '<div style="margin-top:var(--space-md);padding:var(--space-md);background:rgba(59,130,246,0.05);border-radius:var(--radius-md);border:1px solid rgba(59,130,246,0.1);">';
        html += '<div style="font-size:0.72rem;font-weight:700;color:var(--brand-blue);margin-bottom:4px;">Ritmo de Acompanhamento</div>';
        html += '<div style="font-size:0.75rem;color:var(--text-secondary);">' + plan.ritmo + '</div></div></div></div>';
    });
    container.innerHTML = html;
}

function generateActionPlan(ej) {
    var steps = [];
    var trava = ej.trava;
    var det = ej.detalhes || {};
    var diagDesc = '';
    if (ej.situacao === 'CAI') diagDesc = 'A EJ esta em risco de <strong>cair de cluster</strong>. Principal causa: <strong>' + trava + '</strong>. Acao imediata necessaria.';
    else if (ej.categoriaAposta === 'alto') diagDesc = 'A EJ esta <strong>muito proxima de subir</strong> (' + Math.round(ej.proximidade) + '%). ' + (trava !== 'Nenhuma' ? 'Trava: <strong>' + trava + '</strong>.' : 'Indicadores no caminho.');
    else diagDesc = 'Precisa melhorias em <strong>' + trava + '</strong>. Proximidade: ' + Math.round(ej.proximidade) + '%.';
    steps.push({ icon: 'D', iconBg: 'rgba(107,176,209,0.12)', iconColor: 'var(--brand-blue)', title: 'Diagnostico - A Trava', description: diagDesc });
    var acaoDesc = '';
    if (trava === 'Faturamento' || trava === 'Nenhuma') {
        acaoDesc = 'Focar na <strong>captacao e fechamento de projetos</strong>. Lancar propostas comerciais, aumentar ticket medio.';
    } else if (trava === 'CSAT') acaoDesc = 'Investigar <strong>notas baixas</strong>. Pesquisa pos-projeto, checkpoints de qualidade.';
    else if (trava === 'ECM') acaoDesc = 'Aumentar <strong>ECM</strong>. Alocar mais membros em projetos, programa trainee.';
    else if (trava === 'Fat. Colaborativo') acaoDesc = 'Desenvolver <strong>projetos em parceria</strong>. Identificar EJs complementares.';
    steps.push({ icon: 'A', iconBg: 'rgba(52,211,153,0.12)', iconColor: 'var(--status-sobe)', title: 'Acao Recomendada', description: acaoDesc });
    var metaDesc = '';
    if (ej.cluster < 5) {
        var cr = CLUSTER_CRITERIOS[ej.cluster];
        if (cr) {
            metaDesc = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">';
            var fM = cr.fatSubir || 0; var fA = ej.faturamento.alcancado || 0; var fD = Math.max(0, fM - fA);
            metaDesc += '<div style="background:rgba(255,255,255,0.03);padding:6px;border-radius:4px;"><div style="font-size:0.65rem;color:var(--text-muted);">Faturamento</div><div style="font-size:0.75rem;font-weight:700;">Atual: '+moneyFmt(fA)+'</div><div style="font-size:0.75rem;color:var(--brand-blue);">Meta: '+moneyFmt(fM)+'</div>' + (fD>0?'<div style="font-size:0.7rem;color:var(--status-cai);">Falta: '+moneyFmt(fD)+'</div>':'<div style="font-size:0.7rem;color:var(--status-sobe);">Alcancado!</div>') + '</div>';
            var cM = cr.csatSubir || 0; var cA = ej.csat.alcancado || 0; var cD = Math.max(0, cM - cA);
            metaDesc += '<div style="background:rgba(255,255,255,0.03);padding:6px;border-radius:4px;"><div style="font-size:0.65rem;color:var(--text-muted);">CSAT</div><div style="font-size:0.75rem;font-weight:700;">Atual: '+cA.toFixed(1)+'</div><div style="font-size:0.75rem;color:var(--brand-blue);">Meta: '+cM.toFixed(1)+'</div>' + (cD>0?'<div style="font-size:0.7rem;color:var(--status-cai);">Falta: '+cD.toFixed(1)+'</div>':'<div style="font-size:0.7rem;color:var(--status-sobe);">Alcancado!</div>') + '</div>';
            var eM = cr.ecmSubir || 0; var eA = ej.ecm.alcancado || 0; var eD = Math.max(0, eM - eA);
            metaDesc += '<div style="background:rgba(255,255,255,0.03);padding:6px;border-radius:4px;"><div style="font-size:0.65rem;color:var(--text-muted);">ECM</div><div style="font-size:0.75rem;font-weight:700;">Atual: '+eA+'%</div><div style="font-size:0.75rem;color:var(--brand-blue);">Meta: '+eM+'%</div>' + (eD>0?'<div style="font-size:0.7rem;color:var(--status-cai);">Falta: '+eD+'%</div>':'<div style="font-size:0.7rem;color:var(--status-sobe);">Alcancado!</div>') + '</div>';
            var colM = cr.fcolabSubir || 0; var colA = ej.fcolab || 0; var colD = Math.max(0, colM - colA);
            metaDesc += '<div style="background:rgba(255,255,255,0.03);padding:6px;border-radius:4px;"><div style="font-size:0.65rem;color:var(--text-muted);">Fat. Colaborativo</div><div style="font-size:0.75rem;font-weight:700;">Atual: '+colA+'%</div><div style="font-size:0.75rem;color:var(--brand-blue);">Meta: '+colM+'%</div>' + (colD>0?'<div style="font-size:0.7rem;color:var(--status-cai);">Falta: '+colD+'%</div>':'<div style="font-size:0.7rem;color:var(--status-sobe);">Alcancado!</div>') + '</div>';
            metaDesc += '</div>';
        }
    } else metaDesc = 'C5 = topo. Foco em <strong>manter indicadores</strong> acima do minimo.';
    steps.push({ icon: 'M', iconBg: 'rgba(242,100,135,0.12)', iconColor: 'var(--brand-pink)', title: 'Metas P/ Proximo Cluster', description: metaDesc });
    var pw = PESOS_CLUSTER[ej.cluster];
    steps.push({ icon: 'I', iconBg: 'rgba(167,139,250,0.12)', iconColor: 'var(--brand-purple)', title: 'Impacto Estrategico', description: 'Impacto no SDE: <strong>+' + pw.toFixed(2) + '</strong> pts. Cluster ' + ej.cluster + ' = peso <strong>' + (pw*100) + '%</strong>.' + (ej.cluster<=2?' <strong>Prioridade maxima C1/C2!</strong>':'') });
    var ritmo = '';
    if (ej.categoriaAposta === 'alerta') ritmo = '<strong>Semanal</strong> - Check-in 15min. Escalar se sem progresso em 2 semanas.';
    else if (ej.categoriaAposta === 'alto') ritmo = '<strong>Quinzenal</strong> - Garantir indicadores nao regridam. Proximidade com lideranca.';
    else ritmo = '<strong>Mensal</strong> - Check-in padrao. Monitorar e ajustar.';
    return { steps: steps, ritmo: ritmo };
}

function printActionPlans() { window.print(); }

document.addEventListener('DOMContentLoaded', function() { window.syncOnlineData(); });

function loadDemoData() {
    var demoEJs = [
        { nome: 'UFES Jr', cluster: 1, fat: 15000, csat: 3.2, ecm: 30, fcolab: 0, eng: 40 },
        { nome: 'InJunior', cluster: 1, fat: 42000, csat: 3.8, ecm: 55, fcolab: 0, eng: 60 },
        { nome: 'Solaris', cluster: 1, fat: 8000, csat: 2.5, ecm: 15, fcolab: 0, eng: 25 },
        { nome: 'CompJr', cluster: 1, fat: 48000, csat: 4.0, ecm: 60, fcolab: 2, eng: 70 },
        { nome: 'ProjetoJr', cluster: 2, fat: 85000, csat: 3.5, ecm: 45, fcolab: 3, eng: 55 },
        { nome: 'EngenJr', cluster: 2, fat: 110000, csat: 4.1, ecm: 65, fcolab: 6, eng: 72 },
        { nome: 'Mult Jr', cluster: 2, fat: 60000, csat: 3.0, ecm: 35, fcolab: 1, eng: 40 },
        { nome: 'DesignLab', cluster: 2, fat: 95000, csat: 3.7, ecm: 58, fcolab: 4, eng: 65 },
        { nome: 'AgroJr', cluster: 3, fat: 200000, csat: 4.2, ecm: 72, fcolab: 11, eng: 80 },
        { nome: 'CivilJr', cluster: 3, fat: 150000, csat: 3.6, ecm: 50, fcolab: 5, eng: 55 },
        { nome: 'TechJr', cluster: 3, fat: 230000, csat: 4.0, ecm: 68, fcolab: 9, eng: 75 },
        { nome: 'ConsultJr', cluster: 4, fat: 380000, csat: 4.3, ecm: 82, fcolab: 16, eng: 85 },
        { nome: 'MetaJr', cluster: 4, fat: 220000, csat: 3.9, ecm: 62, fcolab: 10, eng: 68 },
        { nome: 'ArchiJr', cluster: 4, fat: 450000, csat: 4.5, ecm: 85, fcolab: 18, eng: 90 },
        { nome: 'EliteJr', cluster: 5, fat: 600000, csat: 4.6, ecm: 88, fcolab: 20, eng: 92 },
        { nome: 'PrimeJr', cluster: 5, fat: 350000, csat: 3.9, ecm: 70, fcolab: 10, eng: 75 }
    ];
    var cm = new Date().getMonth() + 1;
    var pr = cm / 12.0;
    var ejs = demoEJs.map(function(d, i) {
        var fp = pr > 0 ? d.fat / pr : d.fat;
        var a = calcularSituacaoEJ(d.cluster, { faturamento: d.fat, fatProjetado: fp, fatMeta: 0, csat: d.csat, ecm: d.ecm, fcolab: d.fcolab, engajamento: d.eng });
        return { id: 'demo_' + i, nome: d.nome, nomeCompleto: d.nome, cluster: d.cluster,
            faturamento: { metaAno: 0, alcancado: d.fat, projetado: fp },
            csat: { meta: 3.5, alcancado: d.csat }, ecm: { alcancado: d.ecm }, fcolab: d.fcolab,
            engajamento: { meta: 75, alcancado: d.eng }, tempo: { meta: 50, alcancado: 30 },
            situacao: a.situacao, situacaoOriginal: a.situacao, proximidade: a.proximidade,
            trava: a.trava, travas: a.travas, categoriaAposta: a.categoriaAposta,
            impactoSDE: a.impactoSDE, detalhes: a.detalhes };
    });
    window.allEJs = ejs;
    initPlatform(ejs);
    document.getElementById('network-status').textContent = 'Dados de demonstracao carregados';
    document.getElementById('network-status').style.color = 'var(--brand-purple)';
}