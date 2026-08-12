import proof from '../../data/forest_xray_client.json';
import './styles.css';

const fmt = (value, digits = 1) => Number(value).toFixed(digits);
const proofShot = proof.selected_profile;
const samples = proof.footprints;
let selectedIndex = 0;

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  });
  children.forEach((child) => node.append(child));
  return node;
};

const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
};

function metric(label, value, suffix, accent = '') {
  return el('div', { class: `metric ${accent}` }, [
    el('span', { class: 'metric-label', text: label }),
    el('strong', { text: value }),
    el('span', { class: 'metric-suffix', text: suffix }),
  ]);
}

function projectPoint(item) {
  const [minLon, minLat, maxLon, maxLat] = proof.bbox;
  return {
    x: 7 + ((item.lon - minLon) / (maxLon - minLon)) * 86,
    y: 8 + (1 - (item.lat - minLat) / (maxLat - minLat)) * 84,
  };
}

function makeMap() {
  const wrap = el('div', { class: 'map-shell' });
  const svg = svgEl('svg', { viewBox: '0 0 100 100', role: 'img', 'aria-label': 'Redwood GEDI footprint map' });
  const defs = svgEl('defs');
  const pattern = svgEl('pattern', { id: 'grid', width: '10', height: '10', patternUnits: 'userSpaceOnUse' });
  pattern.append(svgEl('path', { d: 'M 10 0 L 0 0 0 10', fill: 'none', stroke: '#284842', 'stroke-width': '.18', opacity: '.72' }));
  defs.append(pattern);
  const glow = svgEl('filter', { id: 'glow' });
  glow.append(svgEl('feGaussianBlur', { stdDeviation: '.8', result: 'blur' }));
  const merge = svgEl('feMerge');
  merge.append(svgEl('feMergeNode', { in: 'blur' }), svgEl('feMergeNode', { in: 'SourceGraphic' }));
  glow.append(merge);
  defs.append(glow);
  svg.append(defs);
  svg.append(svgEl('rect', { width: 100, height: 100, fill: 'url(#grid)' }));
  svg.append(svgEl('path', { d: 'M2,89 C18,78 12,62 28,54 S43,32 58,39 S74,11 99,7 L99,99 L2,99Z', fill: '#0d2922', opacity: '.9' }));
  svg.append(svgEl('path', { d: 'M0 23 C19 16 25 31 42 24 S69 23 100 14', fill: 'none', stroke: '#34715e', 'stroke-width': '.45', opacity: '.7' }));
  svg.append(svgEl('path', { d: 'M0 65 C15 55 22 71 37 62 S74 64 100 47', fill: 'none', stroke: '#34715e', 'stroke-width': '.35', opacity: '.6' }));
  const trails = svgEl('g', { opacity: '.38', fill: 'none', stroke: '#8bbf83', 'stroke-width': '.16' });
  [[4,78,29,63],[20,93,45,69],[38,90,61,55],[58,91,82,38],[71,78,96,26]].forEach(([x1,y1,x2,y2]) => trails.append(svgEl('path', { d: `M${x1},${y1} Q${(x1+x2)/2-4},${(y1+y2)/2+7} ${x2},${y2}` })));
  svg.append(trails);
  const points = svgEl('g', { class: 'map-points' });
  samples.forEach((item, i) => {
    const p = projectPoint(item);
    const g = svgEl('g', { class: `map-point ${i === selectedIndex ? 'is-selected' : ''}`, 'data-index': i, tabindex: '0', role: 'button', 'aria-label': `Footprint ${item.shot}` });
    g.append(svgEl('circle', { cx: p.x, cy: p.y, r: i === selectedIndex ? 2.25 : 1.05, class: 'point-halo' }));
    g.append(svgEl('circle', { cx: p.x, cy: p.y, r: i === selectedIndex ? 1.15 : '.55', class: 'point-core' }));
    g.addEventListener('click', () => select(i));
    g.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') select(i); });
    points.append(g);
  });
  svg.append(points);
  const labels = el('div', { class: 'map-labels' }, [
    el('span', { class: 'map-label park', text: 'REDWOOD NSP' }),
    el('span', { class: 'map-label north', text: 'N 42°' }),
    el('span', { class: 'map-label west', text: 'W 124°' }),
  ]);
  wrap.append(svg, labels);
  return wrap;
}

