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
    return applyWindowFull;
}

function _setupResponsiveResize(container, viewer, log) {
	var kickResize = function () { try { viewer.resize(); viewer.scene.requestRender(); } catch (e) { if (log && log.error) log.error('resize error', e); } };
	requestAnimationFrame(kickResize);
	setTimeout(kickResize, 0);
	setTimeout(kickResize, 250);
	if ('ResizeObserver' in window) {
		var ro = new ResizeObserver(function () { kickResize(); });
		ro.observe(container);
		var mo = new MutationObserver(function (muts) {
			muts.forEach(function (m) {
				if ([].slice.call(m.removedNodes).indexOf(container) >= 0) { try { ro.disconnect(); } catch (_e) { } }
			});
		});
		mo.observe(document.body, { childList: true, subtree: true });
	}
}


async function render({ model, el }) {

	const DEBUG = !!(model && typeof model.get === 'function' && model.get('debug'));
	const log = {
		debug: (...a) => { if (!DEBUG) return; try { console.log('[satviz]', ...a); } catch (_) { } },
		warn: (...a) => { try { console.warn('[satviz]', ...a); } catch (_) { } },
		error: (...a) => { try { console.error('[satviz]', ...a); } catch (_) { } },
	};

	try {


		// Configure SatSim asset base dynamically (python trait `satsim_base`)
		const _modelBase = (model && typeof model.get === 'function' && model.get('satsim_base')) || '';
		const _defaultBase = 'https://cdn.jsdelivr.net/npm/satsim@0.13.0/dist';
		const _base = String(_modelBase || _defaultBase).replace(/\/+$/, '');
		window.CESIUM_BASE_URL = _base + '/';
		await _loadScript(_base + '/satsim.js');

		// Shadow root + container + formatting
		var root = _createShadowRoot(el);
		var heightCss = (model.get && model.get('height')) || (((model.get && model.get('height_px')) || 480) + 'px');
		var container = _createContainer(root, heightCss);
		_attachContextMenuGuards(root, container);
		await _applyRootFormat(root, _base, log);

		// Universe + viewer
		var universe = new SatSim.Universe();
		var vopts = (model && typeof model.get === 'function' && model.get('viewer_options')) || {};
		try { if (typeof vopts === 'string') vopts = JSON.parse(vopts || '{}'); } catch (_) { vopts = {}; }
		var viewer = SatSim.createViewer(container, universe, vopts);

		// Fullscreen overlay rect (top, left, width, height, zIndex)
		var rect = (model && typeof model.get === 'function' && model.get('fullscreen_rect')) || { top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 999999 };
		var applyWindowFull = _setupFullscreenOverlay(container, viewer, log, rect);
		model.on('change:fullscreen_rect', function () {
			try {
				rect = (model && typeof model.get === 'function' && model.get('fullscreen_rect')) || rect;
				if (applyWindowFull && applyWindowFull._isWindowFull && applyWindowFull._isWindowFull()) {
					applyWindowFull(true);
				}
				viewer.resize(); viewer.scene.requestRender();
			} catch (e) { log.error('fullscreen rect update error', e); }
		});
		_setupResponsiveResize(container, viewer, log);

		// Load scenario
		var data = model.get('scenario_data');
		SatSim.Scenario.loadScenarioFromText(universe, viewer, data);

		// Add update loop
		viewer.scene.preUpdate.addEventListener(function (scene, time) {
			try { universe.update(time); } catch (e) { log.error('universe.update error', e); }
		});

		// React to changes
		function _updateHeight() {
			// Ignore height changes while in overlay fullscreen
			try { if (applyWindowFull && applyWindowFull._isWindowFull && applyWindowFull._isWindowFull()) return; } catch (_) {}
			var newH = (model.get && model.get('height')) || (((model.get && model.get('height_px')) || 480) + 'px');
			container.style.height = String(newH);
			try { viewer.resize(); viewer.scene.requestRender(); } catch (e) { log.error('resize error', e); }
		}
		model.on('change:height', _updateHeight);
		model.on('change:height_px', _updateHeight);

		// @TODO optimize: diff and apply changes instead of full reload
		model.on('change:scenario_data', function () {
			log.debug('trait changed (scenario)', 'scenario_data');
			var data = model.get('scenario_data');
			SatSim.Scenario.loadScenarioFromText(universe, viewer, data);
			log.debug('scenario loaded');
		});

		// Dedicated clear-events hook driven from Python (increments a counter)
		model.on('change:clear_events_seq', function () {
			log.debug('trait changed (action)', 'clear_events_seq');
			universe.events.clear();
			log.debug('events cleared');
		});

		log.debug('viewer ready');

	} catch (error) {
		log.error('init error', error);
		el.innerHTML = '<div style="padding:12px;border-radius:8px;background:#fff5f5;border:2px solid #f5c2c2;color:#a00;font-family:Arial,sans-serif;"><strong>❌ SatSim error:</strong><div>' + (error && error.message ? error.message : String(error)) + '</div></div>';
	}
}

export default { render };
