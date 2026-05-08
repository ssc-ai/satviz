# SatViz Python Interface

This package exposes a Jupyter/Marimo widget `SatSimJS` that renders a Cesium-based SatSimJS viewer loaded from a CDN and driven by a JSON "scenario".

Installation

```sh
pip install satviz
```

Quickstart (Jupyter)

```python
from satviz import SatSimJS
w = SatSimJS(height="600px")
w
```

Quickstart (Marimo)

```python
import marimo as mo
from satviz import SatSimJS

widget = SatSimJS(height="900px")
w = mo.ui.anywidget(widget)
w
```

Class: `satviz.SatSimJS`

- Constructor
  - `SatSimJS(*, scenario_path: str | Path | None = None, **kwargs)`
  - If `scenario_data` is not provided, and `scenario_path` is given, the file contents are loaded as the scenario.

- Traits (sync to JS)
  - `scenario_data: str` — Raw scenario JSON string. Updating this reloads the scenario.
  - `satsim_base: str` — Base URL for SatSim assets; defaults to `https://cdn.jsdelivr.net/npm/satsim@0.15.0/dist`. Override this for local development, for example `http://127.0.0.1:8081/dist`.
  - `viewer_options: dict` — Options forwarded to SatSimJS `createViewer`.
    - Recognized keys include:
      - `showLowResEarth: bool` — Use built-in low-res basemap.
      - `showNightLayer: bool` — Enable NASA Black Marble night layer.
      - `showWeatherLayer: bool` — Enable OpenWeatherMap cloud layer (requires `weatherApiKey`).
      - `weatherApiKey: str` — API key for weather layer tiles.
      - `infoBox2: bool`, `toolbar2: bool`, `enableObjectSearch: bool` — UI features.
  - `fullscreen_rect: dict` — Override for overlay fullscreen rectangle. Values accept numbers (pixels) or CSS strings.
    - Keys: `top`, `left`, `width`, `height`, `zIndex`.
  - `debug: bool` — Enables extra logging in the JS widget.
  - `clear_events_seq: int` — Action counter; incrementing clears the universe event queue on the JS side.
  - `height: str` — Preferred CSS height (e.g., `"480px"`, `"calc(100vh - 80px)"`).
  - `height_px: int` — Backward-compat height in pixels; ignored when `height` is set.
  - `selected_object: str` — Name of the currently selected object. Setting this selects and highlights the entity by name in the viewer.

- Methods
  - `add_tle_catalog_data(text: str, *, limit: int | None = None, orientation: str | None = None) -> None`
    - Parses inline TLE text and appends those objects to the scenario (via `TLECatalog`).
  - `add_tle_catalog_file(path: str | Path, *, limit: int | None = None, orientation: str | None = None) -> None`
    - Reads a local file and forwards contents to `add_tle_catalog_data`.
  - `load_scenario_file(path: str | Path) -> None`
    - Loads a scenario JSON file directly into `scenario_data`.
  - `clear_events() -> None`
    - Clears queued events in the front-end without reloading the scenario.
  - `export_scenario(*, hours: int = 2) -> dict`
    - Returns the current parsed scenario. If `scenario_data` is empty or invalid, returns a minimal skeleton with `simulationParameters` covering a 2‑hour window from now and empty `objects`/`events`.

Example: fullscreen overlay and selection

```python
from satviz import SatSimJS

w = SatSimJS(
    height="600px",
    fullscreen_rect={"top": 64, "left": 0, "width": "100vw", "height": "calc(100vh - 96px)", "zIndex": 10000},
    viewer_options={"showLowResEarth": True, "showNightLayer": False, "showWeatherLayer": False},
)

# Select an object by name in the viewer (if it exists in the scenario)
w.selected_object = "ISS (ZARYA)"
```

Example: building a scenario in Python

```python
from satviz import SatSimJS
import json

w = SatSimJS(height="600px")

# Start from current scenario (or skeleton if empty)
scenario = w.export_scenario()

# Set simulation time window and cadence
scenario["simulationParameters"] = {
    "start_time": "2025-01-01T00:00:00Z",
    "end_time": "2025-01-01T06:00:00Z",
    "time_step": 60,                      # seconds per second (clock multiplier)
    "clock_step": "system_clock_multiplier",
    "clock_range": "loop_stop",
    "playback_state": "play",
}

# Add a ground EO observatory and a SGP4 satellite
scenario["objects"] = [
    {
        "type": "GroundEOObservatory",
        "name": "Kauai",
        "latitude": 22.0964,
        "longitude": -159.5261,
        "altitude": 10,
        "height": 100,
        "width": 100,
        "y_fov": 5,
        "x_fov": 5,
        "field_of_regard": [],
    },
    {
        "type": "SGP4",
        "name": "ISS (ZARYA)",
        "tle1": "1 25544U 98067A   24270.51782528  .00008833  00000+0  16184-3 0  9991",
        "tle2": "2 25544  51.6425  60.8533 0005566 332.0513 164.5352 15.50162442429013",
        "orientation": "nadir",
        "color": "#00aaff",
    },
]

# Queue some events
scenario["events"] = [
    {"time": 120, "type": "setGimbalAxes", "observer": "Kauai", "axes": {"az": 45, "el": 30}},
    {"time": 600, "type": "trackObject", "observer": "Kauai", "target": "ISS (ZARYA)"},
]

w.scenario_data = json.dumps(scenario)
```

Notes

- `scenario_data` updates trigger a full reload in the widget. For smoother updates, prefer batching edits in Python and assigning a single JSON string.
- `selected_object` matches either the entity name or the underlying simulation object name; set to an empty string to clear selection.
- The widget loads SatSimJS and Cesium from `satsim_base`; offline/mirrored hosting is supported by pointing to a local bundle that exposes `satsim.js` and Cesium `Widgets/widgets.css`.
- Scenario events should use SatSimJS command-refactor names such as `setGimbalAxes`, `stepGimbalAxes`, `trackObject`, `setFsmAxes`, `setSensorZoom`, `setDirectedEnergyActive`, and air-vehicle commands. Runtime-only rate commands are not valid scheduled scenario events.
- SatViz does not wrap SatSimJS `SimulationRuntime`; use a separate SatSimJS runtime server/client for authoritative sessions and runtime command streams.