function makeWaveform() {
  const values = proofShot.waveform_dn;
  const width = 640; const height = 170; const pad = { l: 35, r: 15, t: 14, b: 25 };
  const max = Math.max(...values) * 1.04;
  const x = (i) => pad.l + (i / (values.length - 1)) * (width - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `${line} L ${x(values.length - 1)},${height - pad.b} L ${x(0)},${height - pad.b} Z`;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', class: 'chart-svg', role: 'img', 'aria-label': 'GEDI received waveform' });
  [0, .5, 1].forEach((tick) => {
    const yy = y(max * tick);
    svg.append(svgEl('line', { x1: pad.l, x2: width - pad.r, y1: yy, y2: yy, class: 'chart-grid' }));
  });
  svg.append(svgEl('path', { d: area, class: 'wave-area' }), svgEl('path', { d: line, class: 'wave-line' }));
  svg.append(svgEl('line', { x1: pad.l, x2: width - pad.r, y1: height - pad.b, y2: height - pad.b, class: 'chart-axis' }));
  const dnLabel = svgEl('text', { x: 5, y: pad.t + 4, class: 'chart-label' }); dnLabel.textContent = 'DN'; svg.append(dnLabel);
  const sampleLabel = svgEl('text', { x: width - 78, y: height - 6, class: 'chart-label' }); sampleLabel.textContent = 'sample index'; svg.append(sampleLabel);
  return el('div', { class: 'chart-wrap' }, [svg]);
}

function makeProfile() {
  const values = proofShot.canopy.cover_z;
  const width = 640; const height = 145; const pad = { l: 35, r: 15, t: 12, b: 25 };
  const x = (v) => pad.l + v * (width - pad.l - pad.r);
  const y = (i) => pad.t + (i / (values.length - 1)) * (height - pad.t - pad.b);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(v).toFixed(2)},${y(i).toFixed(2)}`).join(' ');
  const area = `M${pad.l},${pad.t} ${line.slice(1)} L${pad.l},${height - pad.b} Z`;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', class: 'chart-svg profile-interactive', role: 'img', tabindex: '0', 'aria-label': 'Canopy cover vertical profile. Hover to read a height band.' });
  [0, .5, 1].forEach((tick) => svg.append(svgEl('line', { x1: x(tick), x2: x(tick), y1: pad.t, y2: height - pad.b, class: 'chart-grid' })));
  svg.append(svgEl('path', { d: area, class: 'profile-area' }), svgEl('path', { d: line, class: 'profile-line' }));
  svg.append(svgEl('line', { x1: pad.l, x2: width - pad.r, y1: height - pad.b, y2: height - pad.b, class: 'chart-axis' }));
  const topLabel = svgEl('text', { x: 5, y: pad.t + 4, class: 'chart-label' }); topLabel.textContent = 'top'; svg.append(topLabel);
  const groundLabel = svgEl('text', { x: 5, y: height - pad.b, class: 'chart-label' }); groundLabel.textContent = 'ground'; svg.append(groundLabel);
  const coverLabel = svgEl('text', { x: width - 75, y: height - 6, class: 'chart-label' }); coverLabel.textContent = 'cover →'; svg.append(coverLabel);
  const cursor = svgEl('line', { x1: pad.l, x2: pad.l, y1: pad.t, y2: height - pad.b, class: 'profile-cursor', opacity: '0' });
  svg.append(cursor);
  const readout = el('div', { class: 'profile-hover-readout', 'aria-live': 'polite', text: 'Hover the profile to inspect a height band.' });
  const wrap = el('div', { class: 'chart-wrap profile-chart' }, [svg, readout]);
  const updateReadout = (event) => {
    const rect = svg.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const index = Math.round(t * (values.length - 1));
    const cover = values[index] * 100;
    const aboveGround = (1 - index / (values.length - 1)) * (proofShot.canopy.highest_return_elevation_m - proofShot.canopy.ground_elevation_m);
    const cursorY = pad.t + t * (height - pad.t - pad.b);
    cursor.setAttribute('y1', cursorY.toFixed(2));
    cursor.setAttribute('y2', cursorY.toFixed(2));
    cursor.setAttribute('opacity', '1');
    readout.textContent = `About ${fmt(aboveGround, 0)} m above ground · ${fmt(cover, 0)}% canopy cover`;
  };
  svg.addEventListener('pointermove', updateReadout);
  svg.addEventListener('pointerleave', () => { cursor.setAttribute('opacity', '0'); readout.textContent = 'Hover the profile to inspect a height band.'; });
  svg.addEventListener('focus', () => {
    const fake = { clientY: svg.getBoundingClientRect().top + svg.getBoundingClientRect().height * .5 };
    updateReadout(fake);
  });
  return wrap;
}

function makeHowToRead() {
  const steps = [
    ['01', 'Pick a dot', 'Each dot is one 25 m circle on the ground. It is where the satellite sent a laser pulse.'],
    ['02', 'Follow the squiggle', 'The waveform is the echo. Bigger bumps mean more laser energy bounced back from leaves, branches, or the ground.'],
    ['03', 'Read the numbers', 'RH100 is the top of the measured return. RH50 is the halfway height. COVER is how leafy the circle looks to the sensor.'],
  ];
  return el('section', { class: 'how-to panel' }, [
    el('div', { class: 'how-to-intro' }, [
      el('span', { class: 'kicker', text: 'START HERE' }),
      el('h2', { text: 'How to read this, like you are five' }),
      el('p', { text: 'Think of GEDI as a space flashlight. It shines down, listens to the echo, and turns that echo into a forest height story.' }),
    ]),
    el('div', { class: 'how-to-steps' }, steps.map(([number, title, body]) => el('article', { class: 'how-to-step' }, [
      el('span', { class: 'step-number', text: number }),
      el('h3', { text: title }),
      el('p', { text: body }),
    ]))),
    el('div', { class: 'how-to-tip' }, [el('span', { class: 'tip-icon', text: '↕' }), el('span', { text: 'Try hovering the green canopy profile. It tells you what is happening at that height.' })]),
  ]);
}

function makeApp() {
  const root = document.querySelector('#app');
  root.replaceChildren();
  const selected = samples[selectedIndex];
  const header = el('header', { class: 'topbar' }, [
    el('div', { class: 'brand' }, [el('span', { class: 'brand-mark', text: '⌁' }), el('div', {}, [el('strong', { text: 'FOREST X-RAY' }), el('small', { text: 'ORBITAL CANOPY OBSERVATORY' })])]),
    el('div', { class: 'header-meta' }, [el('span', { class: 'live-dot' }), el('span', { text: 'LOCAL PROOF MODE' }), el('span', { class: 'version-chip', text: `GEDI V${proof.collection_version}` })]),
  ]);
  const hero = el('section', { class: 'hero' }, [
    el('div', { class: 'eyebrow', text: 'REDWOOD NATIONAL & STATE PARKS · CALIFORNIA' }),
    el('h1', { text: 'Read the forest in layers.' }),
    el('p', { text: 'A measured scan of canopy structure, returned photon energy, and terrain. One footprint at a time.' }),
  ]);
  const mapPanel = el('section', { class: 'panel map-panel' }, [
    el('div', { class: 'panel-head' }, [el('div', {}, [el('span', { class: 'kicker', text: '01 · ORBITAL SWEEP' }), el('h2', { text: 'Footprint field' })]), el('span', { class: 'panel-count', text: `${proof.joined_high_quality_footprints.toLocaleString()} JOINED` })]),
    makeMap(),
    el('div', { class: 'map-legend' }, [el('span', { class: 'legend-dot selected' }), el('span', { text: 'selected footprint' }), el('span', { class: 'legend-dot' }), el('span', { text: 'high-quality returns' }), el('span', { class: 'map-note', text: '25 m nominal footprint' })]),
  ]);
  const side = el('section', { class: 'panel xray-panel' });
  side.append(el('div', { class: 'panel-head' }, [el('div', {}, [el('span', { class: 'kicker', text: '02 · SELECTED RETURN' }), el('h2', { text: 'Canopy x-ray' })]), el('button', { class: 'ghost-button', text: 'COPY SHOT ID' })]));
  const identity = el('div', { class: 'identity' }, [el('div', { class: 'beam-tag', text: selected.beam }), el('div', { class: 'shot-id', text: String(selected.shot) }), el('div', { class: 'coordinates', text: `${fmt(selected.lat, 5)}° N  ·  ${fmt(Math.abs(selected.lon), 5)}° W` })]);
  side.append(identity);
  const metrics = el('div', { class: 'metric-grid' });
  metrics.append(metric('RH100', fmt(selected.rh100_m), 'm', 'lime'), metric('RH50', fmt(selected.rh50_m), 'm'), metric('COVER', fmt(proofShot.canopy.cover * 100), '%', 'amber'), metric('GROUND', fmt(proofShot.canopy.ground_elevation_m), 'm'));
  side.append(metrics);
  side.append(el('div', { class: 'chart-section' }, [el('div', { class: 'chart-title' }, [el('span', { text: 'RETURNED ENERGY' }), el('span', { text: `${proofShot.waveform_dn.length.toLocaleString()} bins` })]), makeWaveform()]));
  side.append(el('div', { class: 'chart-section' }, [el('div', { class: 'chart-title' }, [el('span', { text: 'CANOPY COVER PROFILE' }), el('span', { text: 'top → ground' })]), makeProfile()]));
  const appGrid = el('main', { class: 'main-grid' }, [mapPanel, side]);
  const provenance = el('section', { class: 'provenance panel' }, [
    el('div', {}, [el('span', { class: 'kicker', text: 'TRACEABILITY' }), el('h2', { text: 'What this scan is, and is not' })]),
    el('p', { text: 'This view is built from a joined GEDI Level 1B waveform, Level 2A relative heights, and Level 2B canopy structure. It is a scientific footprint visualization, not a literal photograph or reconstruction of individual trees.' }),
    el('div', { class: 'source-list' }, [
      el('a', { href: 'https://gedi.umd.edu/dataproducts/products/', target: '_blank', rel: 'noreferrer', text: 'NASA GEDI products ↗' }),
      el('a', { href: 'https://epqs.nationalmap.gov/v1/docs', target: '_blank', rel: 'noreferrer', text: 'USGS 3DEP terrain ↗' }),
      el('a', { href: 'https://nasa-gibs.github.io/gibs-api-docs/access-basics/', target: '_blank', rel: 'noreferrer', text: 'NASA GIBS imagery ↗' }),
    ]),
  ]);
  root.append(header, hero, makeHowToRead(), appGrid, provenance, el('footer', { class: 'footer' }, [el('span', { text: `PROOF CAPTURED ${proof.generated_on}` }), el('span', { text: 'NO BACKEND · STATIC NASA-DERIVED FIXTURE' })]));
  side.querySelector('.ghost-button').addEventListener('click', async (event) => {
    try { await navigator.clipboard.writeText(String(selected.shot)); event.currentTarget.textContent = 'COPIED'; setTimeout(() => { event.currentTarget.textContent = 'COPY SHOT ID'; }, 1200); } catch { event.currentTarget.textContent = 'SHOT ' + String(selected.shot).slice(-6); }
  });
}

function select(index) { selectedIndex = index; makeApp(); }
makeApp();
