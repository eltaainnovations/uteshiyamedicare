"""Portal role lookup for ERPNext-authenticated users.

Thin re-export over the real Portal users table (see users_service.py) so
auth_service.py's import doesn't need to change.
"""

from .users_service import get_role

__all__ = ["get_role"]
