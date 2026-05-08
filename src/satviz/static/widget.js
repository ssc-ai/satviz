const DEFAULT_SATSIM_BASE = 'https://cdn.jsdelivr.net/npm/satsim@0.15.0/dist';

function _isPlainObject(value) {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeScenarioEvent(event) {
	if (!_isPlainObject(event)) return event;

	const type = String(event.type || '').trim();
	if (type.toLowerCase() !== 'pointgimbal') {
		return { ...event };
	}

	const axes = _isPlainObject(event.axes) ? { ...event.axes } : {};
	if (event.az !== undefined) axes.az = event.az;
	if (event.el !== undefined) axes.el = event.el;

	const normalized = { ...event, type: 'setGimbalAxes', axes };
	delete normalized.az;
	delete normalized.el;
	return normalized;
}

export function normalizeScenarioConfig(config) {
	if (!_isPlainObject(config)) return {};

	const normalized = { ...config };
	if (Array.isArray(config.events)) {
		normalized.events = config.events.map((event) => normalizeScenarioEvent(event));
	}
	return normalized;
}

export function parseScenarioText(text) {
	return normalizeScenarioConfig(JSON.parse(String(text || '{}')));
}

function _loadScript(url) {
	return new Promise(function (resolve, reject) {
		if (document.querySelector('script[src="' + url + '"]')) return resolve();
		var script = document.createElement('script');
		script.src = url;
		script.onload = function () { resolve(); };
		script.onerror = function () { reject(new Error('Failed to load: ' + url)); };
		document.head.appendChild(script);
	});
}

function _loadCSS(url, target) {
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

function _createShadowRoot(el) {
	return el.shadowRoot || el.attachShadow({ mode: 'open' });
}

function _clearElement(el) {
	while (el.firstChild) el.removeChild(el.firstChild);
}

function _applyViewFormat(container, heightCss) {
	var h = String(heightCss || '480px');
	container.style.cssText = 'width:100%;height:' + h + ';position:relative;background:#000;';
}

function _createContainer(root, heightCss) {
	var container = document.createElement('div');
	container.className = 'satsim-container';
	container.id = 'cesiumContainer-' + Math.random().toString(36).slice(2);
	_applyViewFormat(container, heightCss);
	root.appendChild(container);
	return container;
}

async function _applyRootFormat(root, base, log) {
	var _b = String(base || '').replace(/\/+$/, '');
	await _loadCSS(_b + '/Widgets/widgets.css', root);
	if (log && log.debug) log.debug('widgets.css loaded');
	var style = document.createElement('style');
	style.textContent = [
		'.cesium-widget-credits{ display:none !important; }',
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
}

function _attachContextMenuGuards(root, container) {
	const swallow = function (e) { try { e.preventDefault(); e.stopPropagation(); } catch (_) { } };
	root.addEventListener('contextmenu', swallow, { capture: true });
	container.addEventListener('contextmenu', swallow);
	return function () {
		try { root.removeEventListener('contextmenu', swallow, { capture: true }); } catch (_) { }
		try { container.removeEventListener('contextmenu', swallow); } catch (_) { }
	};
}

function _setupFullscreenOverlay(container, viewer, log, rect) {
	let windowFull = false;
	const originalStyle = container.getAttribute('style') || '';

	function cssVal(v, def) {
		if (v === undefined || v === null || v === '') return def;
		if (typeof v === 'number') return String(v) + 'px';
		return String(v);
	}

	function applyWindowFull(on) {
		windowFull = !!on;
		if (windowFull) {
			const top = cssVal(rect && rect.top, '0px');
			const left = cssVal(rect && rect.left, '0px');
			const width = cssVal(rect && rect.width, '100vw');
			const height = cssVal(rect && rect.height, '100vh');
			const zIndex = rect && rect.zIndex != null ? String(rect.zIndex) : '999999';

			container.style.position = 'fixed';
			container.style.top = top;
			container.style.left = left;
			container.style.width = width;
			container.style.height = height;
			container.style.margin = '0';
			container.style.zIndex = zIndex;
		} else {
			container.setAttribute('style', originalStyle);
		}
		try { viewer.resize(); viewer.scene.requestRender(); } catch (_) { }
	}
	try {
		const fsBtn = container.querySelector('.cesium-fullscreenButton');
		if (fsBtn) {
			fsBtn.addEventListener('click', function (ev) {
				try { ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); } catch (_) { }
				applyWindowFull(!windowFull);
			}, true);
		}
	} catch (e) { if (log && log.error) log.error('fullscreen override error', e); }
	applyWindowFull._isWindowFull = () => windowFull;
	applyWindowFull._setRect = (nextRect) => { rect = nextRect || rect; };
	return applyWindowFull;
}

function _setupResponsiveResize(container, viewer, log) {
	var frameId = null;
	var timeouts = [];
	var ro = null;
	var mo = null;
	var kickResize = function () { try { viewer.resize(); viewer.scene.requestRender(); } catch (e) { if (log && log.error) log.error('resize error', e); } };
	frameId = requestAnimationFrame(kickResize);
	timeouts.push(setTimeout(kickResize, 0));
	timeouts.push(setTimeout(kickResize, 250));
	if ('ResizeObserver' in window) {
		ro = new ResizeObserver(function () { kickResize(); });
		ro.observe(container);
		mo = new MutationObserver(function (muts) {
			muts.forEach(function (m) {
				if ([].slice.call(m.removedNodes).indexOf(container) >= 0) { try { ro.disconnect(); } catch (_e) { } }
			});
		});
		mo.observe(document.body, { childList: true, subtree: true });
	}
	return function () {
		try { if (frameId !== null) cancelAnimationFrame(frameId); } catch (_) { }
		timeouts.forEach(function (id) { try { clearTimeout(id); } catch (_) { } });
		try { if (ro) ro.disconnect(); } catch (_) { }
		try { if (mo) mo.disconnect(); } catch (_) { }
	};
}

function _getModelValue(model, key, fallback) {
	if (model && typeof model.get === 'function') {
		const value = model.get(key);
		return value === undefined || value === null ? fallback : value;
	}
	return fallback;
}

function _getHeightCss(model) {
	return _getModelValue(model, 'height', '') || (_getModelValue(model, 'height_px', 480) + 'px');
}

function _getViewerOptions(model) {
	var vopts = _getModelValue(model, 'viewer_options', {}) || {};
	try { if (typeof vopts === 'string') vopts = JSON.parse(vopts || '{}'); } catch (_) { vopts = {}; }
	return vopts;
}

function _getFullscreenRect(model) {
	return _getModelValue(model, 'fullscreen_rect', { top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 999999 }) || {};
}

function _escapeHtml(input) {
	return String(input)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function _showError(container, error) {
	const message = error && error.message ? error.message : String(error);
	container.innerHTML = '<div style="padding:12px;border-radius:8px;background:#fff5f5;border:2px solid #f5c2c2;color:#a00;font-family:Arial,sans-serif;"><strong>SatSim error:</strong><div>' + _escapeHtml(message) + '</div></div>';
}

function _getSatSim() {
	const satSim = globalThis['SatSim'];
	if (!satSim) throw new Error('SatSim bundle loaded but global SatSim was not found.');
	return satSim;
}


async function render({ model, el }) {

	const DEBUG = !!(model && typeof model.get === 'function' && model.get('debug'));
	const log = {
		debug: (...a) => { if (!DEBUG) return; try { console.log('[satviz]', ...a); } catch (_) { } },
		warn: (...a) => { try { console.warn('[satviz]', ...a); } catch (_) { } },
		error: (...a) => { try { console.error('[satviz]', ...a); } catch (_) { } },
	};

	log.debug('render start');

	if (el && typeof el.__satvizCleanup === 'function') {
		try { el.__satvizCleanup(); } catch (_) { }
	}

	var root = _createShadowRoot(el);
	_clearElement(root);
	var heightCss = _getHeightCss(model);
	var container = _createContainer(root, heightCss);
	var disposers = [];
	var cleanupContextMenu = null;
	var cleanupResize = null;
	var removePreUpdate = null;
	var universe = null;
	var viewer = null;
	var applyWindowFull = null;

	function emitSelection(picked) {
		log.debug('object picked', picked && picked.name);
		if (picked) {
			const value = picked.name
			model.set('selected_object', value)
		} else {
			model.set('selected_object', '')
		}
		model.save_changes()
		log.debug('selected_object trait updated');
	}

	function applySelectedObject() {
		if (!viewer || !viewer.entities) return;
		var name = String(_getModelValue(model, 'selected_object', '') || '').trim();
		var values = viewer.entities.values || [];
		var match = null;
		if (name) {
			for (var i = 0; i < values.length; i += 1) {
				var entity = values[i];
				if (!entity) continue;
				if (String(entity.name || '').trim() === name) { match = entity; break; }
				if (entity.simObjectRef && String(entity.simObjectRef.name || '').trim() === name) { match = entity; break; }
			}
		}
		viewer.selectedEntity = match || undefined;
		viewer.lastPicked = match ? (match.simObjectRef || match) : undefined;
		try { viewer.scene.requestRender(); } catch (_) { }
	}

	function destroyScene() {
		var oldViewer = viewer;
		var oldRemovePreUpdate = removePreUpdate;
		var oldCleanupResize = cleanupResize;
		removePreUpdate = null;
		cleanupResize = null;
		applyWindowFull = null;
		viewer = null;
		universe = null;

		try { if (oldCleanupResize) oldCleanupResize(); } catch (_) { }
		try { if (oldRemovePreUpdate) oldRemovePreUpdate(); } catch (_) { }
		try {
			if (oldViewer && typeof oldViewer.destroy === 'function') {
				if (typeof oldViewer.isDestroyed !== 'function' || !oldViewer.isDestroyed()) {
					oldViewer.destroy();
				}
			}
		} catch (e) {
			log.warn('viewer destroy error', e);
		}
		_clearElement(container);
		_applyViewFormat(container, _getHeightCss(model));
	}

	function rebuildScene() {
		const config = parseScenarioText(_getModelValue(model, 'scenario_data', ''));
		const keepWindowFull = !!(applyWindowFull && applyWindowFull._isWindowFull && applyWindowFull._isWindowFull());
		destroyScene();

		const SatSim = _getSatSim();
		universe = new SatSim.Universe();
		viewer = SatSim.createViewer(container, universe, _getViewerOptions(model));
		viewer.objectPickListener = function (picked, _lastPicked) {
			emitSelection(picked);
		};

		applyWindowFull = _setupFullscreenOverlay(container, viewer, log, _getFullscreenRect(model));
		cleanupResize = _setupResponsiveResize(container, viewer, log);

		SatSim.Scenario.loadScenario(universe, viewer, config);

		const sceneForListener = viewer.scene;
		const universeForListener = universe;
		const onPreUpdate = function (_scene, time) {
			try { universeForListener.update(time); } catch (e) { log.error('universe.update error', e); }
		};
		sceneForListener.preUpdate.addEventListener(onPreUpdate);
		removePreUpdate = function () {
			try { sceneForListener.preUpdate.removeEventListener(onPreUpdate); } catch (_) { }
		};

		if (keepWindowFull && applyWindowFull) {
			applyWindowFull(true);
		}
		applySelectedObject();
		log.debug('scenario loaded');
	}

	function reloadScene() {
		try {
			rebuildScene();
		} catch (e) {
			log.error('scenario reload error', e);
			destroyScene();
			_showError(container, e);
		}
	}

	function updateHeight() {
		try { if (applyWindowFull && applyWindowFull._isWindowFull && applyWindowFull._isWindowFull()) return; } catch (_) { }
		container.style.height = String(_getHeightCss(model));
		try { if (viewer) { viewer.resize(); viewer.scene.requestRender(); } } catch (e) { log.error('resize error', e); }
	}

	function updateFullscreenRect() {
		try {
			if (applyWindowFull && applyWindowFull._setRect) {
				applyWindowFull._setRect(_getFullscreenRect(model));
			}
			if (applyWindowFull && applyWindowFull._isWindowFull && applyWindowFull._isWindowFull()) {
				applyWindowFull(true);
			}
			if (viewer) { viewer.resize(); viewer.scene.requestRender(); }
		} catch (e) { log.error('fullscreen rect update error', e); }
	}

	function clearEvents() {
		log.debug('trait changed (action)', 'clear_events_seq');
		if (universe && universe.events && typeof universe.events.clear === 'function') {
			universe.events.clear();
		}
		log.debug('events cleared');
	}

	function onModel(eventName, handler) {
		if (model && typeof model.on === 'function') {
			model.on(eventName, handler);
			disposers.push(function () {
				try { if (typeof model.off === 'function') model.off(eventName, handler); } catch (_) { }
			});
		}
	}

	try {
		// Configure SatSim asset base dynamically (python trait `satsim_base`)
		const _modelBase = (model && typeof model.get === 'function' && model.get('satsim_base')) || '';
		const _base = String(_modelBase || DEFAULT_SATSIM_BASE).replace(/\/+$/, '');
		window.CESIUM_BASE_URL = _base + '/';
		await _loadScript(_base + '/satsim.js');

		await _applyRootFormat(root, _base, log);
		cleanupContextMenu = _attachContextMenuGuards(root, container);
		disposers.push(function () {
			try { if (cleanupContextMenu) cleanupContextMenu(); } catch (_) { }
		});

		onModel('change:selected_object', applySelectedObject);
		onModel('change:fullscreen_rect', updateFullscreenRect);
		onModel('change:height', updateHeight);
		onModel('change:height_px', updateHeight);
		onModel('change:scenario_data', function () {
			log.debug('trait changed (scenario)', 'scenario_data');
			reloadScene();
		});
		onModel('change:clear_events_seq', clearEvents);
		disposers.push(destroyScene);
		el.__satvizCleanup = function () {
			disposers.splice(0).forEach(function (dispose) {
				try { dispose(); } catch (_) { }
			});
			try { delete el.__satvizCleanup; } catch (_) { el.__satvizCleanup = undefined; }
		};

		reloadScene();
		log.debug('render done');

	} catch (error) {
		log.error('init error', error);
		_showError(container, error);
	}
}

export default { render };
