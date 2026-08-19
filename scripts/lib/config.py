"""Caricamento centralizzato dei file di configurazione JSON in config/."""
import json
import os

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _load(path):
    full = os.path.join(REPO_ROOT, path)
    with open(full, "r", encoding="utf-8") as f:
        return json.load(f)


def load_settings():
    return _load("config/settings.json")


def load_scoring():
    return _load("config/scoring.json")


def load_overrides():
    return _load("config/overrides.json")


def repo_path(*parts):
    return os.path.join(REPO_ROOT, *parts)
