import {
	normalizeScenarioConfig,
	normalizeScenarioEvent,
	parseScenarioText,
} from '../src/satviz/static/widget.js';

function assertEquals(actual, expected) {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

function assert(condition, message) {
	if (!condition) throw new Error(message || 'Assertion failed');
}

Deno.test('normalizeScenarioEvent converts legacy pointGimbal events', () => {
	const input = {
		time: 120,
		type: 'pointGimbal',
		observer: 'Kauai',
		az: 45,
		el: 30,
	};

	assertEquals(normalizeScenarioEvent(input), {
		time: 120,
		type: 'setGimbalAxes',
		observer: 'Kauai',
		axes: { az: 45, el: 30 },
	});
	assertEquals(input, {
		time: 120,
		type: 'pointGimbal',
		observer: 'Kauai',
		az: 45,
		el: 30,
	});
});

Deno.test('normalizeScenarioEvent preserves canonical command events', () => {
	const event = {
		time: 600,
		type: 'trackObject',
		observer: 'Kauai',
		target: 'ISS (ZARYA)',
	};

	assertEquals(normalizeScenarioEvent(event), event);
	assert(normalizeScenarioEvent(event) !== event, 'canonical events should be cloned');
});

Deno.test('normalizeScenarioConfig normalizes only events', () => {
	const config = {
		simulationParameters: { time_step: 60 },
		objects: [{ type: 'GroundEOObservatory', name: 'Kauai' }],
		events: [
			{ time: 1, type: 'pointGimbal', observer: 'Kauai', az: 1, el: 2 },
			{ time: 2, type: 'setGimbalAxes', observer: 'Kauai', axes: { az: 3 } },
		],
	};

	assertEquals(normalizeScenarioConfig(config), {
		simulationParameters: { time_step: 60 },
		objects: [{ type: 'GroundEOObservatory', name: 'Kauai' }],
		events: [
			{ time: 1, type: 'setGimbalAxes', observer: 'Kauai', axes: { az: 1, el: 2 } },
			{ time: 2, type: 'setGimbalAxes', observer: 'Kauai', axes: { az: 3 } },
		],
	});
	assert(config.events[0].type === 'pointGimbal', 'input config should not be mutated');
});

Deno.test('parseScenarioText parses empty input as an empty config', () => {
	assertEquals(parseScenarioText(''), {});
	assertEquals(parseScenarioText(undefined), {});
});
