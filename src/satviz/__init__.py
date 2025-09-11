"""Marimo integration for satellite visualization using Cesium."""
from __future__ import annotations

from pathlib import Path
from anywidget import AnyWidget
from traitlets import Unicode, Int, Bool, Dict

# Default SatSim assets base (can be overridden per-widget via `satsim_base`)
SATSIM_BASE = "https://cdn.jsdelivr.net/npm/satsim@0.12.0/dist"
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
        debug = Bool(False).tag(sync=True)
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

        # Scenario export and validation
        def export_scenario(self, *, hours: int = 2) -> dict:
            """Return the parsed DMAC scenario from scenario_data.

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
