.PHONY: help setup run-marimo run-marimo-local clean

UV ?= uv

help:
	@echo "Targets:"
	@echo "  setup             - Sync venv with dev deps and editable satviz"
	@echo "  run-marimo        - Run Marimo example with uv dev group"
	@echo "  edit-marimo       - Edit Marimo example with uv dev group"
	@echo "  build             - Build and validate distribution packages"
	@echo "  clean             - Remove virtual env and build artifacts"

setup:
	$(UV) sync --group dev

run-marimo:
	$(UV) run --group dev marimo run examples/marimo_example.py

edit-marimo:
	$(UV) run --group dev marimo edit examples/marimo_example.py

build:
	$(UV) run python -m build
	$(UV) run twine check dist/*

clean:
	rm -rf .venv build dist *.egg-info
