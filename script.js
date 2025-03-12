// Inicializando o mapa
var map = L.map('map').setView([-15.7801, -47.9292], 4);

// Definindo camadas base
var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
});
var googleMaps = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '© Google Maps'
});
var esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri'
});
osm.addTo(map);

// Definindo grupos para o controle de camadas
var baseMaps = {
    "OpenStreetMap": osm,
    "Google Maps": googleMaps,
    "Esri World Imagery": esri
};
var overlayMaps = {}; // Para as camadas NDVI

// Controle de camadas (inicializado com basemaps e overlays)
var layerControl = L.control.layers(baseMaps, overlayMaps).addTo(map);

// Adicionando ferramenta de desenho
var drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

var drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: {
        polygon: true,
        polyline: false,
        circle: false,
        rectangle: true,
        marker: false,
        circlemarker: false
    }
});
map.addControl(drawControl);

// Adicionar novo período dinamicamente
document.getElementById('add-period').addEventListener('click', function() {
    const periodsDiv = document.getElementById('periods');
    const periodCount = periodsDiv.children.length + 1;
    const newPeriod = document.createElement('div');
    newPeriod.className = 'period-container';
    newPeriod.dataset.period = periodCount;
    newPeriod.innerHTML = `
        <label>Nome do Período:</label>
        <input type="text" class="period-name" placeholder="Ex.: Período ${periodCount}"><br>
        <label>Data Inicial:</label>
        <input type="date" class="start-date"><br>
        <label>Data Final:</label>
        <input type="date" class="end-date"><br>
        <span class="remove-btn" onclick="removePeriod(this)">X</span>
    `;
    periodsDiv.appendChild(newPeriod);
});

// Remover um período
function removePeriod(element) {
    const periodDiv = element.parentElement;
    if (document.querySelectorAll('.period-container').length > 1) {
        periodDiv.remove();
    } else {
        alert('Pelo menos um período é necessário!');
    }
}

// Função para coletar períodos
function getPeriods() {
    const periods = document.querySelectorAll('.period-container');
    const periodData = {};
    periods.forEach((period, index) => {
        const periodNum = index + 1;
        const startDate = period.querySelector('.start-date').value;
        const endDate = period.querySelector('.end-date').value;
        if (startDate && endDate) {
            periodData[`start_date_period_${periodNum}`] = startDate;
            periodData[`end_date_period_${periodNum}`] = endDate;
        }
    });
    return periodData;
}

// Quando o usuário desenha um polígono
map.on(L.Draw.Event.CREATED, function(event) {
    var layer = event.layer;
    drawnItems.clearLayers(); // Limpa desenhos anteriores
    drawnItems.addLayer(layer);
    updateData(layer.getLatLngs());
});

// Atualizar dados ao clicar no botão
document.getElementById('updateDataButton').addEventListener('click', function() {
    if (drawnItems.getLayers().length > 0) {
        updateData(drawnItems.getLayers()[0].getLatLngs());
    } else {
        alert('Desenhe uma área no mapa primeiro!');
    }
});

// Função para atualizar dados
function updateData(coords) {
    const geojson = {
        type: "Polygon",
        coordinates: [coords[0].map(latlng => [latlng.lng, latlng.lat])]
    };
    const periodData = getPeriods();
    fetchEnvironmentalData(geojson, periodData);
    fetchNDVITiles(geojson, periodData);
}

// Função para buscar dados ambientais (NDVI médio)
function fetchEnvironmentalData(geojson, periodData) {
    document.getElementById('info').innerHTML = "Buscando dados ambientais...";
    
    fetch('https://212.85.2.191:5000/calculate_ndvi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roi: geojson, ...periodData })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            document.getElementById('info').innerHTML = `Erro: ${data.error}`;
        } else {
            let html = '<b>Dados Ambientais:</b><ul>';
            const periods = document.querySelectorAll('.period-container');
            periods.forEach((period, index) => {
                const periodNum = index + 1;
                const periodName = period.querySelector('.period-name').value || `Período ${periodNum}`;
                const periodData = data[`period_${periodNum}`];
                if (periodData) {
                    html += `
                        <li><b>${periodName} (${period.querySelector('.start-date').value} - ${period.querySelector('.end-date').value}):</b>
                            <ul>
                                <li>NDVI médio: ${periodData.ndvi_mean?.toFixed(4) || 'N/A'}</li>
                                <li>NDVI mínimo: ${periodData.ndvi_min?.toFixed(4) || 'N/A'}</li>
                                <li>NDVI máximo: ${periodData.ndvi_max?.toFixed(4) || 'N/A'}</li>
                            </ul>
                        </li>`;
                }
            });
            html += '</ul>';
            document.getElementById('info').innerHTML = html;
        }
    })
    .catch(err => {
        document.getElementById('info').innerHTML = `Erro ao conectar com o servidor: ${err}`;
    });
}

// Função para buscar tiles NDVI
function fetchNDVITiles(geojson, periodData) {
    fetch('https://212.85.2.191:5000/get_ndvi_tiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roi: geojson, ...periodData })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            document.getElementById('info').innerHTML += `<br>Erro ao carregar tiles NDVI: ${data.error}`;
        } else {
            // Remove camadas NDVI anteriores
            if (window.ndviLayers) {
                Object.values(window.ndviLayers).forEach(layer => map.removeLayer(layer));
                Object.keys(window.ndviLayers).forEach(key => delete overlayMaps[key]);
            }
            window.ndviLayers = {};

            const periods = document.querySelectorAll('.period-container');
            periods.forEach((period, index) => {
                const periodNum = index + 1;
                const periodName = period.querySelector('.period-name').value || `Período ${periodNum}`;
                const tileUrl = data[`period_${periodNum}`]?.tile_url;
                if (tileUrl) {
                    window.ndviLayers[periodName] = L.tileLayer(tileUrl, {
                        attribution: `NDVI - ${periodName}`,
                        opacity: 0.7
                    });
                    overlayMaps[`NDVI ${periodName}`] = window.ndviLayers[periodName];
                }
            });

            // Atualiza o controle de camadas sem recriá-lo
            layerControl.remove();
            layerControl = L.control.layers(baseMaps, overlayMaps).addTo(map);

            document.getElementById('info').innerHTML += "<br>Tiles NDVI carregados com sucesso!";
        }
    })
    .catch(err => {
        document.getElementById('info').innerHTML += `<br>Erro ao conectar ao servidor: ${err}`;
    });
}

// Geocodificação Nominatim
document.getElementById('geocodeButton').addEventListener('click', function() {
    const address = document.getElementById('address').value;
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
        .then(response => response.json())
        .then(data => {
            if (data.length > 0) {
                const { lat, lon } = data[0];
                map.setView([lat, lon], 12);
                L.marker([lat, lon]).addTo(map).bindPopup(`Endereço: ${address}`).openPopup();
            } else {
                alert('Endereço não encontrado.');
            }
        })
        .catch(err => {
            console.error('Erro ao buscar endereço:', err);
        });
});
