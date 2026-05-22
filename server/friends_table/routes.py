import os
import uuid
from pathlib import Path
from flask import Blueprint, request, jsonify, send_from_directory

ft_bp = Blueprint("friends_table", __name__)

HOST_KEY = os.environ.get("FT_HOST_KEY", "friends2026")
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp", "heic", "heif"}

_state = None
_socketio = None


def init(state, socketio):
    global _state, _socketio
    _state = state
    _socketio = socketio


def _emit():
    if _socketio and _state:
        _socketio.emit("ft_state", _state.get_public_state())


def _require_host():
    key = request.headers.get("X-Host-Key") or request.args.get("key") or (request.json or {}).get("key")
    return key == HOST_KEY


def _allowed(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _save_upload(file) -> str:
    ext = file.filename.rsplit(".", 1)[1].lower() if "." in file.filename else "jpg"
    filename = f"{uuid.uuid4()}.{ext}"
    uploads_dir = Path("data/ft_uploads")
    uploads_dir.mkdir(exist_ok=True)
    file.save(uploads_dir / filename)
    return filename


@ft_bp.route("/ft-uploads/<filename>")
def serve_upload(filename):
    return send_from_directory("data/ft_uploads", filename)


@ft_bp.route("/api/ft/state")
def get_state():
    session_id = request.args.get("session_id", "")
    if session_id:
        return jsonify(_state.get_voter_state(session_id))
    return jsonify(_state.get_public_state())


@ft_bp.route("/api/ft/dishes", methods=["POST"])
def add_dish():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    description = (data.get("description") or "").strip()
    secret = (data.get("secret_ingredient") or "").strip()
    if not name:
        return jsonify({"error": "Name required"}), 400
    if _state._phase != "lobby":
        return jsonify({"error": "Dishes can only be added in lobby"}), 400
    dish = _state.add_dish(name, description, secret)
    _emit()
    return jsonify(dish), 201


@ft_bp.route("/api/ft/dishes/<dish_id>", methods=["PATCH"])
def update_dish(dish_id):
    if not _require_host():
        return jsonify({"error": "Host key required"}), 401
    data = request.get_json() or {}
    dish = _state.update_dish(
        dish_id,
        name=data.get("name"),
        description=data.get("description"),
        secret_ingredient=data.get("secret_ingredient"),
    )
    if not dish:
        return jsonify({"error": "Dish not found"}), 404
    _emit()
    return jsonify(dish)


@ft_bp.route("/api/ft/dishes/<dish_id>", methods=["DELETE"])
def delete_dish(dish_id):
    if not _require_host():
        return jsonify({"error": "Host key required"}), 401
    _state.delete_dish(dish_id)
    _emit()
    return "", 204


@ft_bp.route("/api/ft/dishes/reorder", methods=["POST"])
def reorder_dishes():
    if not _require_host():
        return jsonify({"error": "Host key required"}), 401
    data = request.get_json() or {}
    ordered_ids = data.get("ordered_ids", [])
    if not _state.reorder_dishes(ordered_ids):
        return jsonify({"error": "Invalid dish IDs"}), 400
    _emit()
    return jsonify({"ok": True})


@ft_bp.route("/api/ft/phase", methods=["POST"])
def set_phase():
    if not _require_host():
        return jsonify({"error": "Host key required"}), 401
    data = request.get_json() or {}
    phase = data.get("phase")
    try:
        _state.set_phase(phase)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    _emit()
    return jsonify({"phase": phase})


@ft_bp.route("/api/ft/next-dish", methods=["POST"])
def next_dish():
    if not _require_host():
        return jsonify({"error": "Host key required"}), 401
    has_more = _state.next_dish()
    if not has_more:
        _state.set_phase("voting")
    _emit()
    return jsonify({"has_more": has_more, "phase": _state._phase})


@ft_bp.route("/api/ft/dishes/<dish_id>/photos", methods=["POST"])
def add_photo(dish_id):
    if "photo" not in request.files:
        return jsonify({"error": "No photo"}), 400
    file = request.files["photo"]
    if not file.filename or not _allowed(file.filename):
        return jsonify({"error": "Invalid file type"}), 400
    filename = _save_upload(file)
    dish = _state.add_photo(dish_id, filename)
    if not dish:
        return jsonify({"error": "Dish not found"}), 404
    _emit()
    return jsonify({"filename": filename}), 201


@ft_bp.route("/api/ft/dishes/<dish_id>/comments", methods=["POST"])
def add_comment(dish_id):
    data = request.get_json() or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Comment text required"}), 400
    dish = _state.add_comment(dish_id, text)
    if not dish:
        return jsonify({"error": "Dish not found"}), 404
    _emit()
    return jsonify({"ok": True})


@ft_bp.route("/api/ft/vote", methods=["POST"])
def cast_vote():
    data = request.get_json() or {}
    session_id = data.get("session_id", "")
    dish_ids = data.get("dish_ids", [])
    if not session_id:
        return jsonify({"error": "Session ID required"}), 400
    if _state._phase != "voting":
        return jsonify({"error": "Voting is not open"}), 400
    ok, msg = _state.cast_votes(session_id, dish_ids)
    if not ok:
        return jsonify({"error": msg}), 400
    _emit()
    return jsonify({"ok": True})


@ft_bp.route("/api/ft/wifi", methods=["POST"])
def set_wifi():
    if not _require_host():
        return jsonify({"error": "Host key required"}), 401
    data = request.get_json() or {}
    _state.set_wifi(data.get("ssid", ""), data.get("password", ""))
    _emit()
    return jsonify({"ok": True})


@ft_bp.route("/api/ft/reset", methods=["POST"])
def reset():
    if not _require_host():
        return jsonify({"error": "Host key required"}), 401
    _state.reset()
    _emit()
    return jsonify({"ok": True})
