document.addEventListener('DOMContentLoaded', function () {
    const API_BASE_URL = 'https://map.silasogis.com';

    // --- Basemaps ---
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' });
    const googleSat = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',{ maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'], attribution: '&copy; Google' });
    const baseMaps = { "OpenStreetMap": osm, "Satélite (Google)": googleSat };

    // --- Map Initialization ---
    const map = L.map('map', { layers: [googleSat] }).setView([-14.235, -51.925], 5);
    const layerControl = L.control.layers(baseMaps, {}).addTo(map);

    // --- Layers & State ---
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    let drawnPolygon = null;
    let drawnMarker = null;

    // --- Draw Control ---
    const drawControl = new L.Control.Draw({
        draw: {
            polygon: { shapeOptions: { color: '#4f46e5' } },
            marker: true,
            polyline: false, circlemarker: false, rectangle: false, circle: false
        },
        edit: { featureGroup: drawnItems }
    });
    map.addControl(drawControl);
    
    // --- DOM Elements ---
    const analyzeNdviBtn = document.getElementById('analyze-ndvi-btn');
    const analyzeClimateBtn = document.getElementById('analyze-climate-btn');
    const clearBtn = document.getElementById('clear-btn');
    const addPeriodBtn = document.getElementById('add-period-btn');
    const datePeriodsContainer = document.getElementById('date-periods-container');
    const resultsContainer = document.getElementById('results-container');
    const geocodeInput = document.getElementById('geocode-input');
    const geocodeBtn = document.getElementById('geocode-btn');
    
    let activeTileLayers = {};
    let activeLegends = {};

    // --- Event Listeners ---
    map.on(L.Draw.Event.CREATED, function (event) {
        const type = event.layerType;
        const layer = event.layer;

        if (type === 'polygon') {
            if (drawnPolygon) drawnItems.removeLayer(drawnPolygon);
            drawnPolygon = layer;
        } else if (type === 'marker') {
            if (drawnMarker) drawnItems.removeLayer(drawnMarker);
            drawnMarker = layer;
        }
        drawnItems.addLayer(layer);
        updateAnalyzeButtonsState();
    });

    map.on(L.Draw.Event.EDITED, function (event) {
        // Atualiza as referências se forem editadas
        event.layers.eachLayer(function (layer) {
            if (layer instanceof L.Polygon) drawnPolygon = layer;
            if (layer instanceof L.Marker) drawnMarker = layer;
        });
    });

    map.on(L.Draw.Event.DELETED, function() {
        // Resetar referências ao deletar
        if (!drawnItems.hasLayer(drawnPolygon)) drawnPolygon = null;
        if (!drawnItems.hasLayer(drawnMarker)) drawnMarker = null;
        updateAnalyzeButtonsState();
    });
    
    addPeriodBtn.addEventListener('click', addDatePeriod);
    analyzeNdviBtn.addEventListener('click', handleNdviAnalysis);
    analyzeClimateBtn.addEventListener('click', handleClimateAnalysis);
    clearBtn.addEventListener('click', clearAll);
    geocodeBtn.addEventListener('click', handleGeocode);

    // --- Functions ---
    function updateAnalyzeButtonsState() {
        analyzeNdviBtn.disabled = drawnPolygon === null;
        analyzeClimateBtn.disabled = drawnPolygon === null && drawnMarker === null;
    }

    function addDatePeriod() {
        const periodCount = datePeriodsContainer.children.length + 1;
        const newPeriod = document.createElement('div');
        newPeriod.className = 'date-period-item mb-3 p-3 border rounded-lg bg-gray-50';
        newPeriod.innerHTML = `<label class="block text-sm font-medium text-gray-600 mb-1">Período ${periodCount}</label><div class="flex space-x-2"><input type="date" class="start-date w-full p-2 border rounded-md text-sm"><input type="date" class="end-date w-full p-2 border rounded-md text-sm"></div>`;
        datePeriodsContainer.appendChild(newPeriod);
    }

    function getPeriods() {
        return Array.from(document.querySelectorAll('.date-period-item')).map(item => {
            const start = item.querySelector('.start-date').value;
            const end = item.querySelector('.end-date').value;
            if (!start || !end) return null;
            return [start, end];
        }).filter(p => p);
    }

    async function handleApiRequest(endpoint, payload, analysisType) {
        showLoader(`Analisando ${analysisType}...`);
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erro na API: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            displayError(error.message);
            return null;
        } finally {
            hideLoader();
        }
    }

    async function handleNdviAnalysis() {
        if (!drawnPolygon) {
            alert('Por favor, desenhe um polígono no mapa primeiro.');
            return;
        }
        const periods = getPeriods();
        if (periods.length === 0) {
            alert('Por favor, defina pelo menos um período de data válido.');
            return;
        }
        const payload = {
            roi: drawnPolygon.toGeoJSON().geometry,
            date_periods: periods
        };
        clearResults();
        const result = await handleApiRequest('/ndvi_composite', payload, 'NDVI');
        if (result) displayNdviResults(result);
    }
    
    async function handleClimateAnalysis() {
        let point_coords;
        if (drawnMarker) {
            const latlng = drawnMarker.getLatLng();
            point_coords = [latlng.lng, latlng.lat];
        } else if (drawnPolygon) {
            const centroid = drawnPolygon.getBounds().getCenter();
            point_coords = [centroid.lng, centroid.lat];
        } else {
            alert('Adicione um ponto no mapa ou desenhe um polígono primeiro.');
            return;
        }

        const periods = getPeriods();
        if (periods.length === 0) {
            alert('Por favor, defina pelo menos um período de data válido.');
            return;
        }

        const payload = {
            point: { type: "Point", coordinates: point_coords },
            date_periods: periods
        };
        
        // Limpa apenas resultados, não as camadas de NDVI se existirem
        resultsContainer.innerHTML = '';
        
        const result = await handleApiRequest('/climate_stats', payload, 'Dados Climáticos');
        if (result) {
            if(result.precipitation) displayChirpsResults(result.precipitation);
            if(result.temperature) displayEra5Results(result.temperature);
        }
    }

    function displayNdviResults(data) {
        const { ndvi, ndvi_tiles, image_tiles } = data;
        resultsContainer.innerHTML = ''; // Limpa resultados anteriores
        
        for (const period in ndvi) {
            if (ndvi[period].error) {
                displayError(`NDVI Período ${period.replace('period_','')}: ${ndvi[period].error}`);
                continue;
            }
            const card = createResultCard(`NDVI - ${period.replace('period_','Período ')} (Satélite: ${ndvi[period].satellite})`);
            card.innerHTML += `<p><strong>Média:</strong> ${ndvi[period].ndvi_mean.toFixed(3)}</p><p><strong>Mín:</strong> ${ndvi[period].ndvi_min.toFixed(3)}</p><p><strong>Máx:</strong> ${ndvi[period].ndvi_max.toFixed(3)}</p>`;
            resultsContainer.appendChild(card);
        }

        let ndviLegendAdded = false;
        if (ndvi_tiles) {
            Object.keys(ndvi_tiles).forEach((periodKey, index) => {
                const periodData = ndvi_tiles[periodKey];
                if (periodData.tile_url) {
                    addTileLayer(`NDVI - ${periodKey.replace('period_','P')}`, periodData.tile_url, index === 0);
                    if (!ndviLegendAdded) {
                        addLegend('NDVI', { min: 0, max: 0.8, palette: ['red', 'yellow', 'green'] });
                        ndviLegendAdded = true;
                    }
                }
            });
        }
        if (image_tiles) {
            Object.keys(image_tiles).forEach((periodKey, index) => {
                if (image_tiles[periodKey].tile_url) addTileLayer(`RGB - ${periodKey.replace('period_','P')}`, image_tiles[periodKey].tile_url, false);
            });
        }
    }
    
    function displayChirpsResults(precipitation_stats) {
        for (const period in precipitation_stats) {
            if (precipitation_stats[period].error) {
                displayError(`Precipitação ${period.replace('period_','')}: ${precipitation_stats[period].error}`);
                continue;
            }
            const stats = precipitation_stats[period];
            const card = createResultCard(`Precipitação - ${period.replace('period_','Período ')}`);
            card.innerHTML += `<p><strong>Total no Período:</strong> ${stats.precipitation_sum !== null ? stats.precipitation_sum.toFixed(2) : 'N/D'} mm</p>
                                     <p><strong>Média Diária:</strong> ${stats.precipitation_daily_mean !== null ? stats.precipitation_daily_mean.toFixed(2) : 'N/D'} mm/dia</p>`;
            resultsContainer.appendChild(card);
        }
    }
    
    function displayEra5Results(temperature_stats) {
        for (const period in temperature_stats) {
            if (temperature_stats[period].error) {
                displayError(`Temperatura ${period.replace('period_','')}: ${temperature_stats[period].error}`);
                continue;
            }
            const stats = temperature_stats[period];
            const card = createResultCard(`Temperatura - ${period.replace('period_','Período ')}`);
            card.innerHTML += `<p><strong>Média:</strong> ${stats.temperature_mean_celsius !== null ? stats.temperature_mean_celsius.toFixed(2) : 'N/D'} °C</p>
                                     <p><strong>Máx:</strong> ${stats.temperature_max_celsius !== null ? stats.temperature_max_celsius.toFixed(2) : 'N/D'} °C</p>
                                     <p><strong>Mín:</strong> ${stats.temperature_min_celsius !== null ? stats.temperature_min_celsius.toFixed(2) : 'N/D'} °C</p>`;
            resultsContainer.appendChild(card);
        }
    }
    
    function addTileLayer(name, url, visible = true) {
        const tileLayer = L.tileLayer(url, { opacity: 0.8 });
        if (visible) tileLayer.addTo(map);
        activeTileLayers[name] = tileLayer;
        layerControl.addOverlay(tileLayer, name);
    }
    
    function addLegend(title, visParams) {
        const legend = L.control({position: 'bottomright'});
        legend.onAdd = function (map) {
            const div = L.DomUtil.create('div', 'info-card legend p-2 rounded-md');
            const gradient = visParams.palette.join(',');
            div.innerHTML += `<h4 class="font-bold mb-1">${title}</h4><i style="background: linear-gradient(to top, ${gradient}); height: 80px; width: 20px; display: block; float: left;"></i><div style="float: left; margin-left: 10px; position: relative; height: 80px;"><span style="position: absolute; top: -5px;">${visParams.max.toFixed(1)}</span><span style="position: absolute; bottom: -5px;">${visParams.min.toFixed(1)}</span></div>`;
            return div;
        };
        legend.addTo(map);
        activeLegends[title] = legend;
    }

    function showLoader(message) {
        resultsContainer.innerHTML = `<div class="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-lg"><div class="loader"></div><p class="mt-3 text-gray-600 font-medium">${message}</p></div>`;
    }

    function hideLoader() {
        const loader = resultsContainer.querySelector('.loader')?.parentElement;
        if (loader) loader.remove();
    }
    
    function displayError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg mb-4';
        errorDiv.textContent = `Erro: ${message}`;
        resultsContainer.appendChild(errorDiv);
    }
    
    function createResultCard(title) {
        const card = document.createElement('div');
        card.className = 'p-4 bg-white border rounded-lg shadow-sm mb-4';
        card.innerHTML = `<h3 class="text-md font-bold text-indigo-700 mb-2">${title}</h3>`;
        return card;
    }

    function clearResults() {
        resultsContainer.innerHTML = '';
        Object.values(activeTileLayers).forEach(layer => {
            if (map.hasLayer(layer)) map.removeLayer(layer);
            layerControl.removeLayer(layer);
        });
        activeTileLayers = {};
        Object.values(activeLegends).forEach(legend => map.removeControl(legend));
        activeLegends = {};
    }
    
    function clearAll() {
        clearResults();
        drawnItems.clearLayers();
        drawnPolygon = null;
        drawnMarker = null;
        updateAnalyzeButtonsState();
        
        datePeriodsContainer.innerHTML = `<div class="date-period-item mb-3 p-3 border rounded-lg bg-gray-50"><label class="block text-sm font-medium text-gray-600 mb-1">Período 1</label><div class="flex space-x-2"><input type="date" class="start-date w-full p-2 border rounded-md text-sm" value="2024-01-01"><input type="date" class="end-date w-full p-2 border rounded-md text-sm" value="2024-01-31"></div></div>`;
    }

    async function geocodeAddress(address) {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Erro ao buscar localização.');
            const data = await response.json();
            if (data.length === 0) {
                alert('Endereço não encontrado.');
                return;
            }
            const { lat, lon } = data[0];
            const coords = [parseFloat(lat), parseFloat(lon)];
            map.setView(coords, 14);
            const marker = L.marker(coords).addTo(map);
            marker.bindPopup(`<strong>Localização:</strong> ${address}`).openPopup();
        } catch (error) {
            alert(error.message);
        }
    }

    function handleGeocode() {
        const address = geocodeInput.value.trim();
        if (!address) {
            alert('Por favor, insira um endereço válido.');
            return;
        }
        geocodeAddress(address);
    }
});
