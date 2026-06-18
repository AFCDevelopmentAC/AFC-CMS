"""
AFC Uthiru Church Management System — FastAPI Sync Engine
v2 — Complete build.
Auth/Users + Members + MemberDepartments + DeptUpgradeFlags +
Visitors + NewConverts + NewClassMembers +
Services + Events + Attendance + Reports +
Income + Expenses + Tithers + Payroll + Balancesheet +
Inventory + FacilityMgt + DutyRoster + OrderOfProgram +
Notifications + AuditLog
"""

import os
from datetime import datetime, timedelta, timezone, date
from typing import Optional, List

import bcrypt
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.oauth2.service_account import Credentials

# ── App ──────────────────────────────────────────────────────
app = FastAPI(
    title="AFC Uthiru CMS API",
    description="Church Management System — v2 (Complete)",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Config ───────────────────────────────────────────────────
CREDENTIALS_FILE = "afs-uthiru-cms-de0018a945c1.json"
SPREADSHEET_ID   = os.environ.get("SPREADSHEET_ID", "1tX_G4wlCKKRuPVPr-jy5f992jnmlp0y_3s-yd-UNkTs")
SECRET_KEY       = os.environ.get("SECRET_KEY", "CHANGE-THIS-BEFORE-PRODUCTION-AFC-UTHIRU")
SCOPES           = ["https://www.googleapis.com/auth/spreadsheets"]
ALGORITHM        = "HS256"
TOKEN_EXPIRE_MIN = 480

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ═══════════════════════════════════════════════════════════════
# GOOGLE SHEETS HELPERS
# ═══════════════════════════════════════════════════════════════

def _service():
    creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if creds_json:
        import json
        info  = json.loads(creds_json)
        creds = Credentials.from_service_account_info(info, scopes=SCOPES)
    else:
        if not os.path.exists(CREDENTIALS_FILE):
            raise RuntimeError(f"Credentials file '{CREDENTIALS_FILE}' not found.")
        creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=SCOPES)
    return build("sheets", "v4", credentials=creds)


def sheet_to_list(sheet_name: str, header_row: int = 6) -> list[dict]:
    result = _service().spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A{header_row}:ZZ"
    ).execute()
    rows = result.get("values", [])
    if not rows:
        return []
    headers = [str(h).strip() for h in rows[0]]
    records = []
    for row in rows[1:]:
        if not row:
            continue
        sn = str(row[0]).strip() if row else ""
        if sn in ("", "0", "0.0", "NULL"):
            continue
        obj = {headers[i]: (row[i] if i < len(row) else "") for i in range(len(headers))}
        records.append(obj)
    return records


def append_row(sheet_name: str, values: list):
    _service().spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A7",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": [values]},
    ).execute()


def find_row_by_sn(sheet_name: str, sn: str | int, header_row: int = 6) -> int | None:
    result = _service().spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A{header_row}:A"
    ).execute()
    for idx, row in enumerate(result.get("values", [])):
        if row and str(row[0]).strip() == str(sn).strip():
            return header_row + idx
    return None


def find_row_by_col(sheet_name: str, col_letter: str, value: str,
                    header_row: int = 6) -> int | None:
    result = _service().spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!{col_letter}{header_row}:{col_letter}"
    ).execute()
    for idx, row in enumerate(result.get("values", [])):
        if row and str(row[0]).strip().lower() == value.strip().lower():
            return header_row + idx
    return None


def update_row(sheet_name: str, row_number: int, values: list):
    # support > 26 columns with two-letter column letters
    n   = len(values)
    col = _col_letter(n)
    _service().spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A{row_number}:{col}{row_number}",
        valueInputOption="USER_ENTERED",
        body={"values": [values]},
    ).execute()


def update_cell(sheet_name: str, row_number: int, col_letter: str, value):
    _service().spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!{col_letter}{row_number}",
        valueInputOption="USER_ENTERED",
        body={"values": [[value]]},
    ).execute()


def clear_row(sheet_name: str, row_number: int):
    _service().spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A{row_number}:ZZ{row_number}"
    ).execute()


def _col_letter(n: int) -> str:
    """Convert 1-based column index to letter(s): 1→A, 27→AA, etc."""
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def next_sn(sheet_name: str) -> str:
    records = sheet_to_list(sheet_name)
    if not records:
        return "1"
    try:
        return str(max(int(r.get("S_N", 0)) for r in records
                       if str(r.get("S_N", "")).isdigit()) + 1)
    except Exception:
        return str(len(records) + 1)


def next_session_id(prefix: str, sheet_name: str, date_str: str) -> str:
    """SVC-20250612-001 / EVT-20250612-001"""
    code = date_str.replace("-", "")
    pfx  = f"{prefix}-{code}-"
    recs = sheet_to_list(sheet_name)
    seq  = max(
        (int(r["S_N"].split("-")[-1]) for r in recs
         if str(r.get("S_N", "")).startswith(pfx)),
        default=0
    )
    return f"{pfx}{seq + 1:03d}"


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ═══════════════════════════════════════════════════════════════
# DEPARTMENT + GENDER CATEGORY DERIVATION
# ═══════════════════════════════════════════════════════════════

UPGRADE_STATUSES = {"MARRIED", "DIVORCED", "SEPARATED", "WIDOW/WIDOWER", "SINGLE-PARENT"}


def _age(dob_raw: str) -> int | None:
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            dob   = datetime.strptime(dob_raw.strip(), fmt).date()
            today = date.today()
            return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        except (ValueError, AttributeError):
            continue
    return None


def derive_department_1(sex: str, marital_status: str, dob_raw: str) -> str:
    sex    = (sex or "").strip().upper()
    status = (marital_status or "").strip().upper()
    age    = _age(dob_raw or "")

    # Married / divorced / separated / widowed / single-parent → adult union
    if status in UPGRADE_STATUSES:
        return "BROTHERS UNION" if sex == "MALE" else "SISTERS UNION"

    if age is not None:
        if age <= 12:
            return "SUNDAY SCHOOL"
        if age <= 17:
            return "PRE-YOUTH DEPARTMENT"
    return "YOUTH DEPARTMENT"


def derive_gender_category(sex: str, dob_raw: str) -> str:
    age = _age(dob_raw or "")
    if age is not None:
        if age < 13:
            return "CHILD"
        if age <= 17:
            return "YOUTH"
    return "WOMAN" if (sex or "").strip().upper() == "FEMALE" else "MAN"


# ═══════════════════════════════════════════════════════════════
# AUTH HELPERS
# ═══════════════════════════════════════════════════════════════

def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(12)).decode()


def _verify(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def _make_token(data: dict) -> str:
    payload = {**data, "exp": datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE_MIN)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _get_user(username: str) -> dict | None:
    users = sheet_to_list("Users_db")
    return next((u for u in users if u.get("USERNAME", "").lower() == username.lower()), None)


class CurrentUser(BaseModel):
    username: str
    full_name: str
    email: str
    is_admin: bool
    church_branch: str


def get_current_user(token: str = Depends(oauth2_scheme)) -> CurrentUser:
    try:
        payload  = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token.")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expired or invalid.")

    user = _get_user(username)
    if not user or str(user.get("IS_ACTIVE", "")).upper() != "TRUE":
        raise HTTPException(status_code=401, detail="User inactive or not found.")

    return CurrentUser(
        username=user["USERNAME"],
        full_name=user.get("FULL_NAME", ""),
        email=user.get("EMAIL", ""),
        is_admin=str(user.get("IS_ADMIN", "")).upper() == "TRUE",
        church_branch=user.get("CHURCH_BRANCH", "AFC UTHIRU"),
    )


