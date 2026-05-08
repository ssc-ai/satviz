# Scenario JSON Guide

SatViz/SatSimJS consume a simple scenario JSON with three top-level keys:

```json
{
  "simulationParameters": {},
  "objects": [],
  "events": []
}
```

All fields listed below are case-sensitive. Unknown keys are ignored. Times accept ISO strings (UTC recommended) unless noted.

Simulation Parameters

- `start_time: string` — Simulation start (ISO date-time), e.g. `"2025-01-01T00:00:00Z"`.
- `end_time: string` — Simulation stop (ISO). Defaults to 24h after `start_time` if omitted.
- `current_time: string` — Clock current time (ISO). Defaults to `start_time`.
- `time_step: number` — Cesium clock multiplier (seconds of sim-time per real second), e.g. `60`.
- `clock_step: string | number` — One of:
  - `"tick_dependent"`, `"system_clock_multiplier"`, `"system_clock"` or the Cesium enum numeric value.
- `clock_range: string | number` — One of:
  - `"unbounded"`, `"clamped"`, `"loop_stop"` or the Cesium enum numeric value.
- `playback_state: string | boolean` — `"play"`, `"pause"`, `"stop"`, or boolean (`true` animates).

Objects

Supported `type` values (case-insensitive):

- Ground Electro-Optical Observatory
  - `type`: `"GroundEOObservatory"` | `"GroundEO"` | `"Observatory"`
  - Fields:
    - `name: string` — Unique site name.
    - `latitude: number` — Degrees.
    - `longitude: number` — Degrees.
    - `altitude: number` — Meters.
    - `height: number` — Sensor height (pixels/units for FoV model).
    - `width: number` — Sensor width.
    - `y_fov: number` — Vertical field of view (degrees).
    - `x_fov: number` — Horizontal field of view (degrees).
    - `field_of_regard: array` — Optional FoR definition array.
    - `field_rotation: number` — Optional sensor rotation (degrees) about boresight; default 0.

- SGP4 Satellite (from TLE)
  - `type`: `"SGP4Satellite"` | `"SGP4"`
  - Fields:
    - `name: string` — Satellite name (defaults to TLE-derived if omitted).
    - `tle1: string` — Line 1.
    - `tle2: string` — Line 2.
    - `orientation: string` — Orientation strategy (e.g., `"nadir"`).
    - `color: string | [number,number,number]` — CSS color or RGB array (0–255 or 0–1 components). The string `"random"` is supported.

- TLE Catalog (multiple satellites)
  - `type`: `"TLECatalog"` | `"TLEs"` | `"TLEList"`
  - Fields:
    - `data | text: string` — Inline TLE text (2‑line or 3‑line format).
    - `url: string` — If no inline data, fetch from this URL/path.
    - `limit: number` — Maximum satellites to add (default `500000`).
    - `orientation: string` — Orientation for created satellites.
    - `color: string | [number,number,number]` — Visualization color per satellite.

- Two-Body Satellite (initial state)
  - `type`: `"TwoBodySatellite"` | `"TwoBody"`
  - Fields:
    - `name: string` — Object name.
    - `position | initial_position: [number,number,number]` — ECI position in meters.
    - `velocity | initial_velocity: [number,number,number]` — ECI velocity in m/s.
    - `epoch: string` — ISO time for the initial state; if omitted, uses current viewer time.
    - `orientation: string` — Orientation strategy (e.g., `"nadir"`).
    - `color: string | [number,number,number]` — Visualization color.

Events

Events are scheduled with a `time` and a `type`. Times can be:

- `number` — Seconds offset from `simulationParameters.start_time`.
- `string` — ISO timestamp (UTC recommended).

Supported `type` values (case-insensitive):

- `"trackObject"`
  - Fields: `observer: string`, `target: string | null`
  - Sets the observer’s gimbal to track the target at the event time. Use `null` to stop tracking.

- `"setGimbalAxes"`
  - Fields: `observer: string`, `axes: {"az": number, "el": number}`
  - Sets the observer gimbal to a fixed azimuth/elevation.

- `"stepGimbalAxes"`
  - Fields: `observer: string`, `axes | deltas: object`
  - Steps one or more gimbal axes by degrees.

- `"setFsmAxes"` / `"stepFsmAxes"`
  - Fields: `observer: string`, `axes | deltas: {"tip": number, "tilt": number}`
  - Sets or steps fast steering mirror axes.

- `"setSensorZoom"` / `"stepSensorZoom"`
  - Fields: `observer: string`, optional `sensor: string`, and `zoomLevel` or `deltaZoomLevel`.
  - Sets or steps normalized sensor zoom.

- `"setDirectedEnergyActive"`
  - Fields: `observer: string`, `device | sensor: string`, `active: boolean`
  - Enables or disables a laser payload.

- `"airVehicleManeuver"`, `"setAirVehicleVelocityNed"`, `"setAirVehicleAccelerationNed"`, `"setAirVehicleHeading"`
  - Fields: `object | vehicle | name | target: string` plus the command-specific velocity, acceleration, or heading fields.
  - Mutates an air vehicle at the event time.

Runtime-only rate commands such as `"setGimbalAxisRates"`, `"setFsmAxisRates"`, and `"setSensorZoomRate"` are not valid scheduled scenario events. Legacy SatViz `"pointGimbal"` events are normalized to `"setGimbalAxes"` for compatibility, but new scenarios should use canonical command names.

Color Specification

- `"#rrggbb"`, CSS color names, or RGB arrays are accepted.
- Arrays can be either byte `[R,G,B]` in 0–255, or normalized `[r,g,b]` in 0–1.
- The string `"random"` picks a random visible color.

End-to-End Example

```json
{
  "simulationParameters": {
    "start_time": "2025-01-01T00:00:00Z",
    "end_time": "2025-01-01T03:00:00Z",
    "time_step": 60,
    "clock_step": "system_clock_multiplier",
    "clock_range": "loop_stop",
    "playback_state": "play"
  },
  "objects": [
    {
      "type": "GroundEOObservatory",
      "name": "Kauai",
      "latitude": 22.0964,
      "longitude": -159.5261,
      "altitude": 10,
      "height": 100,
      "width": 100,
      "y_fov": 5,
      "x_fov": 5
    },
    {
      "type": "SGP4Satellite",
      "name": "ISS (ZARYA)",
      "tle1": "1 25544U 98067A   24270.51782528  .00008833  00000+0  16184-3 0  9991",
      "tle2": "2 25544  51.6425  60.8533 0005566 332.0513 164.5352 15.50162442429013",
      "orientation": "nadir",
      "color": [0,170,255]
    }
  ],
  "events": [
    { "time": 120, "type": "setGimbalAxes", "observer": "Kauai", "axes": { "az": 45, "el": 30 } },
    { "time": 600, "type": "trackObject", "observer": "Kauai", "target": "ISS (ZARYA)" }
  ]
}
```

SatViz is a browser scenario widget and does not wrap SatSimJS `SimulationRuntime`. Use SatSimJS runtime separately when a workflow needs authoritative sessions, runtime snapshots, or command streams.
