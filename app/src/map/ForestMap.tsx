import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ColumnLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import type { FootprintSummary } from '../types';
import 'maplibre-gl/dist/maplibre-gl.css';

const GIBS_TILES =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2019-06-19/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg';

interface ForestMapProps {
  bbox: [number, number, number, number];
  footprints: FootprintSummary[];
  selectedShot: string;
  firePerimeter?: { type: 'Polygon'; coordinates: number[][][] } | null;
  fireOpacity?: number;
  onSelect: (shot: string) => void;
  readoutRh100?: number;
}

function rhColor(rh100: number): [number, number, number, number] {
  const t = Math.min(1, Math.max(0, (rh100 - 60) / 45));
  return [
    Math.round(196 + t * (110 - 196)),
    Math.round(106 + t * (228 - 106)),
    Math.round(58 + t * (240 - 58)),
    215,
  ];
}

function removeFireLayers(map: maplibregl.Map) {
  if (map.getLayer('fire-perimeter-line')) map.removeLayer('fire-perimeter-line');
  if (map.getLayer('fire-perimeter-fill')) map.removeLayer('fire-perimeter-fill');
  if (map.getSource('fire-perimeter')) map.removeSource('fire-perimeter');
}

export function ForestMap({ bbox, footprints, selectedShot, firePerimeter, fireOpacity = 0.25, onSelect, readoutRh100 }: ForestMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [showGibs, setShowGibs] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const [minLon, minLat, maxLon, maxLat] = bbox;
    const center: [number, number] = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap',
          },
          gibs: {
            type: 'raster',
            tiles: [GIBS_TILES],
            tileSize: 256,
            attribution: 'NASA GIBS MODIS Terra true color · 2019-06-19 · context only',
            maxzoom: 9,
          },
          terrainSource: {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            encoding: 'terrarium',
            tileSize: 256,
            maxzoom: 15,
          },
        },
        layers: [
          { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.45 } },
          { id: 'gibs', type: 'raster', source: 'gibs', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.7 } },
        ],
      },
      center,
      zoom: 9.5,
      pitch: 55,
      bearing: -12,
      maxPitch: 70,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.on('load', () => {
      map.setTerrain({ source: 'terrainSource', exaggeration: 1.4 });
    });

    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);
    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      overlay.setProps({ layers: [] });
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, [bbox]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer('gibs')) return;
    map.setLayoutProperty('gibs', 'visibility', showGibs ? 'visible' : 'none');
  }, [showGibs]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const layers: Layer[] = [
      new ColumnLayer<FootprintSummary>({
        id: 'footprints',
        data: footprints,
        diskResolution: 12,
        radius: 12.5,
        elevationScale: 1,
        getPosition: (d) => [d.lon, d.lat],
        getFillColor: (d) =>
          d.shot === selectedShot ? [110, 228, 240, 255] : rhColor(d.rh100_m),
        getElevation: (d) => d.rh100_m,
        pickable: true,
        onClick: (info) => {
          if (info.object) onSelect((info.object as FootprintSummary).shot);
        },
        updateTriggers: {
          getFillColor: [selectedShot],
        },
      }),
    ];

    overlay.setProps({ layers });
  }, [footprints, selectedShot, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    const selected = footprints.find((f) => f.shot === selectedShot);
    if (!map || !selected) return;
    map.flyTo({ center: [selected.lon, selected.lat], zoom: 11.5, pitch: 60, duration: 900 });
  }, [selectedShot, footprints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!firePerimeter) {
        removeFireLayers(map);
        return;
      }
      if (!map.getSource('fire-perimeter')) {
        map.addSource('fire-perimeter', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: firePerimeter },
        });
        map.addLayer({
          id: 'fire-perimeter-fill',
          type: 'fill',
          source: 'fire-perimeter',
          paint: { 'fill-color': '#c46a3a', 'fill-opacity': fireOpacity },
        });
        map.addLayer({
          id: 'fire-perimeter-line',
          type: 'line',
          source: 'fire-perimeter',
          paint: { 'line-color': '#e08a4c', 'line-width': 2 },
        });
      } else {
        map.setPaintProperty('fire-perimeter-fill', 'fill-opacity', fireOpacity);
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [firePerimeter, fireOpacity]);

  const rh = readoutRh100 ?? footprints.find((f) => f.shot === selectedShot)?.rh100_m;

  return (
    <div className="map-frame">
      <div ref={containerRef} className="maplibre-shell" role="application" aria-label="3D terrain map with GEDI footprints" />
      {rh != null && (
        <div className="scan-readout">
          <span>Selected pulse</span>
          <strong>{rh.toFixed(1)}</strong>
          <em>m canopy top</em>
        </div>
      )}
      <button type="button" className="map-toggle" onClick={() => setShowGibs((v) => !v)}>
        {showGibs ? 'GIBS on · 2019-06-19 · context only' : 'Show NASA GIBS imagery'}
      </button>
    </div>
  );
}
