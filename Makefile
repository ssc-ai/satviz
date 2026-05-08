.PHONY: help setup test test-python test-js test-available run-marimo edit-marimo build clean

UV ?= uv
DENO ?= deno

help:
	@echo "Targets:"
	@echo "  setup             - Sync venv with dev deps and editable satviz"
	@echo "  test              - Run all tests"
	@echo "  test-python       - Run Python tests"
	@echo "  test-js           - Run Deno JavaScript tests"
	@echo "  test-available    - Run Python tests and JS tests when Deno is installed"
	@echo "  run-marimo        - Run Marimo example with uv dev group"
	@echo "  edit-marimo       - Edit Marimo example with uv dev group"
	@echo "  build             - Build and validate distribution packages"
	@echo "  clean             - Remove virtual env and build artifacts"

setup:
	$(UV) sync --group dev

test: test-python test-js

test-python:
	$(UV) run --group dev python -m unittest discover -s tests

test-js:
	@command -v $(DENO) >/dev/null 2>&1 || { echo "Deno is required to run JavaScript tests. Install Deno or run 'make test-python' for Python-only tests."; exit 127; }
	$(DENO) test --no-check

test-available: test-python
	@if command -v $(DENO) >/dev/null 2>&1; then \
		$(MAKE) test-js; \
	else \
		echo "Skipping JavaScript tests because Deno is not installed."; \
	fi

run-marimo:
	$(UV) run --group dev marimo run examples/marimo_example.py

edit-marimo:
	$(UV) run --group dev marimo edit examples/marimo_example.py

build:
	$(UV) pip install --upgrade build twine
	$(UV) run python -m build
	$(UV) run twine check dist/*

clean:
	rm -rf .venv build dist *.egg-info
