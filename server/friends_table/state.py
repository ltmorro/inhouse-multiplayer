import json
import uuid
from pathlib import Path
from datetime import datetime, timezone

PHASES = ["lobby", "tasting", "voting", "results"]


class FriendsTableState:
    def __init__(self, data_dir="data"):
        self.data_dir = Path(data_dir)
        self.uploads_dir = self.data_dir / "ft_uploads"
        self.uploads_dir.mkdir(exist_ok=True)
        self.state_file = self.data_dir / "ft_state.json"

        self._phase = "lobby"
        self._current_dish_index = 0
        self._dishes: list[dict] = []
        self._votes: dict[str, list[str]] = {}
        self._wifi = {"ssid": "", "password": ""}

        self._load()

    def _load(self):
        if self.state_file.exists():
            try:
                with open(self.state_file) as f:
                    data = json.load(f)
                self._phase = data.get("phase", "lobby")
                self._current_dish_index = data.get("current_dish_index", 0)
                self._dishes = data.get("dishes", [])
                self._wifi = data.get("wifi", {"ssid": "", "password": ""})
            except Exception:
                pass

    def _save(self):
        with open(self.state_file, "w") as f:
            json.dump({
                "phase": self._phase,
                "current_dish_index": self._current_dish_index,
                "dishes": self._dishes,
                "wifi": self._wifi,
            }, f, indent=2)

    def _vote_count(self, dish_id: str) -> int:
        return sum(1 for votes in self._votes.values() if dish_id in votes)

    def _dish_with_votes(self, dish: dict) -> dict:
        d = dict(dish)
        d["vote_count"] = self._vote_count(dish["id"])
        return d

    def get_public_state(self) -> dict:
        dishes = [self._dish_with_votes(d) for d in self._dishes]
        if self._phase == "results":
            dishes.sort(key=lambda d: d["vote_count"], reverse=True)
        return {
            "phase": self._phase,
            "current_dish_index": self._current_dish_index,
            "dishes": dishes,
            "voter_count": len(self._votes),
            "wifi": self._wifi,
        }

    def get_voter_state(self, session_id: str) -> dict:
        state = self.get_public_state()
        state["my_votes"] = self._votes.get(session_id, [])
        return state

    def set_phase(self, phase: str):
        if phase not in PHASES:
            raise ValueError(f"Invalid phase: {phase}")
        self._phase = phase
        if phase == "tasting":
            self._current_dish_index = 0
        self._save()

    def next_dish(self):
        """Advance to next dish. Returns True if more dishes remain, False if we should go to voting."""
        next_index = self._current_dish_index + 1
        if next_index >= len(self._dishes):
            return False
        self._current_dish_index = next_index
        self._save()
        return True

    def add_dish(self, name: str, description: str, secret_ingredient: str = "") -> dict:
        dish = {
            "id": str(uuid.uuid4()),
            "name": name,
            "description": description,
            "secret_ingredient": secret_ingredient,
            "order": len(self._dishes),
            "photos": [],
            "comments": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self._dishes.append(dish)
        self._save()
        return dish

    def update_dish(self, dish_id: str, name: str = None, description: str = None, secret_ingredient: str = None) -> dict | None:
        for dish in self._dishes:
            if dish["id"] == dish_id:
                if name is not None:
                    dish["name"] = name
                if description is not None:
                    dish["description"] = description
                if secret_ingredient is not None:
                    dish["secret_ingredient"] = secret_ingredient
                self._save()
                return dish
        return None

    def delete_dish(self, dish_id: str):
        self._dishes = [d for d in self._dishes if d["id"] != dish_id]
        for i, d in enumerate(self._dishes):
            d["order"] = i
        self._save()

    def reorder_dishes(self, ordered_ids: list[str]) -> bool:
        id_set = {d["id"] for d in self._dishes}
        if set(ordered_ids) != id_set:
            return False
        dishes_by_id = {d["id"]: d for d in self._dishes}
        self._dishes = [dishes_by_id[dish_id] for dish_id in ordered_ids]
        for i, d in enumerate(self._dishes):
            d["order"] = i
        self._save()
        return True

    def add_photo(self, dish_id: str, filename: str) -> dict | None:
        for dish in self._dishes:
            if dish["id"] == dish_id:
                dish["photos"].append(filename)
                self._save()
                return dish
        return None

    def add_comment(self, dish_id: str, text: str) -> dict | None:
        for dish in self._dishes:
            if dish["id"] == dish_id:
                dish["comments"].append({
                    "id": str(uuid.uuid4()),
                    "text": text,
                    "at": datetime.now(timezone.utc).isoformat(),
                })
                self._save()
                return dish
        return None

    def cast_votes(self, session_id: str, dish_ids: list[str]) -> tuple[bool, str]:
        if len(dish_ids) > 2:
            return False, "Maximum 2 votes allowed"
        if len(set(dish_ids)) != len(dish_ids):
            return False, "Cannot vote for the same dish twice"
        valid_ids = {d["id"] for d in self._dishes}
        for dish_id in dish_ids:
            if dish_id not in valid_ids:
                return False, f"Invalid dish"
        self._votes[session_id] = dish_ids
        return True, "Votes cast"

    def set_wifi(self, ssid: str, password: str):
        self._wifi = {"ssid": ssid, "password": password}
        self._save()

    def reset(self):
        self._phase = "lobby"
        self._current_dish_index = 0
        self._dishes = []
        self._votes = {}
        self._save()
