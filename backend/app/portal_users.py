"""Portal role mapping for ERPNext-authenticated users.

Temporary stand-in until real Portal user management/RBAC ships (separate
task — see PROJECT_CONTEXT.md). ERPNext owns credentials; this module only
answers "what Portal role does this already-authenticated email have?".
The only place that reads from this module is authenticate_credentials()
in auth_service.py, so swapping to a real store later means replacing
get_role() alone.
"""

from .schemas import Role

PORTAL_USERS: dict[str, Role] = {
    "admin@uteshiyamedicare.com": "admin",
    "jaliapoojan@gmail.com": "admin",
    "manager@uteshiyamedicare.com": "manager",
    "distributor@uteshiyamedicare.com": "distributor",
    "sales@uteshiyamedicare.com": "sales_person",
}


def get_role(email: str) -> Role | None:
    return PORTAL_USERS.get(email.lower())
