"""Core platform components - the 'Console' in Console and Cartridge architecture."""

from .session_manager import SessionManager
from .event_router import EventRouter

__all__ = ['SessionManager', 'EventRouter']
