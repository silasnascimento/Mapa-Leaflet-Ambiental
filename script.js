// Inicialização do mapa Leaflet
let map;
let drawnItems;
let currentPolygon = null;
let periodCount = 0;
let ndviLayers = {};
let rgbLayers = {};

// URLs dos mapas base
const basemaps = {
    osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
};

// Inicialização do mapa
function initMap() {
    map = L.map('map', {
        center: [-15.7801, -47.9292], // Centro do Brasil
        zoom: 5,
        zoomControl: false
    });

    // Adiciona o mapa base OSM por padrão
    L.tileLayer(basemaps.osm, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Adiciona controles de zoom
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // Inicializa a camada de desenho
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    // Adiciona controles de desenho
    const drawControl = new L.Control.Draw({
        draw: {
            polyline: false,
            rectangle: false,
            circle: false,
            circlemarker: false,
            marker: false,
            polygon: {
                allowIntersection: false,
                drawError: {
                    color: '#e1e100',
                    message: '<strong>Erro:</strong> Polígonos não podem se intersectar!'
                },
                shapeOptions: {
                    color: '#007bff',
                    fillOpacity: 0
                }
            }
        },
        edit: {
            featureGroup: drawnItems,
            remove: true
        }
    });
    map.addControl(drawControl);

    // Eventos de desenho
    map.on('draw:created', onDrawCreated);
    map.on('draw:edited', onDrawEdited);
    map.on('draw:deleted', onDrawDeleted);
}

// Manipulador de evento quando um polígono é desenhado
function onDrawCreated(e) {
    drawnItems.clearLayers();
    drawnItems.addLayer(e.layer);
    currentPolygon = e.layer;
    updateLayerControls();
}

// Manipulador de evento quando um polígono é editado
function onDrawEdited(e) {
    const layers = e.layers;
    layers.eachLayer(function(layer) {
        currentPolygon = layer;
    });
    updateLayerControls();
}

// Manipulador de evento quando um polígono é deletado
function onDrawDeleted(e) {
    currentPolygon = null;
    updateLayerControls();
}

// Atualiza os controles de camada com base no polígono atual
function updateLayerControls() {
    const layerControls = document.getElementById('layer-controls');
    layerControls.innerHTML = '';
    
    if (currentPolygon) {
        // Adiciona botão para processar o polígono
        const processButton = document.createElement('button');
        processButton.className = 'btn-primary';
        processButton.innerHTML = '<i class="fas fa-calculator"></i> Processar NDVI';
        processButton.addEventListener('click', processPolygon);
        layerControls.appendChild(processButton);
    }
}

// Processa o polígono desenhado
function processPolygon() {
    if (!currentPolygon) {
        alert('Por favor, desenhe um polígono primeiro.');
        return;
    }

    if (periodCount === 0) {
        alert('Por favor, adicione pelo menos um período de data.');
        return;
    }

    // Obtém as coordenadas do polígono
    const coordinates = currentPolygon.getLatLngs()[0].map(latlng => [latlng.lng, latlng.lat]);
    coordinates.push(coordinates[0]); // Fecha o polígono

    // Prepara os dados para enviar ao servidor
    const requestData = {
        roi: {
            type: 'Polygon',
            coordinates: [coordinates]
        },
        date_periods: []
    };

    // Adiciona os períodos de data no novo formato
    const periodElements = document.querySelectorAll('.period-item');
    periodElements.forEach((element) => {
        const periodNumber = element.id.split('-')[1];
        const startDate = element.querySelector(`#start-date-period-${periodNumber}`).value;
        const endDate = element.querySelector(`#end-date-period-${periodNumber}`).value;
        requestData.date_periods.push([startDate, endDate]);
    });

    // Faz a requisição unificada para o servidor
    fetchUnifiedResults(requestData);
}

// Busca os resultados unificados do servidor
function fetchUnifiedResults(requestData) {
    fetch('https://map.silasogis.com/ndvi_composite', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    })
    .then(response => response.json())
    .then(data => {
        // Processa os resultados unificados
        displayNDVIResults(data.ndvi);
        addNDVILayers(data.ndvi_tiles);
        addRGBLayers(data.image_tiles);
    })
    .catch(error => {
        console.error('Erro ao buscar resultados:', error);
        alert('Erro ao buscar resultados. Verifique o console para mais detalhes.');
    });
}

