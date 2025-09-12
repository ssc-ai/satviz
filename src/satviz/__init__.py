"""AnyWidget wrapper for SatSimJS (Cesium-based) in Jupyter/Marimo.

This package exposes a simple widget (`SatSimJS`) that loads the SatSim
JavaScript bundle from a CDN and renders a Cesium-based universe.
"""
from __future__ import annotations

from pathlib import Path
from anywidget import AnyWidget
from traitlets import Unicode, Int, Bool, Dict
from importlib.metadata import PackageNotFoundError, version as _pkg_version

try:  # Expose runtime package version
    __version__ = _pkg_version("satviz")
except PackageNotFoundError:  # During local dev/editable installs
    __version__ = "0.0.0"

# Default SatSim assets base (can be overridden per-widget via `satsim_base`)
SATSIM_BASE = "https://cdn.jsdelivr.net/npm/satsim@0.13.0/dist"
# SATSIM_BASE = "http://127.0.0.1:8080/dist"  # Local dev server serving satsimjs

_PKG_DIR = Path(__file__).parent
_STATIC_DIR = _PKG_DIR / "static"

def _read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8")

class SatSimJS(AnyWidget):
        """A minimal SatSim world view using the SatSim CDN bundle (includes Cesium).

        This version hardens sizing so the Cesium canvas reliably fills
        the widget container in notebook/AnyWidget environments.
        """

        # Load CSS/ESM from packaged files and inject URLs.
        _css = _read_text(_STATIC_DIR / "widget.css")

        _esm = _read_text(_STATIC_DIR / "widget.js")

        scenario_data = Unicode("").tag(sync=True)
        satsim_base = Unicode(SATSIM_BASE).tag(sync=True)
        viewer_options = Dict(default_value={
            "showWeatherLayer": False,
            "showNightLayer": False,
            "showLowResEarth": True,
        }).tag(sync=True)
        # Fullscreen rectangle for windowed overlay; values can be numbers
        # (interpreted as px) or CSS strings (e.g., '64px', 'calc(100vh-96px)').
        fullscreen_rect = Dict(default_value={
            "top": 0,
            "left": 0,
            "width": "100vw",
            "height": "100vh",
            "zIndex": 999999,
        }).tag(sync=True)
        debug = Bool(False).tag(sync=True)
        # Action trigger: increment to clear events on the JS side
        clear_events_seq = Int(0).tag(sync=True)
        # Preferred height as CSS string (e.g., '480px', 'calc(100vh - 80px)')
        height = Unicode("480px").tag(sync=True)
        # Backward-compat numeric height in pixels; JS will honor `height` first
        height_px = Int(480).tag(sync=True)

        def __init__(
            self,
            *args,
            scenario_path: str | Path | None = None,
            **kwargs,
        ):
            # Initialization: explicit kwargs > scenario_path
            if "scenario_data" not in kwargs:
                if scenario_path:
                    try:
                        data = _read_text(Path(scenario_path))
                        if data:
                            kwargs["scenario_data"] = data
                    except Exception:
                        pass
            super().__init__(*args, **kwargs)


        # Convenience: embed TLE catalogs from Python (read file, inline as data)
        def add_tle_catalog_data(self, text: str, *, limit: int | None = None, orientation: str | None = None) -> None:
            import json as _json
            # Start from existing scenario or skeleton
            scenario = self.export_scenario()
            obj = {"type": "TLECatalog", "data": text}
            if limit is not None:
                obj["limit"] = int(limit)
            if orientation is not None:
                obj["orientation"] = str(orientation)
            scenario.setdefault("objects", []).append(obj)
            self.scenario_data = _json.dumps(scenario)

        def add_tle_catalog_file(self, path: str | Path, *, limit: int | None = None, orientation: str | None = None) -> None:
            p = Path(path)
            text = _read_text(p)
            self.add_tle_catalog_data(text, limit=limit, orientation=orientation)

        def load_scenario_file(self, path: str | Path) -> None:
            self.scenario_data = _read_text(Path(path))

        def clear_events(self) -> None:
            """Clear queued events in the front-end without reloading scenario.

            This increments a counter trait observed by the JS side and
            triggers `universe.events.clear()` in the widget.
            """
            self.clear_events_seq += 1

        # Scenario export and validation
        def export_scenario(self, *, hours: int = 2) -> dict:
            """Return the parsed scenario from scenario_data.

            If no scenario_data is set, returns a minimal skeleton with
            empty objects and events and a 2-hour window from now.
            """
            import json, datetime
            if self.scenario_data:
                try:
                    return json.loads(self.scenario_data)
                except Exception:
                    pass
            start_dt = datetime.datetime.utcnow().replace(microsecond=0)
            end_dt = start_dt + datetime.timedelta(hours=hours)
            return {
                "simulationParameters": {
                    "start_time": start_dt.isoformat().replace("+00:00", "Z"),
                    "end_time": end_dt.isoformat().replace("+00:00", "Z"),
                    "time_step": 60,
                },
                "objects": [],
                "events": [],
            }

__all__ = [
    'SatSimJS',
]
