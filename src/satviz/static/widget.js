function loadScript(url) {
	return new Promise(function (resolve, reject) {
		if (document.querySelector('script[src="' + url + '"]')) return resolve();
		var script = document.createElement('script');
		script.src = url;
		script.onload = function () { resolve(); };
		script.onerror = function () { reject(new Error('Failed to load: ' + url)); };
		document.head.appendChild(script);
	});
}

window.CESIUM_BASE_URL = '__SATSIM_BASE__/';
await loadScript(
	"__SATSIM_BASE__/satsim.js"
);

function loadCSS(url, target) {
	// Attach stylesheet inside the provided target (document or shadowRoot)
	target = target || document.head;
	var exists = (target.querySelector && target.querySelector('link[href="' + url + '"]')) || null;
	if (!exists) {
		var link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = url;
		target.appendChild(link);
		return new Promise(function (resolve) {
			link.addEventListener('load', resolve, { once: true });
			setTimeout(resolve, 500);
		});
	}
	return Promise.resolve();
}


async function render({ model, el }) {

	const DEBUG = !!(model && typeof model.get === 'function' && model.get('debug'));
	const log = {
		debug: (...a) => { if (!DEBUG) return; try { console.log('[satviz]', ...a); } catch (_) { } },
		warn: (...a) => { try { console.warn('[satviz]', ...a); } catch (_) { } },
		error: (...a) => { try { console.error('[satviz]', ...a); } catch (_) { } },
	};

	try {
		// Shadow root to isolate from page CSS (prevents overrides)
		var root = el.shadowRoot || el.attachShadow({ mode: 'open' });

		// Create and insert container inside shadow root
		var container = document.createElement('div');
		container.className = 'satsim-container';
		container.id = 'cesiumContainer-' + Math.random().toString(36).slice(2);
		var h = (model.get('height_px') || 480) + 'px';
		container.style.cssText = 'width:100%;height:' + h + ';position:relative;background:#000;';
		root.appendChild(container);
		log.debug('container created', { height: h });

		// Prevent host apps (e.g., JupyterLab) from showing their context menu
		// when right-clicking inside the Cesium canvas. This keeps interactions
		// (e.g., right-drag) uninterrupted.
		const swallowContextMenu = function (e) {
			try { e.preventDefault(); e.stopPropagation(); } catch (_) { }
		};
		// Capture contextmenu events inside the shadow root
		root.addEventListener('contextmenu', swallowContextMenu, { capture: true });
		container.addEventListener('contextmenu', swallowContextMenu);

		await loadCSS('__SATSIM_BASE__/Widgets/widgets.css', root);
		log.debug('widgets.css loaded');

		// Minimal overrides in the shadow root
		var style = document.createElement('style');
		style.textContent = [
			// Hide Cesium credits entirely inside the shadow root
			'.cesium-widget-credits{ display:none !important; }',
			// Ensure container fills viewport when fullscreen is active
			'.satsim-container:fullscreen{ width:100vw !important; height:100vh !important; }',
			'.satsim-container:-webkit-full-screen{ width:100vw !important; height:100vh !important; }',
			'.cesium-animation-shuttleRingPointer{',
			'  fill:#c8e1ff !important;',
			'  stroke:#2a2a2a !important;',
			'  stroke-width:1 !important;',
			'}',
			'.cesium-animation-shuttleRingSwoosh line{',
			'  stroke:#8ac !important;',
			'  stroke-width:3 !important;',
			'  stroke-opacity:0.25 !important;',
			'  stroke-linecap:round !important;',
			'}',
			'.cesium-animation-shuttleRingSwoosh{ opacity:1 !important; }'
		].join('\n');
		root.appendChild(style);

		if (typeof window.SatSim === 'undefined') throw new Error('SatSim bundle not found.');
		// Cesium classes are re-exported off SatSim (e.g., SatSim.Color, SatSim.JulianDate).
		log.debug('cesium via SatSim exports', !!(SatSim && SatSim.Color && SatSim.JulianDate));

		// Universe + viewer
		var universe = new SatSim.Universe();
		var viewer = SatSim.createViewer(container, universe, {
			showWeatherLayer: false,
			showNightLayer: false,
		});
		log.debug('viewer created');

		// Replace Cesium's native fullscreen with a window-sized overlay inside the page.
		// This avoids entering browser/OS fullscreen while giving a maximized view.
		let windowFull = false;
		const originalStyle = container.getAttribute('style') || '';
		function applyWindowFull(on) {
			windowFull = !!on;
			if (windowFull) {
				container.style.position = 'fixed';
				container.style.top = '0';
				container.style.left = '0';
				container.style.width = '100vw';
				container.style.height = '100vh';
				container.style.zIndex = '999999';
			} else {
				container.setAttribute('style', originalStyle);
			}
			try { viewer.resize(); viewer.scene.requestRender(); } catch (_) { }
		}

		// Intercept the fullscreen button click to toggle the window overlay instead of OS fullscreen.
		try {
			const fsBtn = container.querySelector('.cesium-fullscreenButton');
			if (fsBtn) {
				fsBtn.addEventListener('click', function (ev) {
					try { ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); } catch (_) { }
					applyWindowFull(!windowFull);
				}, true); // capture to pre-empt Cesium handler
			}
		} catch (e) {
			log.error('fullscreen override error', e);
		}

		// Let SatSim/Cesium manage the canvas size based on container dimensions.
		// Trigger a resize soon after mount and when the container changes size.
		var kickResize = function () { try { viewer.resize(); viewer.scene.requestRender(); } catch (e) { log.error('resize error', e); } };
		requestAnimationFrame(kickResize);
		setTimeout(kickResize, 0);
		setTimeout(kickResize, 250);
		if ('ResizeObserver' in window) {
			var ro = new ResizeObserver(function () { kickResize(); });
			ro.observe(container);
			var mo = new MutationObserver(function (muts) {
				muts.forEach(function (m) {
					if ([].slice.call(m.removedNodes).indexOf(el) >= 0) { try { ro.disconnect(); } catch (_e) { } }
				});
			});
			mo.observe(document.body, { childList: true, subtree: true });
		}

		// Hide credits programmatically too (belt-and-suspenders)
		var credit = viewer.cesiumWidget && viewer.cesiumWidget.creditContainer;
		if (credit) {
			credit.style.display = 'none';
		}
		log.debug('credits hidden', !!credit);

		// ---- Sensor/observatory helper (used by scenario) ----
		function addObservatory(obs) {
			if (!obs || !obs.name) return;
			if (universe.hasObject(obs.name)) return; // avoid duplicates
			var o = universe.addGroundElectroOpticalObservatory(
				obs.name,
				Number(obs.latitude),
				Number(obs.longitude),
				Number(obs.altitude || 0),
				'AzElGimbal',
				Number(obs.height || 100),
				Number(obs.width || 100),
				Number(obs.y_fov || 5),
				Number(obs.x_fov || 5),
				obs.field_of_regard || []
			);
			var desc = '<div><b>' + obs.name + '</b><br>Latitude: ' + obs.latitude + ' deg<br>Longitude: ' + obs.longitude + ' deg<br>Altitude: ' + (obs.altitude || 0) + ' m</div>';
			try { viewer.addObservatoryVisualizer(o, desc); } catch (e) { log.error('addObservatoryVisualizer error', e); }
		}

		// (no standalone sensors loader; scenario drives creation)

		// ---- Two-body satellites (JSON) ----
		function addTwoBodyViz(entry, idx) {
			var name = entry.name || ('TwoBody-' + (idx + 1));
			if (universe.hasObject(name)) return;
			var r = entry.position ?? entry.r_m ?? entry.r ?? entry.r_km ?? entry.position_km;
			var v = entry.velocity ?? entry.v_m_s ?? entry.v ?? entry.v_km_s ?? entry.velocity_km_s;
			var r_m = r;
			var v_m_s = v;
			var posUnits = (entry.position_units || entry.r_units || '').toLowerCase();
			var velUnits = (entry.velocity_units || entry.v_units || '').toLowerCase();
			// Normalize to meters and m/s
			if (Array.isArray(entry.r_km) || Array.isArray(entry.position_km) || posUnits.includes('km'))
				r_m = [r[0] * 1000, r[1] * 1000, r[2] * 1000];
			if (Array.isArray(entry.v_km_s) || Array.isArray(entry.velocity_km_s) || velUnits.includes('km'))
				v_m_s = [v[0] * 1000, v[1] * 1000, v[2] * 1000];
			if (!Array.isArray(r_m) || !Array.isArray(v_m_s)) { log.warn('invalid two-body vectors', entry); return; }
			var R = new SatSim.Cartesian3(Number(r_m[0]), Number(r_m[1]), Number(r_m[2]));
			var V = new SatSim.Cartesian3(Number(v_m_s[0]), Number(v_m_s[1]), Number(v_m_s[2]));
			var t = entry.epoch ? SatSim.JulianDate.fromDate(new Date(entry.epoch)) : viewer.clock.currentTime.clone();
			var orientation = entry.orientation || 'nadir';
			var s = universe.addTwoBodySatellite(name, R, V, t, orientation, false, true);
			if (!viewer || typeof viewer.addObjectVisualizer !== 'function') {
				throw new Error('viewer.addObjectVisualizer is not available');
			}
			var color = SatSim.Color && SatSim.Color.fromRandom ? new SatSim.Color.fromRandom({ alpha: 1.0 }) : undefined;
			var desc = 'Two-body initial state @ ' + (entry.epoch || 'current') + '<br>r[m]=' + JSON.stringify(r_m) + '<br>v[m/s]=' + JSON.stringify(v_m_s);
			var lead = (s && s.period) ? (s.period / 2) : 1800;
			var trail = (s && s.period) ? (s.period / 2) : 1800;
			var res = (s && s.period && s.eccentricity !== undefined) ? (s.period / (500 / (1 - s.eccentricity))) : 60;
			viewer.addObjectVisualizer(s, desc, {
				path: { show: false, leadTime: lead, trailTime: trail, resolution: res, material: color, width: 1 },
				point: { show: true, pixelSize: 5, color: color, outlineColor: color }
			});
		}

		function loadTwoBodiesFromText(text) {
			try {
				var arr = JSON.parse(text || '[]');
				if (Array.isArray(arr)) arr.forEach(addTwoBodyViz);
			} catch (e) { log.error('two-bodies JSON parse error', e); }
		}

		async function loadTwoBodiesInitial() {
			var data = model.get('tbodies_data');
			var url = model.get('tbodies_url');
			if (data && data.trim().length) {
				loadTwoBodiesFromText(data);
			} else if (url) {
				try { var res = await fetch(url); var txt = await res.text(); loadTwoBodiesFromText(txt); } catch (e) { log.error('tbodies fetch error', e); }
			}
		}

		function reloadTwoBodiesOnChange() {
			['tbodies_url', 'tbodies_data'].forEach(function (p) {
				model.on('change:' + p, function () {
					log.debug('trait changed (two-bodies)', p);
					loadTwoBodiesInitial();
				});
			});
		}

		// (no standalone satellite/clock watchers; scenario drives setup)

		// ---- DMAC Scenario loader ----
		async function applySimulationParameters(params) {
			if (!params) return;
			try {
				var start = params.start_time ? SatSim.JulianDate.fromDate(new Date(params.start_time)) : viewer.clock.startTime;
				var stop = params.end_time ? SatSim.JulianDate.fromDate(new Date(params.end_time)) : SatSim.JulianDate.addSeconds(start, 24 * 3600, new SatSim.JulianDate());
				viewer.clock.startTime = start.clone();
				viewer.clock.currentTime = start.clone();
				viewer.clock.stopTime = stop.clone();
				if (params.time_step) {
					// If step specified, use multiplier stepping as an approximation unless user switched to tick
					var step = Number(params.time_step);
					if (!isNaN(step)) viewer.clock.multiplier = step;
				}
			} catch (e) { log.error('applySimulationParameters error', e); }
		}

		// ---- TLE helpers ----
		function parseTleText(text, limit) {
			var lines = (text || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
			var out = []; var i = 0;
			while (i < lines.length && out.length < (limit || 1e9)) {
				var a = lines[i];
				var b = lines[i + 1] || '';
				var c = lines[i + 2] || '';
				if (/^1\s/.test(a) && /^2\s/.test(b)) {
					var name = (a.substring(2, 7) || 'SAT').trim();
					out.push({ name: name, l1: a, l2: b });
					i += 2;
				} else if (a && /^1\s/.test(b) && /^2\s/.test(c)) {
					out.push({ name: a, l1: b, l2: c });
					i += 3;
				} else {
					i += 1;
				}
			}
			return out;
		}

		function addSatelliteVizFromTLE(name, l1, l2, orientation) {
			const s = universe.addSGP4Satellite(name, l1, l2, orientation || 'nadir', true);
			if (!viewer || typeof viewer.addObjectVisualizer !== 'function') {
				throw new Error('viewer.addObjectVisualizer is not available');
			}
			const color = SatSim.Color && SatSim.Color.fromRandom ? new SatSim.Color.fromRandom({ alpha: 1.0 }) : undefined;
			const lead = (s && s.period) ? (s.period / 2) : 1800;
			const trail = (s && s.period) ? (s.period / 2) : 1800;
			const res = (s && s.period && s.eccentricity !== undefined) ? (s.period / (500 / (1 - s.eccentricity))) : 60;
			viewer.addObjectVisualizer(s, 'TLE', {
				path: { show: false, leadTime: lead, trailTime: trail, resolution: res, material: color, width: 1 },
				point: { show: true, pixelSize: 5, color: color, outlineColor: color }
			});
		}

		async function addTleCatalog(obj) {
			try {
				const limit = Number(obj.limit || 50);
				let text = obj.data || obj.text || null;
				if (!text) {
					const url = obj.url || obj.path;
					if (!url) { log.warn('TLECatalog missing url or data'); return; }
					const res = await fetch(url);
					text = await res.text();
				}
				const list = parseTleText(text, limit);
				list.slice(0, limit).forEach((sat) => {
					addSatelliteVizFromTLE(sat.name, sat.l1, sat.l2, obj.orientation);
				});
				log.debug('TLECatalog loaded', (list || []).length);
			} catch (e) {
				log.error('TLECatalog error', e);
			}
		}

		function addObjectFromScenario(obj) {
			if (!obj || !obj.type) return;
			switch ((obj.type || '').toLowerCase()) {
				case 'groundeoobservatory':
				case 'groundeo':
				case 'observatory':
					addObservatory({
						name: obj.name,
						latitude: obj.latitude,
						longitude: obj.longitude,
						altitude: obj.altitude,
						height: (obj.height != null ? obj.height : obj.sensor_height),
						width: (obj.width != null ? obj.width : obj.sensor_width),
						y_fov: obj.y_fov,
						x_fov: obj.x_fov,
						field_of_regard: obj.field_of_regard,
					});
					break;
				case 'sgp4satellite':
				case 'sgp4':
					addSatelliteVizFromTLE(obj.name || (obj.tle1 || '').trim(), obj.tle1, obj.tle2, obj.orientation);
					break;
				case 'tlecatalog':
				case 'tles':
				case 'tlelist':
					addTleCatalog(obj);
					break;
				case 'twobodysatellite':
				case 'twobody':
					addTwoBodyViz({
						name: obj.name,
						position: (obj.position != null ? obj.position : obj.initial_position),
						velocity: (obj.velocity != null ? obj.velocity : obj.initial_velocity),
						epoch: obj.epoch,
						orientation: obj.orientation
					});
					break;
			}
		}

		function scheduleScenarioEvents(events) {
			if (!Array.isArray(events)) return;
			var scheduled = events.map(function (ev) {
				var t = ev.time; var jd;
				if (typeof t === 'number') {
					// seconds offset from start
					jd = SatSim.JulianDate.addSeconds(viewer.clock.startTime, t, new SatSim.JulianDate());
				} else if (typeof t === 'string') {
					jd = SatSim.JulianDate.fromDate(new Date(t));
				}
				return { type: ev.type, jd: jd, observer: ev.observer, target: ev.target, fired: false };
			}).filter(function (e) { return e.jd; });

			if (!scheduled.length) return;
			viewer.scene.preUpdate.addEventListener(function (scene, time) {
				scheduled.forEach(function (ev) {
					if (ev.fired) return;
					if (SatSim.JulianDate.lessThan(ev.jd, time) || SatSim.JulianDate.equals(ev.jd, time)) {
						try {
							if ((ev.type || '').toLowerCase() === 'trackobject') {
								var site = universe.getObject(ev.observer);
								var target = universe.getObject(ev.target);
								// If site lookup returns the ground site, find its observatory bundle for gimbal
								var obs = null;
								if (site) {
									var arr = universe._observatories || [];
									for (var i = 0; i < arr.length; i++) if (arr[i].site && arr[i].site.name === ev.observer) { obs = arr[i]; break; }
								}
								if (obs && target) {
									obs.gimbal.trackMode = 'rate';
									obs.gimbal.trackObject = target;
								}
							}
						} catch (e) { log.error('scenario event error', e); }
						ev.fired = true;
					}
				});
			});
		}

		function loadScenarioFromText(text) {
			try {
				var cfg = JSON.parse(text || '{}');
				if (!cfg) return false;
				if (cfg.simulationParameters) applySimulationParameters(cfg.simulationParameters);
				if (Array.isArray(cfg.objects)) cfg.objects.forEach(addObjectFromScenario);
				if (Array.isArray(cfg.events)) scheduleScenarioEvents(cfg.events);
				return true;
			} catch (e) { log.error('scenario parse error', e); return false; }
		}

		async function loadScenarioInitial() {
			var data = model.get('scenario_data');
			var url = model.get('scenario_url');
			if (data && data.trim().length) { return loadScenarioFromText(data); }
			if (url) {
				try { var res = await fetch(url); var txt = await res.text(); return loadScenarioFromText(txt); } catch (e) { log.error('scenario fetch error', e); }
			}
			return false;
		}

		function reloadScenarioOnChange() {
			['scenario_url', 'scenario_data'].forEach(function (p) {
				model.on('change:' + p, function () {
					log.debug('trait changed (scenario)', p);
					loadScenarioInitial();
				});
			});
		}

		const loadedScenario = await loadScenarioInitial();
		if (loadedScenario) {
			reloadScenarioOnChange();
		}

		// Focus the camera on loaded objects if any entities are present
		try {
			if (viewer && viewer.entities && viewer.entities.values && viewer.entities.values.length > 0) {
				viewer.zoomTo(viewer.entities);
				log.debug('zoomed to entities');
			}
		} catch (_) { }

		// Update simulation each frame
		viewer.scene.preUpdate.addEventListener(function (scene, time) {
			try { universe.update(time); } catch (e) { log.error('universe.update error', e); }
		});

		// React to runtime height changes from Python
		model.on('change:height_px', function () {
			var newH = (model.get('height_px') || 480) + 'px';
			container.style.height = newH;
			kickResize();
		});


		log.debug('viewer ready');
	} catch (error) {
		log.error('init error', error);
		el.innerHTML = '<div style="padding:12px;border-radius:8px;background:#fff5f5;border:2px solid #f5c2c2;color:#a00;font-family:Arial,sans-serif;"><strong>❌ SatSim error:</strong><div>' + (error && error.message ? error.message : String(error)) + '</div></div>';
	}
}

export default { render };

