// Inicializando o mapa
var map = L.map('map').setView([-15.7801, -47.9292], 4);

// Definindo camadas base
var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
});

var googleMaps = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google Maps'
});

var esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri'
});

osm.addTo(map);

// Controle de camadas
var baseMaps = {
    "OpenStreetMap": osm,
    "Google Maps": googleMaps,
    "Esri World Imagery": esri
};

L.control.layers(baseMaps).addTo(map);

// Adicionando ferramenta de desenho
var drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

var drawControl = new L.Control.Draw({
    edit: {
        featureGroup: drawnItems
    },
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

// Função para lidar com a criação do polígono pelo usuário
map.on(L.Draw.Event.CREATED, function (event) {
    var layer = event.layer;
    drawnItems.addLayer(layer);
    
    // Extraindo coordenadas do polígono desenhado
    var coords = layer.getLatLngs();

    // Exibir as coordenadas e simular uma requisição para buscar dados ambientais
    document.getElementById('info').innerHTML = "Buscando dados ambientais para a área desenhada...";
    fetchEnvironmentalData(coords);
});

// Função fictícia para simular busca de dados ambientais
function fetchEnvironmentalData(coords) {
    // Normalmente, aqui chamaríamos uma API para buscar os dados ambientais ou relacionados.
    // Como exemplo, apenas simulei uma resposta.
    setTimeout(function() {
        document.getElementById('info').innerHTML = "<b>Dados Ambientais:</b>\n<ul>\n<li>NDVI médio: 0.75</li>\n<li>Área desmatada: 1.2 km²</li>\n</ul>";
    }, 2000);
}

// Adicionando funcionalidade de geocodificação com Nominatim
function geocode() {
    var address = document.getElementById('address');
    if (address && address.value) {
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${address.value}`)
            .then(response => response.json())
            .then(data => {
                if (data && data.length > 0) {
                    var lat = data[0].lat;
                    var lon = data[0].lon;
                    map.setView([lat, lon], 14);
                    L.marker([lat, lon]).addTo(map)
                        .bindPopup(`<b>${address.value}</b>`).openPopup();
                } else {
                    alert('Endereço não encontrado!');
                }
            })
            .catch(error => console.error('Erro na geocodificação:', error));
    }
}

var geocodeButton = document.getElementById('geocodeButton');
if (geocodeButton) {
    geocodeButton.addEventListener('click', geocode);
}

// Adicionando funcionalidade de exportar polígono como GeoJSON
var exportButton = document.getElementById('exportButton');
if (exportButton) {
    exportButton.addEventListener('click', function() {
        var data = drawnItems.toGeoJSON();
        var convertedData = 'text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data));
        var a = document.createElement('a');
        a.href = 'data:' + convertedData;
        a.download = 'dados_geojson.geojson';
        a.click();
    });
}