// Adiciona as camadas de NDVI ao mapa
function addNDVILayers(data) {
    // Remove camadas anteriores
    Object.values(ndviLayers).forEach(layer => {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });
    ndviLayers = {};

    // Verifica se há erro global nos tiles de NDVI
    if (data.error) {
        console.error('Erro nos tiles de NDVI:', data.error);
        const layerControls = document.getElementById('layer-controls');
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.textContent = `Erro nos tiles de NDVI: ${data.error}`;
        layerControls.appendChild(errorMessage);
        return;
    }

    // Adiciona novas camadas
    for (const [period, layerData] of Object.entries(data)) {
        // Verifica se há erro no período específico
        if (layerData.error) {
            console.error(`Erro no período ${period}:`, layerData.error);
            continue;
        }

        const ndviLayer = L.tileLayer(layerData.tile_url, {
            opacity: 1
        });
        ndviLayers[period] = ndviLayer;
        
        // Adiciona ao controle de camadas
        const layerControl = document.createElement('div');
        layerControl.className = 'layer-control-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `ndvi-${period}`;
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                map.addLayer(ndviLayers[period]);
            } else {
                map.removeLayer(ndviLayers[period]);
            }
        });
        
        const label = document.createElement('label');
        label.htmlFor = `ndvi-${period}`;
        
        // Obter o nome personalizado do período, se existir
        const periodNumber = period.split('_')[1];
        const periodElement = document.getElementById(`period-${periodNumber}`);
        let periodName = period.replace('period_', 'Período ');
        
        if (periodElement) {
            const nameInput = periodElement.querySelector('.period-name-input');
            if (nameInput && nameInput.value !== nameInput.getAttribute('data-default-value')) {
                periodName = nameInput.value;
            }
        }
        
        // Adiciona informação do satélite
        const satellite = layerData.satellite || 'desconhecido';
        const satelliteName = satellite === 'sentinel' ? 'Sentinel-2' : 
                             satellite === 'landsat' ? 'Landsat 9' : 
                             'Desconhecido';
        
        label.textContent = `NDVI ${periodName} (${satelliteName})`;
        
        layerControl.appendChild(checkbox);
        layerControl.appendChild(label);
        document.getElementById('layer-controls').appendChild(layerControl);
    }
}

// Adiciona as camadas de imagem RGB ao mapa
function addRGBLayers(data) {
    // Remove camadas anteriores
    Object.values(rgbLayers).forEach(layer => {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });
    rgbLayers = {};

    // Verifica se há erro global nos tiles de imagem
    if (data.error) {
        console.error('Erro nos tiles de imagem:', data.error);
        const layerControls = document.getElementById('layer-controls');
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.textContent = `Erro nos tiles de imagem: ${data.error}`;
        layerControls.appendChild(errorMessage);
        return;
    }

    // Adiciona novas camadas
    for (const [period, layerData] of Object.entries(data)) {
        // Verifica se há erro no período específico
        if (layerData.error) {
            console.error(`Erro no período ${period}:`, layerData.error);
            continue;
        }

        const rgbLayer = L.tileLayer(layerData.tile_url, {
            opacity: 1
        });
        rgbLayers[period] = rgbLayer;
        
        // Adiciona ao controle de camadas
        const layerControl = document.createElement('div');
        layerControl.className = 'layer-control-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `rgb-${period}`;
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                map.addLayer(rgbLayers[period]);
            } else {
                map.removeLayer(rgbLayers[period]);
            }
        });
        
        const label = document.createElement('label');
        label.htmlFor = `rgb-${period}`;
        
        // Obter o nome personalizado do período, se existir
        const periodNumber = period.split('_')[1];
        const periodElement = document.getElementById(`period-${periodNumber}`);
        let periodName = period.replace('period_', 'Período ');
        
        if (periodElement) {
            const nameInput = periodElement.querySelector('.period-name-input');
            if (nameInput && nameInput.value !== nameInput.getAttribute('data-default-value')) {
                periodName = nameInput.value;
            }
        }
        
        // Adiciona informação do satélite
        const satellite = layerData.satellite || 'desconhecido';
        const satelliteName = satellite === 'sentinel' ? 'Sentinel-2' : 
                             satellite === 'landsat' ? 'Landsat 9' : 
                             'Desconhecido';
        
        label.textContent = `RGB ${periodName} (${satelliteName})`;
        
        layerControl.appendChild(checkbox);
        layerControl.appendChild(label);
        document.getElementById('layer-controls').appendChild(layerControl);
    }
}

