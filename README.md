# SatViz

SatSim source code was developed under contract with AFRL/RDSM, and is approved for public release under Public Affairs release approval #AFRL-2022-1116.

The SatSimJS widget for Jupyter and Marimo.

![alt text](image.png)

## Installation

```sh
pip install satviz
```

or with [uv](https://github.com/astral-sh/uv):

```sh
uv add satviz
```

## Usage

Jupyter

```python
from satviz import SatSimJS
w = SatSimJS(height="1000px")
w
```

Marimo

```python
import marimo as mo
from satviz import SatSimJS

widget = SatSimJS(height="900px")
w = mo.ui.anywidget(widget)
w
```

### Configuring fullscreen rectangle

Reserve space for headers/footers by customizing the overlay fullscreen rectangle from Python. Values can be numbers (pixels) or CSS strings.

```python
from satviz import SatSimJS

w = SatSimJS(
    height="600px",                      # height when not fullscreen
    fullscreen_rect={
        "top": 64,                       # e.g., top banner height
        "left": 0,
        "width": "100vw",                # or e.g., "100vw"
        "height": "calc(100vh - 96px)",  # subtract top+bottom banners
        "zIndex": 10000,                 # optional overlay stacking order
    },
)
w
```

## Release

To build and publish a release to PyPI:

1. Bump `version` in `pyproject.toml`.
2. Build and validate locally:

   ```sh
   uv pip install --upgrade build twine
   uv run python -m build
   uv run twine check dist/*
   ```

3. Publish:

   - Manual: `twine upload dist/*` (requires a `__token__` PyPI API token)
