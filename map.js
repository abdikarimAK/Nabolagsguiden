/* ============================================================
   map.js — Leaflet map, markers, category toggles, legend
   ============================================================ */

'use strict';

const MapModule = (() => {

    let map = null;
    let layerGroups = {}; // { categoryId: L.LayerGroup }
    let activeFilters = new Set(); // category ids currently shown
    let currentResult = null;

    function init(result, radius) {
        currentResult = result;
        const container = document.getElementById('map-container');

        if (map) { map.remove(); map = null; }
        layerGroups = {};
        activeFilters = new Set(result.categoryScores.map(cs => cs.category.id));

        map = L.map(container, { zoomControl: false, attributionControl: false })
            .setView([result.lat, result.lon], radius <= 500 ? 16 : radius <= 1000 ? 15 : radius <= 2000 ? 14 : 13);

        L.control.zoom({ position: 'bottomleft' }).addTo(map);
        L.control.attribution({ position: 'bottomright' }).addTo(map);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd', maxZoom: 20,
        }).addTo(map);

        _addRadiusCircle(result.lat, result.lon, radius);
        _addHomeMarker(result);
        _addPoiMarkers(result);
        _invalidate();
    }

    function _addRadiusCircle(lat, lon, radius) {
        if (!map) return;
        const circle = L.circle([lat, lon], {
            radius: 0, color: '#2D5F3F', weight: 1.5,
            opacity: .4, fillColor: '#2D5F3F', fillOpacity: .05, dashArray: '5 10',
        }).addTo(map);

        let cur = 0;
        const step = radius / 50;
        function grow() {
            cur = Math.min(cur + step, radius);
            circle.setRadius(cur);
            if (cur < radius) requestAnimationFrame(grow);
        }
        setTimeout(() => requestAnimationFrame(grow), 600);
    }

    function _addHomeMarker(result) {
        if (!map) return;
        const icon = L.divIcon({
            className: 'map-home-marker', html: '',
            iconSize: [16, 16], iconAnchor: [8, 8],
        });
        L.marker([result.lat, result.lon], { icon, zIndexOffset: 1000 })
            .addTo(map)
            .bindPopup(`
        <div style="font-family:'DM Sans',sans-serif">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#2D5F3F;margin-bottom:4px">Søkt adresse</div>
          <div style="font-weight:500;font-size:13px">${result.address}</div>
          <div style="font-size:12px;color:#7d7368;margin-top:3px">Score: <strong>${result.totalScore}/100</strong></div>
        </div>
      `);
    }

    function _addPoiMarkers(result) {
        if (!map) return;
        result.categoryScores.forEach(cs => {
            const group = L.layerGroup().addTo(map);
            layerGroups[cs.category.id] = group;

            cs.places.forEach(place => {
                const icon = L.divIcon({
                    className: 'map-poi-marker',
                    html: `<div style="background:${place.categoryColor};width:100%;height:100%;border-radius:50%"></div>`,
                    iconSize: [12, 12], iconAnchor: [6, 6],
                });
                L.marker([place.lat, place.lon], { icon })
                    .addTo(group)
                    .bindPopup(`
            <div style="font-family:'DM Sans',sans-serif">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
                <span style="font-size:15px">${cs.category.icon}</span>
                <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${place.categoryColor}">${cs.category.label}</span>
              </div>
              <div style="font-weight:500;font-size:13px;margin-bottom:2px">${place.name}</div>
              <div style="font-size:11px;color:#7d7368">${place.address}</div>
            </div>
          `);
            });
        });
    }

    function addSecondMarker(result) {
        if (!map) return;
        // Orange home marker for comparison address
        const icon = L.divIcon({
            className: '',
            html: `<div style="
        width:16px;height:16px;border-radius:50%;
        background:#d4915e;border:3px solid #fff;
        box-shadow:0 4px 12px rgba(212,145,94,.45);
      "></div>`,
            iconSize: [16, 16], iconAnchor: [8, 8],
        });
        L.marker([result.lat, result.lon], { icon, zIndexOffset: 900 })
            .addTo(map)
            .bindPopup(`
        <div style="font-family:'DM Sans',sans-serif">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#d4915e;margin-bottom:4px">Sammenligningsadresse</div>
          <div style="font-weight:500;font-size:13px">${result.address}</div>
          <div style="font-size:12px;color:#7d7368;margin-top:3px">Score: <strong>${result.totalScore}/100</strong></div>
        </div>
      `);

        // Fit map to show both addresses
        try {
            if (currentResult) {
                const bounds = L.latLngBounds(
                    [currentResult.lat, currentResult.lon],
                    [result.lat, result.lon]
                ).pad(0.2);
                map.fitBounds(bounds, { animate: true });
            }
        } catch (_) {}
    }

    function toggleCategory(categoryId, visible) {
        if (!map) return;
        const group = layerGroups[categoryId];
        if (!group) return;
        if (visible) {
            if (!map.hasLayer(group)) group.addTo(map);
            activeFilters.add(categoryId);
        } else {
            if (map.hasLayer(group)) map.removeLayer(group);
            activeFilters.delete(categoryId);
        }
    }

    function destroy() {
        if (map) { map.remove(); map = null; }
        layerGroups = {};
        activeFilters = new Set();
        currentResult = null;
    }

    function invalidate() { _invalidate(); }

    function _invalidate() {
        if (!map) return;
        [50, 300, 700, 1200].forEach(ms => setTimeout(() => map?.invalidateSize(), ms));
    }

    return { init, destroy, toggleCategory, addSecondMarker, invalidate };
})();