// Exibe os resultados de NDVI na sidebar
function displayNDVIResults(data) {
    const ndviResultsContainer = document.getElementById('ndvi-results');
    ndviResultsContainer.innerHTML = '';

    // Verifica se há erro global nos dados de NDVI
    if (data.error) {
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.textContent = `Erro nos dados de NDVI: ${data.error}`;
        ndviResultsContainer.appendChild(errorMessage);
        return;
    }

    for (const [period, stats] of Object.entries(data)) {
        // Verifica se há erro no período específico
        if (stats.error) {
            console.error(`Erro no período ${period}:`, stats.error);
            const periodResult = document.createElement('div');
            periodResult.className = 'ndvi-period-result error';
            
            const periodTitle = document.createElement('h4');
            periodTitle.textContent = `Período ${period.split('_')[1]}`;
            periodResult.appendChild(periodTitle);
            
            const errorMessage = document.createElement('div');
            errorMessage.className = 'error-message';
            errorMessage.textContent = stats.error;
            periodResult.appendChild(errorMessage);
            
            ndviResultsContainer.appendChild(periodResult);
            continue;
        }

        const periodResult = document.createElement('div');
        periodResult.className = 'ndvi-period-result';
        
        const periodTitle = document.createElement('h4');
        
        // Obter o nome personalizado do período, se existir
        const periodNumber = period.split('_')[1];
        const periodElement = document.getElementById(`period-${periodNumber}`);
        let periodName = period.replace('period_', 'Período ');
        
        if (periodElement) {
            const nameInput = periodElement.querySelector('.period-name-input');
            if (nameInput && nameInput.value !== nameInput.getAttribute('data-default-value')) {
                periodName = nameInput.value;
            }
        }
        
        // Adiciona informação do satélite
        const satellite = stats.satellite || 'desconhecido';
        const satelliteName = satellite === 'sentinel' ? 'Sentinel-2' : 
                             satellite === 'landsat' ? 'Landsat 9' : 
                             'Desconhecido';
        
        periodTitle.textContent = `${periodName} (${satelliteName})`;
        periodResult.appendChild(periodTitle);
        
        const statsContainer = document.createElement('div');
        statsContainer.className = 'ndvi-stats';
        
        // Média
        const meanStat = document.createElement('div');
        meanStat.className = 'ndvi-stat';
        meanStat.innerHTML = `
            <div class="ndvi-stat-label">Média</div>
            <div class="ndvi-stat-value">${stats.ndvi_mean ? stats.ndvi_mean.toFixed(4) : 'N/A'}</div>
        `;
        statsContainer.appendChild(meanStat);
        
        // Mínimo
        const minStat = document.createElement('div');
        minStat.className = 'ndvi-stat';
        minStat.innerHTML = `
            <div class="ndvi-stat-label">Mínimo</div>
            <div class="ndvi-stat-value">${stats.ndvi_min ? stats.ndvi_min.toFixed(4) : 'N/A'}</div>
        `;
        statsContainer.appendChild(minStat);
        
        // Máximo
        const maxStat = document.createElement('div');
        maxStat.className = 'ndvi-stat';
        maxStat.innerHTML = `
            <div class="ndvi-stat-label">Máximo</div>
            <div class="ndvi-stat-value">${stats.ndvi_max ? stats.ndvi_max.toFixed(4) : 'N/A'}</div>
        `;
        statsContainer.appendChild(maxStat);
        
        periodResult.appendChild(statsContainer);
        ndviResultsContainer.appendChild(periodResult);
    }
}

// Adiciona um novo período de data
function addDatePeriod() {
    periodCount++;
    const periodsContainer = document.getElementById('periods-container');
    
    const periodItem = document.createElement('div');
    periodItem.className = 'period-item';
    periodItem.id = `period-${periodCount}`;
    
    const periodHeader = document.createElement('div');
    periodHeader.className = 'period-header';
    
    const periodTitle = document.createElement('h4');
    
    // Criar o campo de input para o nome do período
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'period-name-input';
    nameInput.value = `Período ${periodCount}`;
    nameInput.setAttribute('data-default-value', `Período ${periodCount}`);
    
    // Adicionar evento para restaurar o valor padrão se o campo ficar vazio
    nameInput.addEventListener('blur', function() {
        if (this.value.trim() === '') {
            this.value = this.getAttribute('data-default-value');
        }
    });
    
    // Adicionar evento para salvar o valor quando pressionar Enter
    nameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.blur();
        }
    });
    
    periodTitle.appendChild(nameInput);
    
    const deleteButton = document.createElement('button');
    deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
    deleteButton.addEventListener('click', function() {
        periodItem.remove();
        updatePeriodCount();
    });
    
    periodHeader.appendChild(periodTitle);
    periodHeader.appendChild(deleteButton);
    
    const dateInputs = document.createElement('div');
    dateInputs.className = 'date-inputs';
    
    // Data de início
    const startDateGroup = document.createElement('div');
    startDateGroup.className = 'date-input-group';
    
    const startDateLabel = document.createElement('label');
    startDateLabel.htmlFor = `start-date-period-${periodCount}`;
    startDateLabel.textContent = 'Data de Início';
    
    const startDateInput = document.createElement('input');
    startDateInput.type = 'date';
    startDateInput.id = `start-date-period-${periodCount}`;
    startDateInput.required = true;
    
    startDateGroup.appendChild(startDateLabel);
    startDateGroup.appendChild(startDateInput);
    
    // Data de fim
    const endDateGroup = document.createElement('div');
    endDateGroup.className = 'date-input-group';
    
    const endDateLabel = document.createElement('label');
    endDateLabel.htmlFor = `end-date-period-${periodCount}`;
    endDateLabel.textContent = 'Data de Fim';
    
    const endDateInput = document.createElement('input');
    endDateInput.type = 'date';
    endDateInput.id = `end-date-period-${periodCount}`;
    endDateInput.required = true;
    
    endDateGroup.appendChild(endDateLabel);
    endDateGroup.appendChild(endDateInput);
    
    dateInputs.appendChild(startDateGroup);
    dateInputs.appendChild(endDateGroup);
    
    periodItem.appendChild(periodHeader);
    periodItem.appendChild(dateInputs);
    
    periodsContainer.appendChild(periodItem);
}