def require_user(u: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    return u


def require_admin(u: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not u.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return u


# ═══════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════

# ── Users ────────────────────────────────────────────────────
class CreateUser(BaseModel):
    username:      str
    full_name:     str
    email:         str
    password:      str
    is_admin:      bool = False
    church_branch: Optional[str] = "AFC UTHIRU"


# ── Members ──────────────────────────────────────────────────
class MemberIn(BaseModel):
    PROFILE_PHOTO_URL:    Optional[str] = None
    MEMBER_NAME:          str
    PHYSICAL_ADDRESS:     Optional[str] = None   # replaces OFFICE_ADDRESS
    LOCATION_AREA:        Optional[str] = None   # e.g. "Kinoo, behind Kinoo Primary"
    HOME_CHURCH:          Optional[str] = None   # member's home/sending church if different
    PHONE:                Optional[str] = None
    EMAIL:                Optional[str] = None
    SEX:                  Optional[str] = None
    MARITAL_STATUS:       Optional[str] = None
    DATE_OF_BIRTH:        Optional[str] = None
    OCCUPATION:           Optional[str] = None
    SUNDAY_SCHOOL_CLASS:  Optional[str] = None   # JUNIOR | SENIOR
    DATE_JOINED:          Optional[str] = None
    MEMBERSHIP_STATUS:    Optional[str] = "ACTIVE MEMBER"
    MEMBERSHIP_NUMBER:    Optional[str] = None
    SPOUSE_NAME:          Optional[str] = None
    CONVERSION_DATE:      Optional[str] = None
    NO_OF_CHILDREN:       Optional[int] = None
    BAPTISM_DATE:         Optional[str] = None
    HOLY_SPIRIT_RECEIVED: Optional[str] = None
    HOLY_SPIRIT_DATE:     Optional[str] = None
    HOME_CHURCH_BRANCH:   Optional[str] = "AFC UTHIRU"
    # Next of kin
    NOK_NAME:             Optional[str] = None
    NOK_RELATIONSHIP:     Optional[str] = None
    NOK_PHONE:            Optional[str] = None


class DepartmentAdd(BaseModel):
    department:    str
    church_branch: Optional[str] = "AFC UTHIRU"


class DepartmentOverride(BaseModel):
    """Admin-only: directly set a member's DEPARTMENT_1."""
    department:    str
    reason:        Optional[str] = None


class DeptUpgradeDecision(BaseModel):
    decision: str          # "APPROVED" or "REJECTED"
    notes:    Optional[str] = None


# ── Visitors ─────────────────────────────────────────────────
class VisitorIn(BaseModel):
    VISITOR_NAME:         str
    ADDRESS:              Optional[str] = None
    PHONE:                Optional[str] = None
    EMAIL:                Optional[str] = None
    GENDER:               Optional[str] = None
    MARITAL_STATUS:       Optional[str] = None
    WANTS_TO_JOIN:        Optional[str] = None
    BEEN_CONVERTED:       Optional[str] = None
    CONVERSION_DATE:      Optional[str] = None
    WHERE_CONVERTED:      Optional[str] = None
    WHO_INVITED:          Optional[str] = None
    FIRST_VISIT:          Optional[str] = None
    PURPOSE_OF_VISIT:     Optional[str] = None
    EXPERIENCE_OF_SERVICE: Optional[str] = None
    PRAYER_REQUEST:       Optional[str] = None
    VISIT_DATE_TIME:      Optional[str] = None
    CHURCH_BRANCH:        Optional[str] = "AFC UTHIRU"


# ── New Converts ─────────────────────────────────────────────
class NewConvertIn(BaseModel):
    CONVERSION_DATE:      Optional[str] = None
    SERVICE_OR_EVENT_ID:  Optional[str] = None
    NEW_CONVERT_NAME:     str
    PHONE:                Optional[str] = None
    HOUSE_ADDRESS:        Optional[str] = None
    EMAIL:                Optional[str] = None
    OCCUPATION:           Optional[str] = None
    PRAYER_REQUEST:       Optional[str] = None
    HOW_MET_CHRIST:       Optional[str] = None
    SALVATION_EXPERIENCE: Optional[str] = None
    METHOD_OF_CONTACT:    Optional[str] = None
    BEST_CONTACT_TIME:    Optional[str] = None
    CHURCH_BRANCH:        Optional[str] = "AFC UTHIRU"


# ── New Class Members ────────────────────────────────────────
class NewClassMemberIn(BaseModel):
    FULL_NAME:        str
    PHONE:            Optional[str] = None
    EMAIL:            Optional[str] = None
    ADDRESS:          Optional[str] = None
    GENDER:           Optional[str] = None
    MARITAL_STATUS:   Optional[str] = None
    DATE_OF_BIRTH:    Optional[str] = None
    OCCUPATION:       Optional[str] = None
    DATE_ENROLLED:    Optional[str] = None
    FACILITATOR:      Optional[str] = None
    CLASS_STATUS:     Optional[str] = "ENROLLED"
    NOTES:            Optional[str] = None
    CHURCH_BRANCH:    Optional[str] = "AFC UTHIRU"


# ── Services ─────────────────────────────────────────────────
class ServiceIn(BaseModel):
    DATE:               str
    OPENING_TIME:       Optional[str] = None
    CLOSING_TIME:       Optional[str] = None
    NATURE_OF_SERVICE:  Optional[str] = None
    PREACHER:           Optional[str] = None
    SCRIPTURE_READING:  Optional[str] = None
    SERMON_TOPIC:       Optional[str] = None
    TITHES:             Optional[float] = 0
    OFFERING:           Optional[float] = 0
    BUILDING_OFFERING:  Optional[float] = 0
    THANKSGIVING:       Optional[float] = 0
    SEED_OFFERING:      Optional[float] = 0
    WELFARE_OFFERING:   Optional[float] = 0
    OTHER_OFFERING:     Optional[float] = 0
    CHURCH_BRANCH:      Optional[str] = "AFC UTHIRU"


# ── Events ───────────────────────────────────────────────────
class EventIn(BaseModel):
    EVENT_TITLE:        str
    EVENT_DESCRIPTION:  Optional[str] = None
    EVENT_DATE:         str
    EVENT_TIME:         Optional[str] = None
    EVENT_LOCATION:     Optional[str] = None
    TARGETED_GROUP:     Optional[str] = None
    PASTOR_IN_CHARGE:   Optional[str] = None
    PHONE:              Optional[str] = None
    APPROVED_BY:        Optional[str] = None
    CHURCH_BRANCH:      Optional[str] = "AFC UTHIRU"


# ── Attendance ───────────────────────────────────────────────
class AttendanceMark(BaseModel):
    session_type: str        # "SERVICE" | "EVENT"
    session_id:   str        # SVC-... or EVT-...
    member_sns:   List[str]  # list of member S_N values to mark present


class AttendanceUnmark(BaseModel):
    session_type: str
    session_id:   str
    member_sn:    str


# ── Income ───────────────────────────────────────────────────
class IncomeIn(BaseModel):
    DATE:                  str
    SERVICE_TYPE:          Optional[str] = None
    TITHES:                Optional[float] = 0
    OFFERING:              Optional[float] = 0
    BUILDING_OFFERING:     Optional[float] = 0
    GENERAL_THANKSGIVING:  Optional[float] = 0
    SPECIAL_THANKSGIVING:  Optional[float] = 0
    DONATIONS:             Optional[float] = 0
    PLEDGES:               Optional[float] = 0
    SEED_OFFERING:         Optional[float] = 0
    WELFARE_OFFERING:      Optional[float] = 0
    HARVEST:               Optional[float] = 0
    PROJECT:               Optional[float] = 0
    OTHER_INCOME:          Optional[float] = 0
    CHURCH_BRANCH:         Optional[str] = "AFC UTHIRU"


# ── Expenses ─────────────────────────────────────────────────
class ExpenseIn(BaseModel):
    DATE:                str
    EXPENSE_DESCRIPTION: str
    CATEGORY:            Optional[str] = None
    QTY:                 Optional[float] = 1
    UNIT_RATE:           Optional[float] = 0
    PAYMENT_METHOD:      Optional[str] = None
    PAID_TO:             Optional[str] = None
    APPROVED_BY:         Optional[str] = None
    RECEIPT_NO:          Optional[str] = None
    CHURCH_BRANCH:       Optional[str] = "AFC UTHIRU"


# ── Tithers ──────────────────────────────────────────────────
class TitheIn(BaseModel):
    DATE:           str
    PAYERS_NAME:    str
    PHONE:          Optional[str] = None
    MEMBER_SN:      Optional[str] = None
    AMOUNT:         float
    PAYMENT_METHOD: Optional[str] = None
    CHURCH_BRANCH:  Optional[str] = "AFC UTHIRU"


# ── Payroll ──────────────────────────────────────────────────
class PayrollIn(BaseModel):
    PAY_DATE:          str
    STAFF_ID:          Optional[str] = None
    STAFF_NAME:        str
    ROLE_TITLE:        Optional[str] = None
    GROSS_PAY:         float
    DEDUCTION:         Optional[float] = 0
    DEDUCTION_REASON:  Optional[str] = None
    PAYMENT_METHOD:    Optional[str] = None
    BANK_ACCOUNT:      Optional[str] = None
    CHURCH_BRANCH:     Optional[str] = "AFC UTHIRU"


# ── Balance Sheet ────────────────────────────────────────────
class BalanceSheetIn(BaseModel):
    PERIOD:         str
    PERIOD_TYPE:    Optional[str] = None
    TOTAL_INCOME:   float
    TOTAL_EXPENSES: float
    NOTES:          Optional[str] = None
    CHURCH_BRANCH:  Optional[str] = "AFC UTHIRU"


# ── Inventory ────────────────────────────────────────────────
class InventoryIn(BaseModel):
    ITEM_CODE:      Optional[str] = None
    ITEM_NAME:      str
    CATEGORY:       Optional[str] = None
    QUANTITY:       Optional[float] = 1
    UNIT:           Optional[str] = None
    UNIT_VALUE:     Optional[float] = 0
    PURCHASE_DATE:  Optional[str] = None
    SUPPLIER:       Optional[str] = None
    STATUS:         Optional[str] = "GOOD"
    LOCATION:       Optional[str] = None
    LAST_INSPECTED: Optional[str] = None
    NOTES:          Optional[str] = None
    CHURCH_BRANCH:  Optional[str] = "AFC UTHIRU"


# ── Facility Management ──────────────────────────────────────
class FacilityIn(BaseModel):
    FACILITY_NAME:          str
    BOOKING_DATE:           Optional[str] = None
    BOOKING_TIME:           Optional[str] = None
    BOOKING_PURPOSE:        Optional[str] = None
    BOOKED_BY:              Optional[str] = None
    PHONE:                  Optional[str] = None
    BOOKING_STATUS:         Optional[str] = "AVAILABLE"
    LAST_MAINTENANCE_DATE:  Optional[str] = None
    NEXT_DUE_DATE:          Optional[str] = None
    MAINTENANCE_EXPENSES:   Optional[float] = 0
    MAINTENANCE_NOTES:      Optional[str] = None
    CHURCH_BRANCH:          Optional[str] = "AFC UTHIRU"


# ── Duty Roster ──────────────────────────────────────────────
class DutyRosterIn(BaseModel):
    DUTY_TITLE:    str
    DEPARTMENT:    Optional[str] = None
    DATE:          Optional[str] = None
    TIME_ALLOCATED: Optional[str] = None
    TEAM_LEADER:   Optional[str] = None
    TEAM_MEMBER_1: Optional[str] = None
    TEAM_MEMBER_2: Optional[str] = None
    TEAM_MEMBER_3: Optional[str] = None
    TEAM_MEMBER_4: Optional[str] = None
    NOTES:         Optional[str] = None
    CHURCH_BRANCH: Optional[str] = "AFC UTHIRU"


# ── Order of Program ─────────────────────────────────────────
class ProgramItemIn(BaseModel):
    SESSION_ID:        str
    SESSION_DATE:      Optional[str] = None
    SESSION_TYPE:      Optional[str] = None
    NATURE_OF_SERVICE: Optional[str] = None
    ITEM_NO:           Optional[str] = None
    PROGRAM_SECTION:   str
    TIME_ALLOCATED:    Optional[str] = None
    OFFICIANT:         Optional[str] = None
    NOTES:             Optional[str] = None
    CHURCH_BRANCH:     Optional[str] = "AFC UTHIRU"


# ═══════════════════════════════════════════════════════════════
# HEALTH
# ═══════════════════════════════════════════════════════════════

@app.get("/", tags=["Health"])
def root():
    return {"status": "online", "system": "AFC Uthiru CMS API v2.0"}


@app.get("/api/test-connection", tags=["Health"])
def test_connection():
    try:
        meta = _service().spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
        return {
            "connection": "OK",
            "workbook":   meta.get("properties", {}).get("title"),
            "sheets":     [s["properties"]["title"] for s in meta.get("sheets", [])],
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════════════════════════

@app.post("/api/auth/login", tags=["Auth"])
def login(form: OAuth2PasswordRequestForm = Depends()):
    user = _get_user(form.username)
    if not user or not _verify(form.password, user.get("HASHED_PASSWORD", "")):
        raise HTTPException(401, "Incorrect username or password.")
    if str(user.get("IS_ACTIVE", "")).upper() != "TRUE":
        raise HTTPException(403, "Account is inactive. Contact your admin.")
    token = _make_token({"sub": user["USERNAME"]})
    return {
        "access_token": token,
        "token_type":   "bearer",
        "full_name":    user.get("FULL_NAME", ""),
        "is_admin":     str(user.get("IS_ADMIN", "")).upper() == "TRUE",
    }


@app.get("/api/auth/me", tags=["Auth"])
def me(u: CurrentUser = Depends(require_user)):
    return {
        "username":      u.username,
        "full_name":     u.full_name,
        "email":         u.email,
        "is_admin":      u.is_admin,
        "church_branch": u.church_branch,
    }


# ═══════════════════════════════════════════════════════════════
# USERS  (Admin only)
# ═══════════════════════════════════════════════════════════════

@app.get("/api/users", tags=["Users"])
def list_users(_: CurrentUser = Depends(require_admin)):
    users = sheet_to_list("Users_db")
    for u in users:
        u.pop("HASHED_PASSWORD", None)
    return users


@app.post("/api/users", tags=["Users"])
def create_user(body: CreateUser, admin: CurrentUser = Depends(require_admin)):
    existing = sheet_to_list("Users_db")
    if any(u.get("USERNAME", "").lower() == body.username.lower() for u in existing):
        raise HTTPException(409, f"Username '{body.username}' already exists.")
    sn = str(len(existing) + 1)
    append_row("Users_db", [
        sn, body.username, body.full_name, body.email, _hash(body.password),
        "TRUE" if body.is_admin else "FALSE", "TRUE",
        datetime.now().strftime("%Y-%m-%d"), body.church_branch,
    ])
    return {"status": "success", "message": f"User '{body.username}' created."}


@app.patch("/api/users/{username}/deactivate", tags=["Users"])
def deactivate_user(username: str, admin: CurrentUser = Depends(require_admin)):
    if username.lower() == admin.username.lower():
        raise HTTPException(400, "You cannot deactivate your own account.")
    users = sheet_to_list("Users_db")
    user  = next((u for u in users if u.get("USERNAME", "").lower() == username.lower()), None)
    if not user:
        raise HTTPException(404, f"User '{username}' not found.")
    rn = find_row_by_sn("Users_db", user["S_N"])
    update_row("Users_db", rn, [
        user["S_N"], user["USERNAME"], user.get("FULL_NAME", ""), user.get("EMAIL", ""),
        user.get("HASHED_PASSWORD", ""), user.get("IS_ADMIN", ""), "FALSE",
        user.get("CREATED_AT", ""), user.get("CHURCH_BRANCH", ""),
    ])
    return {"status": "success", "message": f"User '{username}' deactivated."}


# ═══════════════════════════════════════════════════════════════
# MEMBERS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/members", tags=["Members"])
def list_members(_: CurrentUser = Depends(require_user)):
    return sheet_to_list("MemberDetails_db")


@app.get("/api/members/{sn}", tags=["Members"])
def get_member(sn: str, _: CurrentUser = Depends(require_user)):
    members = sheet_to_list("MemberDetails_db")
    m = next((x for x in members if str(x.get("S_N", "")).strip() == sn), None)
    if not m:
        raise HTTPException(404, f"Member '{sn}' not found.")
    return m


def _member_row_values(sn: str, body: MemberIn, dept1: str, username: str) -> list:
    """Build the full row for MemberDetails_db — single place so add/update stay in sync."""
    return [
        sn,
        body.PROFILE_PHOTO_URL or "",
        body.MEMBER_NAME,
        body.PHYSICAL_ADDRESS or "",   # physical street address
        body.LOCATION_AREA or "",      # descriptive area, e.g. "Kinoo, behind Kinoo Primary"
        body.HOME_CHURCH or "",        # home/sending church
        body.PHONE or "",
        body.EMAIL or "",
        body.SEX or "",
        body.MARITAL_STATUS or "",
        body.DATE_OF_BIRTH or "",
        body.OCCUPATION or "",
        dept1,                         # DEPARTMENT_1 — auto-derived or admin-overridden
        body.DATE_JOINED or "",
        body.MEMBERSHIP_STATUS or "ACTIVE MEMBER",
        body.MEMBERSHIP_NUMBER or "",
        body.SPOUSE_NAME or "",
        body.CONVERSION_DATE or "",
        body.NO_OF_CHILDREN if body.NO_OF_CHILDREN is not None else "",
        body.BAPTISM_DATE or "",
        body.HOLY_SPIRIT_RECEIVED or "",
        body.HOLY_SPIRIT_DATE or "",
        body.HOME_CHURCH_BRANCH or "AFC UTHIRU",
        # next of kin
        body.NOK_NAME or "",
        body.NOK_RELATIONSHIP or "",
        body.NOK_PHONE or "",
        # audit
        username,
        now_str(),
    ]


@app.post("/api/members", tags=["Members"])
def add_member(body: MemberIn, u: CurrentUser = Depends(require_user)):
    dept1 = derive_department_1(body.SEX or "", body.MARITAL_STATUS or "", body.DATE_OF_BIRTH or "")
    sn    = next_sn("MemberDetails_db")

    append_row("MemberDetails_db", _member_row_values(sn, body, dept1, u.username))

    # Sunday School sub-classification
    if dept1 == "SUNDAY SCHOOL" and body.SUNDAY_SCHOOL_CLASS:
        cls = body.SUNDAY_SCHOOL_CLASS.strip().upper()
        if cls in ("JUNIOR", "SENIOR"):
            dsn = next_sn("MemberDepartments_db")
            append_row("MemberDepartments_db", [
                dsn, sn, body.MEMBER_NAME, f"SUNDAY SCHOOL - {cls}",
                datetime.now().strftime("%Y-%m-%d"), u.username, body.HOME_CHURCH_BRANCH,
            ])

    return {
        "status": "success", "sn": sn, "department_1": dept1,
        "message": f"Member '{body.MEMBER_NAME}' registered. Primary dept: {dept1}.",
    }


@app.put("/api/members/{sn}", tags=["Members"])
def update_member(sn: str, body: MemberIn, u: CurrentUser = Depends(require_user)):
    members  = sheet_to_list("MemberDetails_db")
    existing = next((m for m in members if str(m.get("S_N", "")).strip() == sn), None)
    if not existing:
        raise HTTPException(404, f"Member '{sn}' not found.")

    # DEPARTMENT_1 is preserved on plain update — use /admin-override to change it
    dept1   = existing.get("DEPARTMENT_1", "")
    old_ms  = existing.get("MARITAL_STATUS", "").strip().upper()
    new_ms  = (body.MARITAL_STATUS or "").strip().upper()

    # Auto-flag upgrade when marital status changes to an upgrade trigger
    if new_ms in UPGRADE_STATUSES and old_ms not in UPGRADE_STATUSES and \
            dept1.upper() in ("YOUTH DEPARTMENT", "PRE-YOUTH DEPARTMENT"):
        suggested = "BROTHERS UNION" if (body.SEX or existing.get("SEX","")).strip().upper() == "MALE" \
                    else "SISTERS UNION"
        _write_upgrade_flag(sn, body.MEMBER_NAME, dept1, suggested,
                            f"Marital status changed to {new_ms}", u.username)

    rn = find_row_by_sn("MemberDetails_db", sn)
    update_row("MemberDetails_db", rn, _member_row_values(sn, body, dept1, u.username))
    return {"status": "success", "message": f"Member '{sn}' updated."}


@app.delete("/api/members/{sn}", tags=["Members"])
def delete_member(sn: str, _: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("MemberDetails_db", sn)
    if not rn:
        raise HTTPException(404, f"Member '{sn}' not found.")
    clear_row("MemberDetails_db", rn)
    return {"status": "success", "message": f"Member '{sn}' deleted."}


# ── Admin: override DEPARTMENT_1 directly ────────────────────

@app.patch("/api/members/{sn}/admin-override-dept", tags=["Members"])
def admin_override_department(sn: str, body: DepartmentOverride,
                               u: CurrentUser = Depends(require_admin)):
    """
    Admin-only direct override of DEPARTMENT_1.
    Also handles single-parent → Brothers/Sisters Union when requested.
    """
    members  = sheet_to_list("MemberDetails_db")
    existing = next((m for m in members if str(m.get("S_N", "")).strip() == sn), None)
    if not existing:
        raise HTTPException(404, f"Member '{sn}' not found.")

    new_dept = body.department.strip().upper()
    rn       = find_row_by_sn("MemberDetails_db", sn)

    # Update only DEPARTMENT_1 column (col M = 13th column in the row, 0-indexed = col 12)
    # We re-write the whole row to keep it safe
    row_values = [
        existing.get("S_N", sn),
        existing.get("PROFILE_PHOTO_URL", ""),
        existing.get("MEMBER_NAME", ""),
        existing.get("PHYSICAL_ADDRESS", existing.get("ADDRESS", "")),
        existing.get("LOCATION_AREA", ""),
        existing.get("HOME_CHURCH", ""),
        existing.get("PHONE", ""),
        existing.get("EMAIL", ""),
        existing.get("SEX", ""),
        existing.get("MARITAL_STATUS", ""),
        existing.get("DATE_OF_BIRTH", ""),
        existing.get("OCCUPATION", ""),
        new_dept,      # ← DEPARTMENT_1 override
        existing.get("DATE_JOINED", ""),
        existing.get("MEMBERSHIP_STATUS", ""),
        existing.get("MEMBERSHIP_NUMBER", ""),
        existing.get("SPOUSE_NAME", ""),
        existing.get("CONVERSION_DATE", ""),
        existing.get("NO_OF_CHILDREN", ""),
        existing.get("BAPTISM_DATE", ""),
        existing.get("HOLY_SPIRIT_RECEIVED", ""),
        existing.get("HOLY_SPIRIT_DATE", ""),
        existing.get("HOME_CHURCH_BRANCH", "AFC UTHIRU"),
        existing.get("NOK_NAME", ""),
        existing.get("NOK_RELATIONSHIP", ""),
        existing.get("NOK_PHONE", ""),
        u.username,
        now_str(),
    ]
    update_row("MemberDetails_db", rn, row_values)
    return {
        "status": "success",
        "message": f"Department 1 for member '{sn}' overridden to '{new_dept}'.",
        "reason": body.reason or "",
    }


# ── Member extra departments ──────────────────────────────────

@app.get("/api/members/{sn}/departments", tags=["Members"])
def get_member_departments(sn: str, _: CurrentUser = Depends(require_user)):
    members = sheet_to_list("MemberDetails_db")
    member  = next((m for m in members if str(m.get("S_N", "")).strip() == sn), None)
    if not member:
        raise HTTPException(404, f"Member '{sn}' not found.")
    extra = [r for r in sheet_to_list("MemberDepartments_db")
             if str(r.get("MEMBER_SN", "")).strip() == sn]
    return {
        "member_sn":         sn,
        "member_name":       member.get("MEMBER_NAME", ""),
        "department_1":      {"department": member.get("DEPARTMENT_1", ""), "mandatory": True},
        "extra_departments": [
            {"s_n": r.get("S_N"), "department": r.get("DEPARTMENT"),
             "date_assigned": r.get("DATE_ASSIGNED"), "assigned_by": r.get("ASSIGNED_BY")}
            for r in extra
        ],
    }


@app.post("/api/members/{sn}/departments", tags=["Members"])
def add_member_department(sn: str, body: DepartmentAdd, u: CurrentUser = Depends(require_user)):
    members = sheet_to_list("MemberDetails_db")
    member  = next((m for m in members if str(m.get("S_N", "")).strip() == sn), None)
    if not member:
        raise HTTPException(404, f"Member '{sn}' not found.")
    if body.department.strip().upper() == member.get("DEPARTMENT_1", "").strip().upper():
        raise HTTPException(409, "That is already this member's primary department.")
    extra = sheet_to_list("MemberDepartments_db")
    if any(str(r.get("MEMBER_SN", "")).strip() == sn
           and r.get("DEPARTMENT", "").strip().upper() == body.department.strip().upper()
           for r in extra):
        raise HTTPException(409, f"Member already assigned to '{body.department}'.")
    dsn = next_sn("MemberDepartments_db")
    append_row("MemberDepartments_db", [
        dsn, sn, member.get("MEMBER_NAME", ""), body.department,
        datetime.now().strftime("%Y-%m-%d"), u.username, body.church_branch,
    ])
    return {"status": "success", "message": f"'{body.department}' added to member '{sn}'."}


@app.delete("/api/members/{sn}/departments/{dept_sn}", tags=["Members"])
def remove_member_department(sn: str, dept_sn: str, _: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("MemberDepartments_db", dept_sn)
    if not rn:
        raise HTTPException(404, f"Department record '{dept_sn}' not found.")
    clear_row("MemberDepartments_db", rn)
    return {"status": "success", "message": f"Department '{dept_sn}' removed from member '{sn}'."}


# ── Department Upgrade Flags ──────────────────────────────────

def _write_upgrade_flag(member_sn: str, member_name: str, current_dept: str,
                         suggested: str, reason: str, flagged_by: str):
    fsn = next_sn("DeptUpgradeFlags_db")
    append_row("DeptUpgradeFlags_db", [
        fsn, member_sn, member_name, current_dept, suggested, reason,
        now_str(), flagged_by, "PENDING", "", "", "", "AFC UTHIRU",
    ])


@app.get("/api/dept-upgrade-flags", tags=["Members"])
def list_dept_upgrade_flags(_: CurrentUser = Depends(require_admin)):
    flags = sheet_to_list("DeptUpgradeFlags_db")
    return [f for f in flags if f.get("STATUS", "").upper() == "PENDING"]


@app.patch("/api/dept-upgrade-flags/{sn}", tags=["Members"])
def resolve_dept_upgrade_flag(sn: str, body: DeptUpgradeDecision,
                               u: CurrentUser = Depends(require_admin)):
    if body.decision.upper() not in ("APPROVED", "REJECTED"):
        raise HTTPException(400, "decision must be APPROVED or REJECTED.")
    flags = sheet_to_list("DeptUpgradeFlags_db")
    flag  = next((f for f in flags if str(f.get("S_N", "")).strip() == sn), None)
    if not flag:
        raise HTTPException(404, f"Flag '{sn}' not found.")
    rn = find_row_by_sn("DeptUpgradeFlags_db", sn)
    update_row("DeptUpgradeFlags_db", rn, [
        flag["S_N"], flag.get("MEMBER_SN", ""), flag.get("MEMBER_NAME", ""),
        flag.get("CURRENT_DEPARTMENT_1", ""), flag.get("SUGGESTED_DEPARTMENT", ""),
        flag.get("TRIGGER_REASON", ""), flag.get("FLAGGED_AT", ""), flag.get("FLAGGED_BY", ""),
        body.decision.upper(), now_str(), u.username, body.notes or "", "AFC UTHIRU",
    ])
    if body.decision.upper() == "APPROVED":
        mrn = find_row_by_sn("MemberDetails_db", flag.get("MEMBER_SN", ""))
        if mrn:
            existing_members = sheet_to_list("MemberDetails_db")
            m = next((x for x in existing_members
                       if str(x.get("S_N", "")).strip() == str(flag.get("MEMBER_SN", "")).strip()), None)
            if m:
                # rewrite whole row with updated department
                row_values = [
                    m.get("S_N", ""), m.get("PROFILE_PHOTO_URL", ""), m.get("MEMBER_NAME", ""),
                    m.get("PHYSICAL_ADDRESS", m.get("ADDRESS", "")), m.get("LOCATION_AREA", ""),
                    m.get("HOME_CHURCH", ""), m.get("PHONE", ""), m.get("EMAIL", ""),
                    m.get("SEX", ""), m.get("MARITAL_STATUS", ""), m.get("DATE_OF_BIRTH", ""),
                    m.get("OCCUPATION", ""), flag.get("SUGGESTED_DEPARTMENT", ""),  # ← new dept
                    m.get("DATE_JOINED", ""), m.get("MEMBERSHIP_STATUS", ""),
                    m.get("MEMBERSHIP_NUMBER", ""), m.get("SPOUSE_NAME", ""),
                    m.get("CONVERSION_DATE", ""), m.get("NO_OF_CHILDREN", ""),
                    m.get("BAPTISM_DATE", ""), m.get("HOLY_SPIRIT_RECEIVED", ""),
                    m.get("HOLY_SPIRIT_DATE", ""), m.get("HOME_CHURCH_BRANCH", "AFC UTHIRU"),
                    m.get("NOK_NAME", ""), m.get("NOK_RELATIONSHIP", ""), m.get("NOK_PHONE", ""),
                    u.username, now_str(),
                ]
                update_row("MemberDetails_db", mrn, row_values)
    return {"status": "success", "message": f"Flag '{sn}' {body.decision.lower()}."}


# ═══════════════════════════════════════════════════════════════
# DEPARTMENTS  (reference list for dropdowns)
# ═══════════════════════════════════════════════════════════════

@app.get("/api/departments", tags=["Departments"])
def list_departments(_: CurrentUser = Depends(require_user)):
    return sheet_to_list("Departments_db")


# ═══════════════════════════════════════════════════════════════
# VISITORS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/visitors", tags=["Visitors"])
def list_visitors(_: CurrentUser = Depends(require_user)):
    return sheet_to_list("Visitors_db")


@app.get("/api/visitors/{sn}", tags=["Visitors"])
def get_visitor(sn: str, _: CurrentUser = Depends(require_user)):
    v = next((x for x in sheet_to_list("Visitors_db") if str(x.get("S_N", "")).strip() == sn), None)
    if not v:
        raise HTTPException(404, f"Visitor '{sn}' not found.")
    return v


@app.post("/api/visitors", tags=["Visitors"])
def add_visitor(body: VisitorIn, u: CurrentUser = Depends(require_user)):
    sn = next_sn("Visitors_db")
    append_row("Visitors_db", [
        sn, body.VISITOR_NAME, body.ADDRESS, body.PHONE, body.EMAIL,
        body.GENDER, body.MARITAL_STATUS, body.WANTS_TO_JOIN, body.BEEN_CONVERTED,
        body.CONVERSION_DATE, body.WHERE_CONVERTED, body.WHO_INVITED, body.FIRST_VISIT,
        body.PURPOSE_OF_VISIT, body.EXPERIENCE_OF_SERVICE, body.PRAYER_REQUEST,
        body.VISIT_DATE_TIME or now_str(), u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "sn": sn, "message": f"Visitor '{body.VISITOR_NAME}' registered."}


@app.put("/api/visitors/{sn}", tags=["Visitors"])
def update_visitor(sn: str, body: VisitorIn, u: CurrentUser = Depends(require_user)):
    rn = find_row_by_sn("Visitors_db", sn)
    if not rn:
        raise HTTPException(404, f"Visitor '{sn}' not found.")
    update_row("Visitors_db", rn, [
        sn, body.VISITOR_NAME, body.ADDRESS, body.PHONE, body.EMAIL,
        body.GENDER, body.MARITAL_STATUS, body.WANTS_TO_JOIN, body.BEEN_CONVERTED,
        body.CONVERSION_DATE, body.WHERE_CONVERTED, body.WHO_INVITED, body.FIRST_VISIT,
        body.PURPOSE_OF_VISIT, body.EXPERIENCE_OF_SERVICE, body.PRAYER_REQUEST,
        body.VISIT_DATE_TIME or now_str(), u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "message": f"Visitor '{sn}' updated."}


@app.delete("/api/visitors/{sn}", tags=["Visitors"])
def delete_visitor(sn: str, _: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("Visitors_db", sn)
    if not rn:
        raise HTTPException(404, f"Visitor '{sn}' not found.")
    clear_row("Visitors_db", rn)
    return {"status": "success", "message": f"Visitor '{sn}' deleted."}


# ═══════════════════════════════════════════════════════════════
# NEW CONVERTS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/new-converts", tags=["Converts"])
def list_new_converts(_: CurrentUser = Depends(require_user)):
    return sheet_to_list("Newconvert_db")


@app.get("/api/new-converts/{sn}", tags=["Converts"])
def get_new_convert(sn: str, _: CurrentUser = Depends(require_user)):
    c = next((x for x in sheet_to_list("Newconvert_db") if str(x.get("S_N", "")).strip() == sn), None)
    if not c:
        raise HTTPException(404, f"New convert '{sn}' not found.")
    return c


@app.post("/api/new-converts", tags=["Converts"])
def add_new_convert(body: NewConvertIn, u: CurrentUser = Depends(require_user)):
    sn = next_sn("Newconvert_db")
    append_row("Newconvert_db", [
        sn, body.CONVERSION_DATE, body.SERVICE_OR_EVENT_ID, body.NEW_CONVERT_NAME,
        body.PHONE, body.HOUSE_ADDRESS, body.EMAIL, body.OCCUPATION, body.PRAYER_REQUEST,
        body.HOW_MET_CHRIST, body.SALVATION_EXPERIENCE, body.METHOD_OF_CONTACT,
        body.BEST_CONTACT_TIME, u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "sn": sn, "message": f"New convert '{body.NEW_CONVERT_NAME}' added."}


@app.put("/api/new-converts/{sn}", tags=["Converts"])
def update_new_convert(sn: str, body: NewConvertIn, u: CurrentUser = Depends(require_user)):
    rn = find_row_by_sn("Newconvert_db", sn)
    if not rn:
        raise HTTPException(404, f"New convert '{sn}' not found.")
    update_row("Newconvert_db", rn, [
        sn, body.CONVERSION_DATE, body.SERVICE_OR_EVENT_ID, body.NEW_CONVERT_NAME,
        body.PHONE, body.HOUSE_ADDRESS, body.EMAIL, body.OCCUPATION, body.PRAYER_REQUEST,
        body.HOW_MET_CHRIST, body.SALVATION_EXPERIENCE, body.METHOD_OF_CONTACT,
        body.BEST_CONTACT_TIME, u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "message": f"New convert '{sn}' updated."}


@app.delete("/api/new-converts/{sn}", tags=["Converts"])
def delete_new_convert(sn: str, _: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("Newconvert_db", sn)
    if not rn:
        raise HTTPException(404, f"New convert '{sn}' not found.")
    clear_row("Newconvert_db", rn)
    return {"status": "success", "message": f"New convert '{sn}' deleted."}


# ═══════════════════════════════════════════════════════════════
# NEW CLASS MEMBERS  (Discipleship pipeline)
# ═══════════════════════════════════════════════════════════════

@app.get("/api/new-class-members", tags=["NewClass"])
def list_new_class_members(_: CurrentUser = Depends(require_user)):
    return sheet_to_list("NewClassMembers_db")


@app.post("/api/new-class-members", tags=["NewClass"])
def add_new_class_member(body: NewClassMemberIn, u: CurrentUser = Depends(require_user)):
    sn = next_sn("NewClassMembers_db")
    append_row("NewClassMembers_db", [
        sn, body.FULL_NAME, body.PHONE, body.EMAIL, body.ADDRESS,
        body.GENDER, body.MARITAL_STATUS, body.DATE_OF_BIRTH, body.OCCUPATION,
        body.DATE_ENROLLED or datetime.now().strftime("%Y-%m-%d"),
        body.FACILITATOR, body.CLASS_STATUS or "ENROLLED",
        "", "", "", body.NOTES, u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "sn": sn, "message": f"'{body.FULL_NAME}' enrolled in New Class."}


@app.patch("/api/new-class-members/{sn}/complete", tags=["NewClass"])
def complete_new_class_member(sn: str, u: CurrentUser = Depends(require_admin)):
    """
    Mark complete → assign MEMBERSHIP_NUMBER → create MemberDetails_db record.
    """
    records = sheet_to_list("NewClassMembers_db")
    person  = next((p for p in records if str(p.get("S_N", "")).strip() == sn), None)
    if not person:
        raise HTTPException(404, f"New class member '{sn}' not found.")

    year       = datetime.now().strftime("%Y")
    all_members = sheet_to_list("MemberDetails_db")
    seq        = sum(1 for m in all_members
                     if str(m.get("MEMBERSHIP_NUMBER", "")).startswith(f"AFC-UTH-{year}")) + 1
    mem_no     = f"AFC-UTH-{year}-{seq:04d}"

    rn = find_row_by_sn("NewClassMembers_db", sn)
    update_row("NewClassMembers_db", rn, [
        person.get("S_N", sn), person.get("FULL_NAME", ""), person.get("PHONE", ""),
        person.get("EMAIL", ""), person.get("ADDRESS", ""), person.get("GENDER", ""),
        person.get("MARITAL_STATUS", ""), person.get("DATE_OF_BIRTH", ""),
        person.get("OCCUPATION", ""), person.get("DATE_ENROLLED", ""),
        person.get("FACILITATOR", ""), "COMPLETED",
        datetime.now().strftime("%Y-%m-%d"), mem_no,
        person.get("BAPTISM_DATE", ""), person.get("NOTES", ""),
        u.username, person.get("CHURCH_BRANCH", "AFC UTHIRU"),
    ])

    dept1   = derive_department_1(person.get("GENDER", ""), person.get("MARITAL_STATUS", ""),
                                   person.get("DATE_OF_BIRTH", ""))
    mem_sn  = next_sn("MemberDetails_db")
    append_row("MemberDetails_db", [
        mem_sn, "", person.get("FULL_NAME", ""), person.get("ADDRESS", ""),
        "", "",  # LOCATION_AREA, HOME_CHURCH
        person.get("PHONE", ""), person.get("EMAIL", ""), person.get("GENDER", ""),
        person.get("MARITAL_STATUS", ""), person.get("DATE_OF_BIRTH", ""),
        person.get("OCCUPATION", ""), dept1,
        datetime.now().strftime("%Y-%m-%d"), "ACTIVE MEMBER", mem_no,
        "", "", "", person.get("BAPTISM_DATE", ""), "", "",
        person.get("CHURCH_BRANCH", "AFC UTHIRU"),
        "", "", "",  # NOK fields
        u.username, now_str(),
    ])

    return {
        "status": "success", "membership_number": mem_no, "member_sn": mem_sn,
        "message": f"'{person.get('FULL_NAME','')}' is now a full member ({mem_no}).",
    }


# ═══════════════════════════════════════════════════════════════
# SERVICES
# ═══════════════════════════════════════════════════════════════

@app.get("/api/services", tags=["Services"])
def list_services(_: CurrentUser = Depends(require_user)):
    return sheet_to_list("ServiceRegister_db")


@app.get("/api/services/{sn}", tags=["Services"])
def get_service(sn: str, _: CurrentUser = Depends(require_user)):
    s = next((x for x in sheet_to_list("ServiceRegister_db")
              if str(x.get("S_N", "")).strip() == sn), None)
    if not s:
        raise HTTPException(404, f"Service '{sn}' not found.")
    return s


@app.post("/api/services", tags=["Services"])
def add_service(body: ServiceIn, u: CurrentUser = Depends(require_user)):
    """
    Creates service with auto-generated SVC-YYYYMMDD-NNN S_N.
    Attendance counts start at 0 — filled by the attendance endpoints.
    Returns attendance_url for the front-end to redirect the clerk.
    """
    sn    = next_session_id("SVC", "ServiceRegister_db", body.DATE)
    total = sum([body.TITHES or 0, body.OFFERING or 0, body.BUILDING_OFFERING or 0,
                 body.THANKSGIVING or 0, body.SEED_OFFERING or 0,
                 body.WELFARE_OFFERING or 0, body.OTHER_OFFERING or 0])
    append_row("ServiceRegister_db", [
        sn, body.DATE, body.OPENING_TIME, body.CLOSING_TIME, body.NATURE_OF_SERVICE,
        body.PREACHER, body.SCRIPTURE_READING, body.SERMON_TOPIC,
        0, 0, 0, 0, 0,   # attendance counts — auto-filled after marking
        body.TITHES or 0, body.OFFERING or 0, body.BUILDING_OFFERING or 0,
        body.THANKSGIVING or 0, body.SEED_OFFERING or 0,
        body.WELFARE_OFFERING or 0, body.OTHER_OFFERING or 0, total,
        u.username, body.CHURCH_BRANCH,
    ])
    return {
        "status": "success", "service_id": sn,
        "attendance_url": f"/api/attendance/roster/SERVICE/{sn}",
        "message": f"Service '{sn}' created.",
    }


@app.put("/api/services/{sn}", tags=["Services"])
def update_service(sn: str, body: ServiceIn, u: CurrentUser = Depends(require_user)):
    existing = next((x for x in sheet_to_list("ServiceRegister_db")
                     if str(x.get("S_N", "")).strip() == sn), None)
    if not existing:
        raise HTTPException(404, f"Service '{sn}' not found.")
    rn    = find_row_by_sn("ServiceRegister_db", sn)
    total = sum([body.TITHES or 0, body.OFFERING or 0, body.BUILDING_OFFERING or 0,
                 body.THANKSGIVING or 0, body.SEED_OFFERING or 0,
                 body.WELFARE_OFFERING or 0, body.OTHER_OFFERING or 0])
    update_row("ServiceRegister_db", rn, [
        sn, body.DATE, body.OPENING_TIME, body.CLOSING_TIME, body.NATURE_OF_SERVICE,
        body.PREACHER, body.SCRIPTURE_READING, body.SERMON_TOPIC,
        existing.get("ATTENDANCE_MEN", 0), existing.get("ATTENDANCE_WOMEN", 0),
        existing.get("ATTENDANCE_YOUTH", 0), existing.get("ATTENDANCE_CHILDREN", 0),
        existing.get("TOTAL_ATTENDANCE", 0),
        body.TITHES or 0, body.OFFERING or 0, body.BUILDING_OFFERING or 0,
        body.THANKSGIVING or 0, body.SEED_OFFERING or 0,
        body.WELFARE_OFFERING or 0, body.OTHER_OFFERING or 0, total,
        u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "message": f"Service '{sn}' updated."}


@app.delete("/api/services/{sn}", tags=["Services"])
def delete_service(sn: str, _: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("ServiceRegister_db", sn)
    if not rn:
        raise HTTPException(404, f"Service '{sn}' not found.")
    clear_row("ServiceRegister_db", rn)
    return {"status": "success", "message": f"Service '{sn}' deleted."}


# ═══════════════════════════════════════════════════════════════
# EVENTS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/events", tags=["Events"])
def list_events(_: CurrentUser = Depends(require_user)):
    return sheet_to_list("EventsRegister_db")


@app.get("/api/events/{sn}", tags=["Events"])
def get_event(sn: str, _: CurrentUser = Depends(require_user)):
    e = next((x for x in sheet_to_list("EventsRegister_db")
              if str(x.get("S_N", "")).strip() == sn), None)
    if not e:
        raise HTTPException(404, f"Event '{sn}' not found.")
    return e


@app.post("/api/events", tags=["Events"])
def add_event(body: EventIn, u: CurrentUser = Depends(require_user)):
    sn = next_session_id("EVT", "EventsRegister_db", body.EVENT_DATE)
    append_row("EventsRegister_db", [
        sn, body.EVENT_TITLE, body.EVENT_DESCRIPTION, body.EVENT_DATE,
        body.EVENT_TIME, body.EVENT_LOCATION, body.TARGETED_GROUP,
        body.PASTOR_IN_CHARGE, body.PHONE, body.APPROVED_BY or "",
        0, 0, 0, 0, 0,   # attendance counts
        u.username, body.CHURCH_BRANCH,
    ])
    return {
        "status": "success", "event_id": sn,
        "attendance_url": f"/api/attendance/roster/EVENT/{sn}",
        "message": f"Event '{sn}' created.",
    }


@app.put("/api/events/{sn}", tags=["Events"])
def update_event(sn: str, body: EventIn, u: CurrentUser = Depends(require_admin)):
    existing = next((x for x in sheet_to_list("EventsRegister_db")
                     if str(x.get("S_N", "")).strip() == sn), None)
    if not existing:
        raise HTTPException(404, f"Event '{sn}' not found.")
    rn = find_row_by_sn("EventsRegister_db", sn)
    update_row("EventsRegister_db", rn, [
        sn, body.EVENT_TITLE, body.EVENT_DESCRIPTION, body.EVENT_DATE,
        body.EVENT_TIME, body.EVENT_LOCATION, body.TARGETED_GROUP,
        body.PASTOR_IN_CHARGE, body.PHONE, body.APPROVED_BY or "",
        existing.get("ATTENDANCE_MEN", 0), existing.get("ATTENDANCE_WOMEN", 0),
        existing.get("ATTENDANCE_YOUTH", 0), existing.get("ATTENDANCE_CHILDREN", 0),
        existing.get("TOTAL_ATTENDANCE", 0),
        u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "message": f"Event '{sn}' updated."}


@app.delete("/api/events/{sn}", tags=["Events"])
def delete_event(sn: str, _: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("EventsRegister_db", sn)
    if not rn:
        raise HTTPException(404, f"Event '{sn}' not found.")
    clear_row("EventsRegister_db", rn)
    return {"status": "success", "message": f"Event '{sn}' deleted."}


# ═══════════════════════════════════════════════════════════════
# ATTENDANCE
# ═══════════════════════════════════════════════════════════════

def _parent_sheet(session_type: str) -> str:
    t = session_type.upper()
    if t == "SERVICE":
        return "ServiceRegister_db"
    if t == "EVENT":
        return "EventsRegister_db"
    raise HTTPException(400, "session_type must be SERVICE or EVENT.")


def _parent_record(session_type: str, session_id: str) -> dict:
    sheet = _parent_sheet(session_type)
    rec   = next((r for r in sheet_to_list(sheet)
                  if str(r.get("S_N", "")).strip() == session_id), None)
    if not rec:
        raise HTTPException(404, f"{session_type} '{session_id}' not found.")
    return rec


def _recalc_counts(session_id: str) -> dict:
    counts = {"MEN": 0, "WOMEN": 0, "YOUTH": 0, "CHILDREN": 0}
    for a in sheet_to_list("Attendance_db"):
        if str(a.get("SESSION_ID", "")).strip() != session_id:
            continue
        if str(a.get("MARKED_PRESENT", "")).strip().upper() != "TRUE":
            continue
        cat = str(a.get("GENDER_CATEGORY", "")).strip().upper()
        if cat == "MAN":    counts["MEN"]      += 1
        elif cat == "WOMAN":  counts["WOMEN"]    += 1
        elif cat == "YOUTH":  counts["YOUTH"]    += 1
        elif cat == "CHILD":  counts["CHILDREN"] += 1
    counts["TOTAL"] = sum(counts.values())
    return counts


def _push_counts(session_type: str, session_id: str, counts: dict):
    sheet = _parent_sheet(session_type)
    rn    = find_row_by_sn(sheet, session_id)
    if not rn:
        return
    # Attendance cols I-M (columns 9-13) in both ServiceRegister_db and EventsRegister_db
    update_cell(sheet, rn, "I", counts["MEN"])
    update_cell(sheet, rn, "J", counts["WOMEN"])
    update_cell(sheet, rn, "K", counts["YOUTH"])
    update_cell(sheet, rn, "L", counts["CHILDREN"])
    update_cell(sheet, rn, "M", counts["TOTAL"])


@app.get("/api/attendance/roster/{session_type}/{session_id}", tags=["Attendance"])
def get_roster(session_type: str, session_id: str, _: CurrentUser = Depends(require_user)):
    """
    Returns every member with profile_photo_url, member_name, phone,
    department_1, and is_present (true/false) for this session.
    """
    parent  = _parent_record(session_type, session_id)
    members = sheet_to_list("MemberDetails_db")
    present_sns = {
        str(a.get("MEMBER_SN", "")).strip()
        for a in sheet_to_list("Attendance_db")
        if str(a.get("SESSION_ID", "")).strip() == session_id
        and str(a.get("MARKED_PRESENT", "")).strip().upper() == "TRUE"
    }
    date_field  = "DATE" if session_type.upper() == "SERVICE" else "EVENT_DATE"
    title_field = "SERMON_TOPIC" if session_type.upper() == "SERVICE" else "EVENT_TITLE"
    return {
        "session_type":  session_type.upper(),
        "session_id":    session_id,
        "session_date":  parent.get(date_field, ""),
        "session_title": parent.get(title_field, "") or parent.get("NATURE_OF_SERVICE", ""),
        "roster": [
            {
                "member_sn":          str(m.get("S_N", "")),
                "profile_photo_url":  m.get("PROFILE_PHOTO_URL", ""),
                "member_name":        m.get("MEMBER_NAME", ""),
                "phone":              m.get("PHONE", ""),
                "department_1":       m.get("DEPARTMENT_1", ""),
                "is_present":         str(m.get("S_N", "")).strip() in present_sns,
            }
            for m in members
        ],
    }


@app.post("/api/attendance/mark", tags=["Attendance"])
def mark_attendance(body: AttendanceMark, u: CurrentUser = Depends(require_user)):
    """
    Mark member_sns present for a session (idempotent — re-marking is skipped).
    Recalculates and writes attendance counts back to the parent record.
    """
    st     = body.session_type.upper()
    parent = _parent_record(st, body.session_id)
    members_map = {str(m.get("S_N", "")).strip(): m for m in sheet_to_list("MemberDetails_db")}
    already = {
        str(a.get("MEMBER_SN", "")).strip()
        for a in sheet_to_list("Attendance_db")
        if str(a.get("SESSION_ID", "")).strip() == body.session_id
        and str(a.get("MARKED_PRESENT", "")).strip().upper() == "TRUE"
    }
    date_field  = "DATE" if st == "SERVICE" else "EVENT_DATE"
    title_field = "SERMON_TOPIC" if st == "SERVICE" else "EVENT_TITLE"
    s_date  = parent.get(date_field, "")
    s_title = parent.get(title_field, "") or parent.get("NATURE_OF_SERVICE", "")

    newly = 0
    ts    = now_str()
    for msn in body.member_sns:
        msn = str(msn).strip()
        if msn in already:
            continue
        member = members_map.get(msn)
        if not member:
            continue
        cat = derive_gender_category(member.get("SEX", ""), member.get("DATE_OF_BIRTH", ""))
        sn  = next_sn("Attendance_db")
        append_row("Attendance_db", [
            sn, st, body.session_id, s_date, s_title,
            msn, member.get("MEMBER_NAME", ""), member.get("PHONE", ""),
            member.get("DEPARTMENT_1", ""), cat, "TRUE", ts, u.username, "AFC UTHIRU",
        ])
        newly += 1

    counts = _recalc_counts(body.session_id)
    _push_counts(st, body.session_id, counts)
    return {"status": "success", "newly_marked": newly, "counts": counts}


@app.delete("/api/attendance/unmark", tags=["Attendance"])
def unmark_attendance(body: AttendanceUnmark, u: CurrentUser = Depends(require_user)):
    """Sets MARKED_PRESENT = FALSE for a member/session (audit row kept)."""
    _parent_record(body.session_type.upper(), body.session_id)
    records = sheet_to_list("Attendance_db")
    target  = next(
        (a for a in records
         if str(a.get("SESSION_ID", "")).strip() == body.session_id
         and str(a.get("MEMBER_SN", "")).strip() == str(body.member_sn).strip()
         and str(a.get("MARKED_PRESENT", "")).strip().upper() == "TRUE"),
        None
    )
    if not target:
        raise HTTPException(404, "No active attendance record found for this member/session.")
    rn = find_row_by_sn("Attendance_db", target["S_N"])
    update_cell("Attendance_db", rn, "K", "FALSE")
    counts = _recalc_counts(body.session_id)
    _push_counts(body.session_type.upper(), body.session_id, counts)
    return {"status": "success", "message": "Member unmarked.", "counts": counts}


@app.get("/api/attendance/{session_id}/summary", tags=["Attendance"])
def attendance_summary(session_id: str, _: CurrentUser = Depends(require_user)):
    records = sheet_to_list("Attendance_db")
    present = [a for a in records
               if str(a.get("SESSION_ID", "")).strip() == session_id
               and str(a.get("MARKED_PRESENT", "")).strip().upper() == "TRUE"]
    counts  = _recalc_counts(session_id)
    return {
        "session_id": session_id,
        "counts":     counts,
        "attendees":  [
            {"member_name":  a.get("MEMBER_NAME", ""),
             "phone":        a.get("PHONE", ""),
             "department_1": a.get("DEPARTMENT_1", "")}
            for a in present
        ],
    }


# ═══════════════════════════════════════════════════════════════
# REPORTS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/reports/service/{sn}", tags=["Reports"])
def service_report(sn: str, _: CurrentUser = Depends(require_user)):
    service = next((s for s in sheet_to_list("ServiceRegister_db")
                    if str(s.get("S_N", "")).strip() == sn), None)
    if not service:
        raise HTTPException(404, f"Service '{sn}' not found.")

    records  = sheet_to_list("Attendance_db")
    attendees = [
        {"member_name":  a.get("MEMBER_NAME", ""),
         "phone":        a.get("PHONE", ""),
         "department_1": a.get("DEPARTMENT_1", "")}
        for a in records
        if str(a.get("SESSION_ID", "")).strip() == sn
        and str(a.get("MARKED_PRESENT", "")).strip().upper() == "TRUE"
    ]
    return {
        "service_details": {k: service.get(k, "") for k in [
            "S_N", "DATE", "OPENING_TIME", "CLOSING_TIME", "NATURE_OF_SERVICE",
            "PREACHER", "SCRIPTURE_READING", "SERMON_TOPIC", "RECORD_OFFICER", "CHURCH_BRANCH"
        ]},
        "attendance_summary": {k: service.get(k, 0) for k in [
            "ATTENDANCE_MEN", "ATTENDANCE_WOMEN", "ATTENDANCE_YOUTH",
            "ATTENDANCE_CHILDREN", "TOTAL_ATTENDANCE"
        ]},
        "offerings_summary": {k: service.get(k, 0) for k in [
            "TITHES", "OFFERING", "BUILDING_OFFERING", "THANKSGIVING",
            "SEED_OFFERING", "WELFARE_OFFERING", "OTHER_OFFERING", "TOTAL_OFFERING"
        ]},
        "attendees": attendees,   # NO profile_photo_url
    }


@app.get("/api/reports/event/{sn}", tags=["Reports"])
def event_report(sn: str, _: CurrentUser = Depends(require_user)):
    event = next((e for e in sheet_to_list("EventsRegister_db")
                  if str(e.get("S_N", "")).strip() == sn), None)
    if not event:
        raise HTTPException(404, f"Event '{sn}' not found.")
    records  = sheet_to_list("Attendance_db")
    attendees = [
        {"member_name":  a.get("MEMBER_NAME", ""),
         "phone":        a.get("PHONE", ""),
         "department_1": a.get("DEPARTMENT_1", "")}
        for a in records
        if str(a.get("SESSION_ID", "")).strip() == sn
        and str(a.get("MARKED_PRESENT", "")).strip().upper() == "TRUE"
    ]
    return {
        "event_details": {k: event.get(k, "") for k in [
            "S_N", "EVENT_TITLE", "EVENT_DESCRIPTION", "EVENT_DATE", "EVENT_TIME",
            "EVENT_LOCATION", "TARGETED_GROUP", "PASTOR_IN_CHARGE", "PHONE",
            "APPROVED_BY", "RECORD_OFFICER", "CHURCH_BRANCH"
        ]},
        "attendance_summary": {k: event.get(k, 0) for k in [
            "ATTENDANCE_MEN", "ATTENDANCE_WOMEN", "ATTENDANCE_YOUTH",
            "ATTENDANCE_CHILDREN", "TOTAL_ATTENDANCE"
        ]},
        "attendees": attendees,
    }


# ═══════════════════════════════════════════════════════════════
# INCOME
# ═══════════════════════════════════════════════════════════════

@app.get("/api/income", tags=["Finance"])
def list_income(_: CurrentUser = Depends(require_user)):
    return sheet_to_list("Income_db")


@app.get("/api/income/{sn}", tags=["Finance"])
def get_income(sn: str, _: CurrentUser = Depends(require_user)):
    r = next((x for x in sheet_to_list("Income_db") if str(x.get("S_N", "")).strip() == sn), None)
    if not r:
        raise HTTPException(404, f"Income record '{sn}' not found.")
    return r


@app.post("/api/income", tags=["Finance"])
def add_income(body: IncomeIn, u: CurrentUser = Depends(require_user)):
    sn    = next_sn("Income_db")
    total = sum([body.TITHES or 0, body.OFFERING or 0, body.BUILDING_OFFERING or 0,
                 body.GENERAL_THANKSGIVING or 0, body.SPECIAL_THANKSGIVING or 0,
                 body.DONATIONS or 0, body.PLEDGES or 0, body.SEED_OFFERING or 0,
                 body.WELFARE_OFFERING or 0, body.HARVEST or 0,
                 body.PROJECT or 0, body.OTHER_INCOME or 0])
    append_row("Income_db", [
        sn, body.DATE, body.SERVICE_TYPE,
        body.TITHES or 0, body.OFFERING or 0, body.BUILDING_OFFERING or 0,
        body.GENERAL_THANKSGIVING or 0, body.SPECIAL_THANKSGIVING or 0,
        body.DONATIONS or 0, body.PLEDGES or 0, body.SEED_OFFERING or 0,
        body.WELFARE_OFFERING or 0, body.HARVEST or 0,
        body.PROJECT or 0, body.OTHER_INCOME or 0, total,
        u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "sn": sn, "total": total, "message": "Income record added."}


@app.put("/api/income/{sn}", tags=["Finance"])
def update_income(sn: str, body: IncomeIn, u: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("Income_db", sn)
    if not rn:
        raise HTTPException(404, f"Income record '{sn}' not found.")
    total = sum([body.TITHES or 0, body.OFFERING or 0, body.BUILDING_OFFERING or 0,
                 body.GENERAL_THANKSGIVING or 0, body.SPECIAL_THANKSGIVING or 0,
                 body.DONATIONS or 0, body.PLEDGES or 0, body.SEED_OFFERING or 0,
                 body.WELFARE_OFFERING or 0, body.HARVEST or 0,
                 body.PROJECT or 0, body.OTHER_INCOME or 0])
    update_row("Income_db", rn, [
        sn, body.DATE, body.SERVICE_TYPE,
        body.TITHES or 0, body.OFFERING or 0, body.BUILDING_OFFERING or 0,
        body.GENERAL_THANKSGIVING or 0, body.SPECIAL_THANKSGIVING or 0,
        body.DONATIONS or 0, body.PLEDGES or 0, body.SEED_OFFERING or 0,
        body.WELFARE_OFFERING or 0, body.HARVEST or 0,
        body.PROJECT or 0, body.OTHER_INCOME or 0, total,
        u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "message": f"Income record '{sn}' updated."}


@app.delete("/api/income/{sn}", tags=["Finance"])
def delete_income(sn: str, _: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("Income_db", sn)
    if not rn:
        raise HTTPException(404, f"Income record '{sn}' not found.")
    clear_row("Income_db", rn)
    return {"status": "success", "message": f"Income record '{sn}' deleted."}


# ═══════════════════════════════════════════════════════════════
# EXPENSES
# ═══════════════════════════════════════════════════════════════

@app.get("/api/expenses", tags=["Finance"])
def list_expenses(_: CurrentUser = Depends(require_user)):
    return sheet_to_list("Expenses_db")


@app.get("/api/expenses/{sn}", tags=["Finance"])
def get_expense(sn: str, _: CurrentUser = Depends(require_user)):
    r = next((x for x in sheet_to_list("Expenses_db") if str(x.get("S_N", "")).strip() == sn), None)
    if not r:
        raise HTTPException(404, f"Expense '{sn}' not found.")
    return r


@app.post("/api/expenses", tags=["Finance"])
def add_expense(body: ExpenseIn, u: CurrentUser = Depends(require_user)):
    sn    = next_sn("Expenses_db")
    total = (body.QTY or 1) * (body.UNIT_RATE or 0)
    append_row("Expenses_db", [
        sn, body.DATE, body.EXPENSE_DESCRIPTION, body.CATEGORY,
        body.QTY or 1, body.UNIT_RATE or 0, total,
        body.PAYMENT_METHOD, body.PAID_TO, body.APPROVED_BY, body.RECEIPT_NO,
        u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "sn": sn, "total_cost": total, "message": "Expense added."}


@app.put("/api/expenses/{sn}", tags=["Finance"])
def update_expense(sn: str, body: ExpenseIn, u: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("Expenses_db", sn)
    if not rn:
        raise HTTPException(404, f"Expense '{sn}' not found.")
    total = (body.QTY or 1) * (body.UNIT_RATE or 0)
    update_row("Expenses_db", rn, [
        sn, body.DATE, body.EXPENSE_DESCRIPTION, body.CATEGORY,
        body.QTY or 1, body.UNIT_RATE or 0, total,
        body.PAYMENT_METHOD, body.PAID_TO, body.APPROVED_BY, body.RECEIPT_NO,
        u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "message": f"Expense '{sn}' updated."}


@app.delete("/api/expenses/{sn}", tags=["Finance"])
def delete_expense(sn: str, _: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("Expenses_db", sn)
    if not rn:
        raise HTTPException(404, f"Expense '{sn}' not found.")
    clear_row("Expenses_db", rn)
    return {"status": "success", "message": f"Expense '{sn}' deleted."}


# ═══════════════════════════════════════════════════════════════
# TITHERS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/tithes", tags=["Finance"])
def list_tithes(_: CurrentUser = Depends(require_user)):
    return sheet_to_list("TithersDB")


@app.post("/api/tithes", tags=["Finance"])
def add_tithe(body: TitheIn, u: CurrentUser = Depends(require_user)):
    sn = next_sn("TithersDB")
    append_row("TithersDB", [
        sn, body.DATE, body.PAYERS_NAME, body.PHONE, body.MEMBER_SN or "",
        body.AMOUNT, body.PAYMENT_METHOD, u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "sn": sn, "message": "Tithe record added."}


@app.delete("/api/tithes/{sn}", tags=["Finance"])
def delete_tithe(sn: str, _: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("TithersDB", sn)
    if not rn:
        raise HTTPException(404, f"Tithe record '{sn}' not found.")
    clear_row("TithersDB", rn)
    return {"status": "success", "message": f"Tithe record '{sn}' deleted."}


# ═══════════════════════════════════════════════════════════════
# PAYROLL
# ═══════════════════════════════════════════════════════════════

@app.get("/api/payroll", tags=["Finance"])
def list_payroll(_: CurrentUser = Depends(require_admin)):
    return sheet_to_list("Payroll_db")


@app.post("/api/payroll", tags=["Finance"])
def add_payroll(body: PayrollIn, u: CurrentUser = Depends(require_admin)):
    sn      = next_sn("Payroll_db")
    net_pay = body.GROSS_PAY - (body.DEDUCTION or 0)
    append_row("Payroll_db", [
        sn, body.PAY_DATE, body.STAFF_ID or "", body.STAFF_NAME, body.ROLE_TITLE or "",
        body.GROSS_PAY, body.DEDUCTION or 0, body.DEDUCTION_REASON or "", net_pay,
        body.PAYMENT_METHOD, body.BANK_ACCOUNT or "", u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "sn": sn, "net_pay": net_pay, "message": "Payroll record added."}


@app.delete("/api/payroll/{sn}", tags=["Finance"])
def delete_payroll(sn: str, _: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("Payroll_db", sn)
    if not rn:
        raise HTTPException(404, f"Payroll record '{sn}' not found.")
    clear_row("Payroll_db", rn)
    return {"status": "success", "message": f"Payroll record '{sn}' deleted."}


# ═══════════════════════════════════════════════════════════════
# BALANCE SHEET
# ═══════════════════════════════════════════════════════════════

@app.get("/api/balance-sheet", tags=["Finance"])
def list_balance_sheet(_: CurrentUser = Depends(require_admin)):
    return sheet_to_list("Balancesheet_db")


@app.post("/api/balance-sheet", tags=["Finance"])
def add_balance_sheet_entry(body: BalanceSheetIn, u: CurrentUser = Depends(require_admin)):
    sn  = next_sn("Balancesheet_db")
    net = body.TOTAL_INCOME - body.TOTAL_EXPENSES
    append_row("Balancesheet_db", [
        sn, body.PERIOD, body.PERIOD_TYPE, body.TOTAL_INCOME,
        body.TOTAL_EXPENSES, net, body.NOTES, u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "sn": sn, "net_balance": net, "message": "Balance sheet entry added."}


# ═══════════════════════════════════════════════════════════════
# INVENTORY
# ═══════════════════════════════════════════════════════════════

@app.get("/api/inventory", tags=["Operations"])
def list_inventory(_: CurrentUser = Depends(require_user)):
    return sheet_to_list("Inventory_db")


@app.get("/api/inventory/{sn}", tags=["Operations"])
def get_inventory_item(sn: str, _: CurrentUser = Depends(require_user)):
    r = next((x for x in sheet_to_list("Inventory_db") if str(x.get("S_N", "")).strip() == sn), None)
    if not r:
        raise HTTPException(404, f"Inventory item '{sn}' not found.")
    return r


@app.post("/api/inventory", tags=["Operations"])
def add_inventory_item(body: InventoryIn, u: CurrentUser = Depends(require_admin)):
    sn    = next_sn("Inventory_db")
    total = (body.QUANTITY or 1) * (body.UNIT_VALUE or 0)
    append_row("Inventory_db", [
        sn, body.ITEM_CODE or "", body.ITEM_NAME, body.CATEGORY,
        body.QUANTITY or 1, body.UNIT or "", body.UNIT_VALUE or 0, total,
        body.PURCHASE_DATE, body.SUPPLIER, body.STATUS or "GOOD",
        body.LOCATION, body.LAST_INSPECTED, body.NOTES, u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "sn": sn, "total_value": total, "message": "Inventory item added."}


@app.put("/api/inventory/{sn}", tags=["Operations"])
def update_inventory_item(sn: str, body: InventoryIn, u: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("Inventory_db", sn)
    if not rn:
        raise HTTPException(404, f"Inventory item '{sn}' not found.")
    total = (body.QUANTITY or 1) * (body.UNIT_VALUE or 0)
    update_row("Inventory_db", rn, [
        sn, body.ITEM_CODE or "", body.ITEM_NAME, body.CATEGORY,
        body.QUANTITY or 1, body.UNIT or "", body.UNIT_VALUE or 0, total,
        body.PURCHASE_DATE, body.SUPPLIER, body.STATUS or "GOOD",
        body.LOCATION, body.LAST_INSPECTED, body.NOTES, u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "message": f"Inventory item '{sn}' updated."}


@app.delete("/api/inventory/{sn}", tags=["Operations"])
def delete_inventory_item(sn: str, _: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("Inventory_db", sn)
    if not rn:
        raise HTTPException(404, f"Inventory item '{sn}' not found.")
    clear_row("Inventory_db", rn)
    return {"status": "success", "message": f"Inventory item '{sn}' deleted."}


# ═══════════════════════════════════════════════════════════════
# FACILITY MANAGEMENT
# ═══════════════════════════════════════════════════════════════

@app.get("/api/facility", tags=["Operations"])
def list_facility(_: CurrentUser = Depends(require_user)):
    return sheet_to_list("Facility_Mgt_db")


@app.post("/api/facility", tags=["Operations"])
def add_facility_record(body: FacilityIn, u: CurrentUser = Depends(require_user)):
    sn = next_sn("Facility_Mgt_db")
    append_row("Facility_Mgt_db", [
        sn, body.FACILITY_NAME, body.BOOKING_DATE, body.BOOKING_TIME,
        body.BOOKING_PURPOSE, body.BOOKED_BY, body.PHONE, body.BOOKING_STATUS or "AVAILABLE",
        body.LAST_MAINTENANCE_DATE, body.NEXT_DUE_DATE, body.MAINTENANCE_EXPENSES or 0,
        body.MAINTENANCE_NOTES, u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "sn": sn, "message": "Facility record added."}


@app.put("/api/facility/{sn}", tags=["Operations"])
def update_facility_record(sn: str, body: FacilityIn, u: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("Facility_Mgt_db", sn)
    if not rn:
        raise HTTPException(404, f"Facility record '{sn}' not found.")
    update_row("Facility_Mgt_db", rn, [
        sn, body.FACILITY_NAME, body.BOOKING_DATE, body.BOOKING_TIME,
        body.BOOKING_PURPOSE, body.BOOKED_BY, body.PHONE, body.BOOKING_STATUS or "AVAILABLE",
        body.LAST_MAINTENANCE_DATE, body.NEXT_DUE_DATE, body.MAINTENANCE_EXPENSES or 0,
        body.MAINTENANCE_NOTES, u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "message": f"Facility record '{sn}' updated."}


@app.delete("/api/facility/{sn}", tags=["Operations"])
def delete_facility_record(sn: str, _: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("Facility_Mgt_db", sn)
    if not rn:
        raise HTTPException(404, f"Facility record '{sn}' not found.")
    clear_row("Facility_Mgt_db", rn)
    return {"status": "success", "message": f"Facility record '{sn}' deleted."}


# ═══════════════════════════════════════════════════════════════
# DUTY ROSTER
# ═══════════════════════════════════════════════════════════════

@app.get("/api/duty-roster", tags=["Operations"])
def list_duty_roster(_: CurrentUser = Depends(require_user)):
    return sheet_to_list("DutyRoster_db")


@app.post("/api/duty-roster", tags=["Operations"])
def add_duty_roster(body: DutyRosterIn, u: CurrentUser = Depends(require_admin)):
    sn = next_sn("DutyRoster_db")
    append_row("DutyRoster_db", [
        sn, body.DUTY_TITLE, body.DEPARTMENT, body.DATE,
        body.TIME_ALLOCATED, body.TEAM_LEADER,
        body.TEAM_MEMBER_1, body.TEAM_MEMBER_2, body.TEAM_MEMBER_3, body.TEAM_MEMBER_4,
        "", body.NOTES, u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "sn": sn, "message": "Duty roster entry added."}


@app.put("/api/duty-roster/{sn}", tags=["Operations"])
def update_duty_roster(sn: str, body: DutyRosterIn, u: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("DutyRoster_db", sn)
    if not rn:
        raise HTTPException(404, f"Duty roster entry '{sn}' not found.")
    update_row("DutyRoster_db", rn, [
        sn, body.DUTY_TITLE, body.DEPARTMENT, body.DATE,
        body.TIME_ALLOCATED, body.TEAM_LEADER,
        body.TEAM_MEMBER_1, body.TEAM_MEMBER_2, body.TEAM_MEMBER_3, body.TEAM_MEMBER_4,
        "", body.NOTES, u.username, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "message": f"Duty roster entry '{sn}' updated."}


@app.delete("/api/duty-roster/{sn}", tags=["Operations"])
def delete_duty_roster(sn: str, _: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("DutyRoster_db", sn)
    if not rn:
        raise HTTPException(404, f"Duty roster entry '{sn}' not found.")
    clear_row("DutyRoster_db", rn)
    return {"status": "success", "message": f"Duty roster entry '{sn}' deleted."}


# ═══════════════════════════════════════════════════════════════
# ORDER OF PROGRAM
# ═══════════════════════════════════════════════════════════════

@app.get("/api/program/{session_id}", tags=["Operations"])
def get_program(session_id: str, _: CurrentUser = Depends(require_user)):
    rows = sheet_to_list("Order_of_Program_db")
    return [r for r in rows if str(r.get("SESSION_ID", "")).strip() == session_id]


@app.post("/api/program", tags=["Operations"])
def add_program_item(body: ProgramItemIn, u: CurrentUser = Depends(require_user)):
    sn = next_sn("Order_of_Program_db")
    append_row("Order_of_Program_db", [
        sn, body.SESSION_ID, body.SESSION_DATE, body.SESSION_TYPE,
        body.NATURE_OF_SERVICE, body.ITEM_NO, body.PROGRAM_SECTION,
        body.TIME_ALLOCATED, body.OFFICIANT, body.NOTES, body.CHURCH_BRANCH,
    ])
    return {"status": "success", "sn": sn, "message": "Program item added."}


@app.delete("/api/program/{sn}", tags=["Operations"])
def delete_program_item(sn: str, _: CurrentUser = Depends(require_admin)):
    rn = find_row_by_sn("Order_of_Program_db", sn)
    if not rn:
        raise HTTPException(404, f"Program item '{sn}' not found.")
    clear_row("Order_of_Program_db", rn)
    return {"status": "success", "message": f"Program item '{sn}' deleted."}