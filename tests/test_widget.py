import json
import tempfile
import unittest
from pathlib import Path

from satviz import SatSimJS


class SatSimJSTest(unittest.TestCase):
    def test_default_satsim_base_targets_015(self):
        widget = SatSimJS()
        self.assertEqual(
            widget.satsim_base,
            "https://cdn.jsdelivr.net/npm/satsim@0.15.1/dist",
        )

    def test_export_scenario_returns_existing_json(self):
        scenario = {
            "simulationParameters": {"time_step": 60},
            "objects": [{"type": "GroundEOObservatory", "name": "Kauai"}],
            "events": [],
        }
        widget = SatSimJS(scenario_data=json.dumps(scenario))
        self.assertEqual(widget.export_scenario(), scenario)

    def test_export_scenario_returns_skeleton_for_empty_data(self):
        widget = SatSimJS()
        scenario = widget.export_scenario(hours=1)
        self.assertEqual(scenario["objects"], [])
        self.assertEqual(scenario["events"], [])
        self.assertEqual(scenario["simulationParameters"]["time_step"], 60)
        self.assertIn("start_time", scenario["simulationParameters"])
        self.assertIn("end_time", scenario["simulationParameters"])

    def test_scenario_path_loads_scenario_data(self):
        scenario = {
            "simulationParameters": {"time_step": 1},
            "objects": [],
            "events": [],
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "scenario.json"
            path.write_text(json.dumps(scenario), encoding="utf-8")

            widget = SatSimJS(scenario_path=path)

        self.assertEqual(json.loads(widget.scenario_data), scenario)

    def test_add_tle_catalog_data_appends_catalog_object(self):
        tle = "\n".join(
            [
                "ISS (ZARYA)",
                "1 25544U 98067A   24270.51782528  .00008833  00000+0  16184-3 0  9991",
                "2 25544  51.6425  60.8533 0005566 332.0513 164.5352 15.50162442429013",
            ]
        )
        widget = SatSimJS(scenario_data=json.dumps({"objects": [], "events": []}))

        widget.add_tle_catalog_data(tle, limit=1, orientation="nadir")

        scenario = json.loads(widget.scenario_data)
        self.assertEqual(
            scenario["objects"],
            [
                {
                    "type": "TLECatalog",
                    "data": tle,
                    "limit": 1,
                    "orientation": "nadir",
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