// Atualiza a contagem de períodos
function updatePeriodCount() {
    const periodItems = document.querySelectorAll('.period-item');
    periodCount = periodItems.length;
    
    // Atualiza os IDs e títulos
    periodItems.forEach((item, index) => {
        const newIndex = index + 1;
        item.id = `period-${newIndex}`;
        
        const nameInput = item.querySelector('.period-name-input');
        const defaultName = `Período ${newIndex}`;
        nameInput.setAttribute('data-default-value', defaultName);
        
        // Só atualiza o valor se ainda estiver usando o padrão
        if (nameInput.value === `Período ${item.id.split('-')[1]}`) {
            nameInput.value = defaultName;
        }
        
        const startDateInput = item.querySelector(`#start-date-period-${item.id.split('-')[1]}`);
        startDateInput.id = `start-date-period-${newIndex}`;
        
        const endDateInput = item.querySelector(`#end-date-period-${item.id.split('-')[1]}`);
        endDateInput.id = `end-date-period-${newIndex}`;
        
        const startDateLabel = item.querySelector(`label[for="start-date-period-${item.id.split('-')[1]}"]`);
        startDateLabel.htmlFor = `start-date-period-${newIndex}`;
        
        const endDateLabel = item.querySelector(`label[for="end-date-period-${item.id.split('-')[1]}"]`);
        endDateLabel.htmlFor = `end-date-period-${newIndex}`;
    });
}

// Busca local usando Nominatim
function searchLocation() {
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput.value.trim();
    
    if (searchTerm === '') {
        alert('Por favor, insira um termo de busca.');
        return;
    }
    
    const searchResults = document.getElementById('search-results');
    searchResults.innerHTML = '<div class="search-result-item">Buscando...</div>';
    
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchTerm)}&limit=5`)
        .then(response => response.json())
        .then(data => {
            searchResults.innerHTML = '';
            
            if (data.length === 0) {
                searchResults.innerHTML = '<div class="search-result-item">Nenhum resultado encontrado.</div>';
                return;
            }
            
            data.forEach(result => {
                const resultItem = document.createElement('div');
                resultItem.className = 'search-result-item';
                resultItem.textContent = result.display_name;
                resultItem.addEventListener('click', function() {
                    map.setView([result.lat, result.lon], 12);
                    searchResults.innerHTML = '';
                    searchInput.value = '';
                });
                searchResults.appendChild(resultItem);
            });
        })
        .catch(error => {
            console.error('Erro na busca:', error);
            searchResults.innerHTML = '<div class="search-result-item">Erro ao buscar localização.</div>';
        });
}

// Alterna entre os mapas base
function switchBasemap(basemapType) {
    // Remove todos os mapas base
    Object.values(basemaps).forEach(url => {
        const layer = L.tileLayer(url);
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });
    
    // Adiciona o mapa base selecionado
    L.tileLayer(basemaps[basemapType], {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    // Atualiza o botão ativo
    document.querySelectorAll('.basemap-buttons button').forEach(button => {
        button.classList.remove('active');
    });
    document.getElementById(`${basemapType}-basemap`).classList.add('active');
}

// Inicialização quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    
    // Adiciona evento ao botão de busca
    document.getElementById('search-button').addEventListener('click', searchLocation);
    document.getElementById('search-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchLocation();
        }
    });
    
    // Adiciona evento ao botão de adicionar período
    document.getElementById('add-period-button').addEventListener('click', addDatePeriod);
    
    // Adiciona eventos aos botões de mapa base
    document.getElementById('osm-basemap').addEventListener('click', function() {
        switchBasemap('osm');
    });
    
    document.getElementById('satellite-basemap').addEventListener('click', function() {
        switchBasemap('satellite');
    });
    
    document.getElementById('terrain-basemap').addEventListener('click', function() {
        switchBasemap('terrain');
    });
    
    // Adiciona um período inicial
    addDatePeriod();
});
