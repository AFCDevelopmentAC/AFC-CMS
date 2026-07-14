"""
AFC Uthiru Church Management System — FastAPI Sync Engine
v1.4 — Fixed header row (row 6), correct sheet names, full feature set.
"""

import os
import json
import secrets
from datetime import datetime, timedelta, timezone, date
from typing import Optional

import bcrypt
import httpx
from fastapi import FastAPI, HTTPException, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel
from googleapiclient.discovery import build
from google.oauth2.service_account import Credentials

app = FastAPI(title="AFC Uthiru CMS API", version="1.4.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://afc-cms.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=0,
)

CREDENTIALS_FILE = "afs-uthiru-cms-de0018a945c1.json"
SPREADSHEET_ID   = os.environ.get("SPREADSHEET_ID", "1tX_G4wlCKKRuPVPr-jy5f992jnmlp0y_3s-yd-UNkTs")
SCOPES           = ["https://www.googleapis.com/auth/spreadsheets"]
SECRET_KEY       = os.environ.get("SECRET_KEY", "CHANGE-THIS-BEFORE-PRODUCTION-AFC-UTHIRU")
ALGORITHM        = "HS256"
TOKEN_EXPIRY_MIN = 480
RESEND_API_KEY   = os.environ.get("RESEND_API_KEY", "re_T48XHsER_78VVzPcxUNCiJEQRV52fDUTK")
RESEND_FROM      = os.environ.get("RESEND_FROM", "onboarding@resend.dev")
FRONTEND_URL     = os.environ.get("FRONTEND_URL", "https://afc-cms.vercel.app")

# ── Sheet name constants (single source of truth) ────────────────
SH_USERS       = "Users_db"
SH_MEMBERS     = "MemberDetails_db"      # ← correct sheet name
SH_DEPARTMENTS = "Departments_db"
SH_MEMBER_DEPT = "MemberDepartments_db"
SH_SERVICES    = "ServiceRegister_db"
SH_EVENTS      = "EventsRegister_db"
SH_ATTENDANCE  = "Attendance_db"
SH_AUDIT       = "AuditLog_db"
SH_RESET       = "ResetTokens_db"

# All sheets have headers on row 6, data from row 7
HEADER_ROW = 6

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ═══════════════════════════════════════════════════════════════
# GOOGLE SHEETS HELPERS
# ═══════════════════════════════════════════════════════════════

def _service():
    creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if creds_json:
        creds = Credentials.from_service_account_info(json.loads(creds_json), scopes=SCOPES)
    else:
        if not os.path.exists(CREDENTIALS_FILE):
            raise RuntimeError(f"'{CREDENTIALS_FILE}' not found.")
        creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=SCOPES)
    return build("sheets", "v4", credentials=creds)


def sheet_to_list(sheet_name: str, header_row: int = HEADER_ROW) -> list[dict]:
    """Read sheet into list of dicts. Headers are on header_row (default 6)."""
    try:
        result = _service().spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=f"{sheet_name}!A{header_row}:ZZ"
        ).execute()
        rows = result.get("values", [])
        if not rows:
            return []
        headers = [str(h).strip().upper() for h in rows[0]]
        records = []
        for row in rows[1:]:
            if not row:
                continue
            padded = row + [""] * (len(headers) - len(row))
            obj = dict(zip(headers, padded))
            sn = obj.get("S_N", "").strip()
            if sn in ("", "0", "0.0", "NULL"):
                continue
            records.append(obj)
        return records
    except Exception as e:
        print(f"sheet_to_list error on '{sheet_name}': {e}")
        return []


def append_row(sheet_name: str, values: list):
    _service().spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A{HEADER_ROW}",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": [values]}
    ).execute()


def find_row_by_sn(sheet_name: str, sn: str) -> int | None:
    result = _service().spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A{HEADER_ROW}:A"
    ).execute()
    for idx, row in enumerate(result.get("values", [])):
        if row and str(row[0]).strip() == str(sn).strip():
            return HEADER_ROW + idx
    return None


def update_row(sheet_name: str, row_number: int, values: list):
    n = len(values)
    col = ""
    temp = n
    while temp > 0:
        temp, r = divmod(temp - 1, 26)
        col = chr(65 + r) + col
    _service().spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A{row_number}:{col}{row_number}",
        valueInputOption="USER_ENTERED",
        body={"values": [values]}
    ).execute()


def update_cell(sheet_name: str, row_number: int, col_letter: str, value):
    _service().spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!{col_letter}{row_number}",
        valueInputOption="USER_ENTERED",
        body={"values": [[value]]}
    ).execute()


def clear_row(sheet_name: str, row_number: int):
    _service().spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A{row_number}:ZZ{row_number}"
    ).execute()


def next_sn(sheet_name: str) -> int:
    records = sheet_to_list(sheet_name)
    if not records:
        return 1
    try:
        return max(int(r.get("S_N", 0)) for r in records if str(r.get("S_N", "")).isdigit()) + 1
    except Exception:
        return len(records) + 1


def now_str() -> str:
    return datetime.now(timezone(timedelta(hours=3))).strftime("%Y-%m-%d %H:%M:%S")


# ═══════════════════════════════════════════════════════════════
# DEPARTMENT DERIVATION
# ═══════════════════════════════════════════════════════════════

def derive_department_1(sex: str, marital_status: str, dob_raw: str) -> str:
    s = str(sex or "").strip().upper()
    m = str(marital_status or "").strip().upper()
    if m in ("MARRIED", "WIDOWED", "DIVORCED", "SEPARATED", "SINGLE PARENT", "WIDOW/WIDOWER"):
        return "BROTHERS UNION" if s == "MALE" else "SISTERS UNION"
    if dob_raw and str(dob_raw).strip() not in ("", "-"):
        try:
            dob   = datetime.strptime(str(dob_raw).strip(), "%Y-%m-%d").date()
            today = date.today()
            age   = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            if age <= 12:  return "SUNDAY SCHOOL"
            if age <= 17:  return "PRE-YOUTH DEPARTMENT"
            if age <= 35:  return "YOUTH DEPARTMENT"
            return "BROTHERS UNION" if s == "MALE" else "SISTERS UNION"
        except Exception:
            pass
    return "YOUTH DEPARTMENT"


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

def _make_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=TOKEN_EXPIRY_MIN))
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def _get_user(username: str) -> dict | None:
    users = sheet_to_list(SH_USERS)
    return next(
        (u for u in users if u.get("USERNAME", "").strip().lower() == username.strip().lower()),
        None
    )


# ═══════════════════════════════════════════════════════════════
# AUDIT TRAIL  (defined early — used everywhere)
# ═══════════════════════════════════════════════════════════════

def _audit(username: str, action: str, module: str, item_id: str, description: str):
    try:
        sn = next_sn(SH_AUDIT)
        append_row(SH_AUDIT, [sn, now_str(), username, action, module, item_id, description])
    except Exception as e:
        print(f"Audit log error: {e}")


# ═══════════════════════════════════════════════════════════════
# CURRENT USER DEPENDENCY
# ═══════════════════════════════════════════════════════════════

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
            raise HTTPException(401, "Invalid token.")
    except JWTError:
        raise HTTPException(401, "Token expired or invalid.")
    user = _get_user(username)
    if not user or str(user.get("IS_ACTIVE", "TRUE")).upper() != "TRUE":
        raise HTTPException(401, "User inactive or not found.")
    return CurrentUser(
        username=user["USERNAME"],
        full_name=user.get("FULL_NAME", ""),
        email=user.get("EMAIL", ""),
        is_admin=str(user.get("IS_ADMIN", "FALSE")).upper() == "TRUE",
        church_branch=user.get("CHURCH_BRANCH", "AFC UTHIRU")
    )

def require_admin(u: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not u.is_admin:
        raise HTTPException(403, "Admin access required.")
    return u


# ═══════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════

class UserCreate(BaseModel):
    username: str
    full_name: str
    email: str
    password: str
    is_admin: bool = False
    church_branch: str = "AFC UTHIRU"

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class MemberModel(BaseModel):
    membership_number: Optional[str] = ""
    full_name: str
    phone_number: Optional[str] = ""
    email: Optional[str] = ""
    sex: str
    marital_status: str
    date_of_birth: Optional[str] = ""
    residence: Optional[str] = ""
    landmark: Optional[str] = ""
    occupation: Optional[str] = ""
    membership_status: str = "ACTIVE"
    spouse_name: Optional[str] = ""
    no_of_children: Optional[str] = "0"
    conversion_date: Optional[str] = ""
    baptism_date: Optional[str] = ""
    holy_spirit_received: str = "NO"
    holy_spirit_date: Optional[str] = ""
    nok_name: Optional[str] = ""
    nok_relationship: Optional[str] = ""
    nok_phone: Optional[str] = ""
    photo_url: Optional[str] = ""
    departments: list[str] = []

class OverrideDeptRequest(BaseModel):
    department: str

class ServiceIn(BaseModel):
    date: str
    nature_of_service: Optional[str] = None
    opening_time: Optional[str] = None
    closing_time: Optional[str] = None
    preacher: Optional[str] = None
    scripture_reading: Optional[str] = None
    sermon_topic: Optional[str] = None
    church_branch: Optional[str] = "AFC UTHIRU"

class EventIn(BaseModel):
    event_title: str
    event_description: Optional[str] = None
    event_date: str
    event_time: Optional[str] = None
    event_location: Optional[str] = None
    targeted_group: Optional[str] = None
    pastor_in_charge: Optional[str] = None
    phone: Optional[str] = None
    church_branch: Optional[str] = "AFC UTHIRU"

class AttendanceMarkRequest(BaseModel):
    session_type: str
    session_id: str
    member_sns: list[str]

class AttendanceUnmarkRequest(BaseModel):
    session_type: str
    session_id: str
    member_sn: str


# ═══════════════════════════════════════════════════════════════
# EMAIL  (Resend)
# ═══════════════════════════════════════════════════════════════

def send_email(to: str, subject: str, html: str) -> bool:
    try:
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={"from": RESEND_FROM, "to": [to], "subject": subject, "html": html},
            timeout=10
        )
        return r.status_code == 200
    except Exception as e:
        print(f"Email error: {e}")
        return False

def email_welcome(to: str, full_name: str, username: str, password: str):
    send_email(to, "Your AFC Uthiru CMS Account", f"""
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:auto;padding:32px;background:#fff;border-radius:12px;border:1px solid #e2e8f0">
      <div style="background:#00B4D8;color:#04212F;width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;margin-bottom:20px;padding:0 8px">AFC</div>
      <h2 style="color:#0F2A47;margin:0 0 8px">Welcome, {full_name}</h2>
      <p style="color:#64748B;margin:0 0 24px">Your account on the AFC Uthiru CMS has been created.</p>
      <div style="background:#F0F4F8;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0 0 8px;color:#475569;font-size:13px;font-weight:600;text-transform:uppercase">Username</p>
        <p style="margin:0 0 16px;color:#0F2A47;font-size:18px;font-weight:700;font-family:monospace">{username}</p>
        <p style="margin:0 0 8px;color:#475569;font-size:13px;font-weight:600;text-transform:uppercase">Temporary password</p>
        <p style="margin:0;color:#0F2A47;font-size:18px;font-weight:700;font-family:monospace">{password}</p>
      </div>
      <a href="{FRONTEND_URL}/login" style="display:inline-block;background:#00B4D8;color:#04212F;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:8px">Sign in now</a>
    </div>""")

def email_reset(to: str, full_name: str, token: str):
    reset_url = f"{FRONTEND_URL}/reset-password?token={token}"
    send_email(to, "AFC Uthiru CMS - Password Reset", f"""
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:auto;padding:32px;background:#fff;border-radius:12px;border:1px solid #e2e8f0">
      <h2 style="color:#0F2A47;margin:0 0 8px">Password reset request</h2>
      <p style="color:#64748B;margin:0 0 24px">Hi {full_name}, click below to reset your password. Expires in 1 hour.</p>
      <a href="{reset_url}" style="display:inline-block;background:#00B4D8;color:#04212F;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:8px">Reset my password</a>
    </div>""")


# ═══════════════════════════════════════════════════════════════
# SESSION HELPERS
# ═══════════════════════════════════════════════════════════════

def _session_status(date_str: str) -> str:
    try:
        return "UPCOMING" if datetime.strptime(date_str.strip(), "%Y-%m-%d").date() > date.today() else "PAST"
    except Exception:
        return "PAST"

def _next_session_id(prefix: str, sheet_name: str, date_str: str) -> str:
    code = date_str.replace("-", "")
    pfx  = f"{prefix}-{code}-"
    recs = sheet_to_list(sheet_name)
    seq  = max(
        (int(r.get("S_N", "0").split("-")[-1]) for r in recs if str(r.get("S_N", "")).startswith(pfx)),
        default=0
    )
    return f"{pfx}{seq + 1:03d}"

def _derive_gender_category(sex: str, dob_raw: str) -> str:
    sex = str(sex or "").strip().upper()
    if dob_raw and str(dob_raw).strip():
        try:
            dob   = datetime.strptime(dob_raw.strip(), "%Y-%m-%d").date()
            today = date.today()
            age   = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            if age < 13:  return "CHILD"
            if age <= 17: return "YOUTH"
        except Exception:
            pass
    return "WOMAN" if sex == "FEMALE" else "MAN"

def _recalc_counts(session_id: str) -> dict:
    counts = {"MEN": 0, "WOMEN": 0, "YOUTH": 0, "CHILDREN": 0}
    for a in sheet_to_list(SH_ATTENDANCE):
        if str(a.get("SESSION_ID", "")).strip() != session_id:
            continue
        if str(a.get("MARKED_PRESENT", "")).strip().upper() != "TRUE":
            continue
        cat = str(a.get("GENDER_CATEGORY", "")).strip().upper()
        if cat == "MAN":     counts["MEN"]      += 1
        elif cat == "WOMAN": counts["WOMEN"]    += 1
        elif cat == "YOUTH": counts["YOUTH"]    += 1
        elif cat == "CHILD": counts["CHILDREN"] += 1
    counts["TOTAL"] = sum(counts.values())
    return counts

def _push_counts(session_type: str, session_id: str, counts: dict):
    sheet = SH_SERVICES if session_type.upper() == "SERVICE" else SH_EVENTS
    records = sheet_to_list(sheet)
    row_idx = next((i for i, r in enumerate(records) if str(r.get("S_N","")).strip() == session_id), None)
    if row_idx is None:
        return
    sheet_row = HEADER_ROW + 1 + row_idx
    update_cell(sheet, sheet_row, "I", counts["MEN"])
    update_cell(sheet, sheet_row, "J", counts["WOMEN"])
    update_cell(sheet, sheet_row, "K", counts["YOUTH"])
    update_cell(sheet, sheet_row, "L", counts["CHILDREN"])
    update_cell(sheet, sheet_row, "M", counts["TOTAL"])


# ═══════════════════════════════════════════════════════════════
# HEALTH
# ═══════════════════════════════════════════════════════════════

@app.api_route("/", methods=["GET", "HEAD"], tags=["Health"])
def root():
    return {"status": "online", "system": "AFC Uthiru CMS API v1.4"}

@app.get("/api/test-connection", tags=["Health"])
def test_connection():
    try:
        meta = _service().spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
        return {
            "connection": "OK",
            "workbook": meta.get("properties", {}).get("title"),
            "sheets": [s["properties"]["title"] for s in meta.get("sheets", [])]
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
        _audit(form.username, "LOGIN_FAILED", "AUTH", "", "Incorrect username or password")
        raise HTTPException(401, "Incorrect username or password.")
    if str(user.get("IS_ACTIVE", "TRUE")).upper() != "TRUE":
        _audit(form.username, "LOGIN_BLOCKED", "AUTH", "", "Inactive account")
        raise HTTPException(403, "Account inactive. Contact your admin.")
    token = _make_token({"sub": user["USERNAME"]})
    _audit(user["USERNAME"], "LOGIN", "AUTH", user.get("S_N", ""), "User logged in")
    return {
        "access_token": token,
        "token_type": "bearer",
        "full_name": user.get("FULL_NAME", ""),
        "is_admin": str(user.get("IS_ADMIN", "FALSE")).upper() == "TRUE",
        "username": user["USERNAME"]
    }

@app.get("/api/auth/me", tags=["Auth"])
def me(u: CurrentUser = Depends(get_current_user)):
    return {"username": u.username, "full_name": u.full_name, "email": u.email,
            "is_admin": u.is_admin, "church_branch": u.church_branch}

@app.post("/api/auth/forgot-password", tags=["Auth"])
def forgot_password(req: ForgotPasswordRequest):
    users = sheet_to_list(SH_USERS)
    user  = next((u for u in users if u.get("EMAIL","").strip().lower() == req.email.strip().lower()), None)
    if user:
        token      = secrets.token_urlsafe(32)
        expires_at = (datetime.now() + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
        sn         = next_sn(SH_RESET)
        try:
            append_row(SH_RESET, [sn, req.email, token, expires_at, "FALSE"])
        except Exception as e:
            print(f"ResetTokens_db write error: {e}")
        email_reset(req.email, user.get("FULL_NAME",""), token)
        _audit(user["USERNAME"], "FORGOT_PASSWORD", "AUTH", user.get("S_N",""), "Reset token issued")
    return {"detail": "If that email exists, a reset link has been sent."}

@app.post("/api/auth/reset-password", tags=["Auth"])
def reset_password(req: ResetPasswordRequest):
    if len(req.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters.")
    tokens    = sheet_to_list(SH_RESET)
    token_row = next((t for t in tokens if t.get("TOKEN","") == req.token), None)
    if not token_row:
        raise HTTPException(400, "Invalid or expired reset token.")
    if token_row.get("USED","").upper() == "TRUE":
        raise HTTPException(400, "This reset link has already been used.")
    try:
        exp = datetime.strptime(token_row.get("EXPIRES_AT",""), "%Y-%m-%d %H:%M:%S")
        if datetime.now() > exp:
            raise HTTPException(400, "Reset link has expired.")
    except ValueError:
        raise HTTPException(400, "Invalid token expiry.")
    users = sheet_to_list(SH_USERS)
    user  = next((u for u in users if u.get("EMAIL","").lower() == token_row.get("EMAIL","").lower()), None)
    if not user:
        raise HTTPException(404, "User not found.")
    rn = find_row_by_sn(SH_USERS, user["S_N"])
    update_row(SH_USERS, rn, [
        user["S_N"], user["USERNAME"], user.get("FULL_NAME",""), user.get("EMAIL",""),
        _hash(req.new_password), user.get("IS_ADMIN","FALSE"), user.get("IS_ACTIVE","TRUE"),
        user.get("CHURCH_BRANCH","AFC UTHIRU")
    ])
    token_rn = find_row_by_sn(SH_RESET, token_row["S_N"])
    if token_rn:
        update_row(SH_RESET, token_rn,
                   [token_row["S_N"], token_row["EMAIL"], req.token, token_row["EXPIRES_AT"], "TRUE"])
    _audit(user["USERNAME"], "RESET_PASSWORD", "AUTH", user["S_N"], "Password reset via token")
    return {"detail": "Password reset successfully. You can now log in."}


# ═══════════════════════════════════════════════════════════════
# USERS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/users", tags=["Users"])
def get_users(_: CurrentUser = Depends(require_admin)):
    users = sheet_to_list(SH_USERS)
    for u in users:
        u.pop("HASHED_PASSWORD", None)
        u.pop("PASSWORD", None)
    return users

@app.post("/api/users", tags=["Users"])
def create_user(body: UserCreate, admin: CurrentUser = Depends(require_admin)):
    users = sheet_to_list(SH_USERS)
    if any(u.get("USERNAME","").lower() == body.username.lower() for u in users):
        raise HTTPException(409, f"Username '{body.username}' already exists.")
    if any(u.get("EMAIL","").lower() == body.email.lower() for u in users):
        raise HTTPException(409, f"Email '{body.email}' already in use.")
    sn = next_sn(SH_USERS)
    append_row(SH_USERS, [
        sn, body.username.strip(), body.full_name.strip(), body.email.strip(),
        _hash(body.password), "TRUE" if body.is_admin else "FALSE",
        "TRUE", body.church_branch.upper(), now_str()
    ])
    email_welcome(body.email, body.full_name, body.username, body.password)
    _audit(admin.username, "CREATE_USER", "USERS", str(sn),
           f"Created account '{body.username}' ({'Admin' if body.is_admin else 'Staff'})")
    return {"detail": f"User '{body.username}' created. Login details sent to {body.email}."}

@app.post("/api/users/deactivate/{username}", tags=["Users"])
def deactivate_user(username: str, admin: CurrentUser = Depends(require_admin)):
    if admin.username.lower() == username.lower():
        raise HTTPException(400, "Cannot deactivate your own account.")
    users = sheet_to_list(SH_USERS)
    user  = next((u for u in users if u.get("USERNAME","").lower() == username.lower()), None)
    if not user:
        raise HTTPException(404, f"User '{username}' not found.")
    rn = find_row_by_sn(SH_USERS, user["S_N"])
    update_row(SH_USERS, rn, [
        user["S_N"], user["USERNAME"], user.get("FULL_NAME",""), user.get("EMAIL",""),
        user.get("HASHED_PASSWORD", user.get("PASSWORD","")),
        user.get("IS_ADMIN","FALSE"), "FALSE",
        user.get("CHURCH_BRANCH","AFC UTHIRU"), now_str()
    ])
    _audit(admin.username, "DEACTIVATE_USER", "USERS", user["S_N"], f"Deactivated '{username}'")
    return {"detail": f"User '{username}' deactivated."}


# ═══════════════════════════════════════════════════════════════
# MEMBERS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/members", tags=["Members"])
def get_members(_: CurrentUser = Depends(get_current_user)):
    records = sheet_to_list(SH_MEMBERS)
    for r in records:
        raw = r.get("DEPARTMENTS", "")
        r["DEPARTMENTS"] = [d.strip() for d in raw.split(",") if d.strip()] if raw else []
    return records

@app.get("/api/members/{sn}", tags=["Members"])
def get_member(sn: str, _: CurrentUser = Depends(get_current_user)):
    records = sheet_to_list(SH_MEMBERS)
    m = next((r for r in records if str(r.get("S_N","")).strip() == sn), None)
    if not m:
        raise HTTPException(404, f"Member '{sn}' not found.")
    raw = m.get("DEPARTMENTS","")
    m["DEPARTMENTS"] = [d.strip() for d in raw.split(",") if d.strip()] if raw else []
    return m

@app.post("/api/members", tags=["Members"])
def add_member(m: MemberModel, u: CurrentUser = Depends(get_current_user)):
    sn        = next_sn(SH_MEMBERS)
    dept1     = derive_department_1(m.sex, m.marital_status, m.date_of_birth)
    all_depts = m.departments.copy()
    if dept1 not in all_depts:
        all_depts.insert(0, dept1)
    append_row(SH_MEMBERS, [
        sn, m.membership_number, m.full_name.strip(), m.phone_number, m.email,
        m.sex.upper(), m.marital_status.upper(), m.date_of_birth, m.residence,
        m.landmark, m.occupation, m.membership_status.upper(), m.spouse_name,
        m.no_of_children, m.conversion_date, m.baptism_date,
        m.holy_spirit_received.upper(), m.holy_spirit_date,
        m.nok_name, m.nok_relationship, m.nok_phone,
        m.photo_url, dept1, ",".join(all_depts), now_str()
    ])
    _audit(u.username, "ADD_MEMBER", "MEMBERS", str(sn), f"Registered '{m.full_name}' — dept: {dept1}")
    return {"detail": "Member registered.", "sn": sn, "department_1": dept1}

@app.put("/api/members/{sn}", tags=["Members"])
def update_member(sn: str, m: MemberModel, u: CurrentUser = Depends(get_current_user)):
    records = sheet_to_list(SH_MEMBERS)
    row_idx = next((i for i, r in enumerate(records) if str(r.get("S_N","")).strip() == sn), None)
    if row_idx is None:
        raise HTTPException(404, f"Member '{sn}' not found.")
    dept1     = derive_department_1(m.sex, m.marital_status, m.date_of_birth)
    all_depts = m.departments.copy()
    if dept1 not in all_depts:
        all_depts.insert(0, dept1)
    sheet_row = HEADER_ROW + 1 + row_idx
    update_row(SH_MEMBERS, sheet_row, [
        sn, m.membership_number, m.full_name.strip(), m.phone_number, m.email,
        m.sex.upper(), m.marital_status.upper(), m.date_of_birth, m.residence,
        m.landmark, m.occupation, m.membership_status.upper(), m.spouse_name,
        m.no_of_children, m.conversion_date, m.baptism_date,
        m.holy_spirit_received.upper(), m.holy_spirit_date,
        m.nok_name, m.nok_relationship, m.nok_phone,
        m.photo_url, dept1, ",".join(all_depts), now_str()
    ])
    _audit(u.username, "UPDATE_MEMBER", "MEMBERS", sn, f"Updated '{m.full_name}'")
    return {"detail": "Member updated.", "department_1": dept1}

@app.delete("/api/members/{sn}", tags=["Members"])
def delete_member(sn: str, u: CurrentUser = Depends(get_current_user)):
    records = sheet_to_list(SH_MEMBERS)
    row_idx = next((i for i, r in enumerate(records) if str(r.get("S_N","")).strip() == sn), None)
    if row_idx is None:
        raise HTTPException(404, f"Member '{sn}' not found.")
    name      = records[row_idx].get("MEMBER_NAME", records[row_idx].get("FULL_NAME","Unknown"))
    sheet_row = HEADER_ROW + 1 + row_idx
    clear_row(SH_MEMBERS, sheet_row)
    _audit(u.username, "DELETE_MEMBER", "MEMBERS", sn, f"Deleted '{name}'")
    return {"detail": f"Member '{name}' deleted."}

@app.post("/api/members/{sn}/override-department", tags=["Members"])
def override_department(sn: str, req: OverrideDeptRequest, u: CurrentUser = Depends(require_admin)):
    records = sheet_to_list(SH_MEMBERS)
    row_idx = next((i for i, r in enumerate(records) if str(r.get("S_N","")).strip() == sn), None)
    if row_idx is None:
        raise HTTPException(404, f"Member '{sn}' not found.")
    m        = records[row_idx]
    raw      = m.get("DEPARTMENTS","")
    depts    = [d.strip() for d in raw.split(",") if d.strip()] if raw else []
    new_dept = req.department.strip()
    if new_dept in depts:
        depts.remove(new_dept)
    depts.insert(0, new_dept)
    sheet_row = HEADER_ROW + 1 + row_idx
    name_key  = "MEMBER_NAME" if "MEMBER_NAME" in m else "FULL_NAME"
    update_row(SH_MEMBERS, sheet_row, [
        m.get("S_N",sn), m.get("MEMBERSHIP_NUMBER",""), m.get(name_key,""),
        m.get("PHONE",""), m.get("EMAIL",""), m.get("SEX",""),
        m.get("MARITAL_STATUS",""), m.get("DATE_OF_BIRTH",""), m.get("RESIDENCE",""),
        m.get("LANDMARK",""), m.get("OCCUPATION",""), m.get("MEMBERSHIP_STATUS",""),
        m.get("SPOUSE_NAME",""), m.get("NO_OF_CHILDREN",""), m.get("CONVERSION_DATE",""),
        m.get("BAPTISM_DATE",""), m.get("HOLY_SPIRIT_RECEIVED",""), m.get("HOLY_SPIRIT_DATE",""),
        m.get("NOK_NAME",""), m.get("NOK_RELATIONSHIP",""), m.get("NOK_PHONE",""),
        m.get("PHOTO_URL",""), new_dept, ",".join(depts), now_str()
    ])
    _audit(u.username, "OVERRIDE_DEPARTMENT", "MEMBERS", sn,
           f"Overrode dept to '{new_dept}' for '{m.get(name_key,'')}'")
    return {"detail": f"Department overridden to '{new_dept}'."}


# ═══════════════════════════════════════════════════════════════
# DEPARTMENTS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/departments", tags=["Departments"])
def list_departments(_: CurrentUser = Depends(get_current_user)):
    return sheet_to_list(SH_DEPARTMENTS)


# ═══════════════════════════════════════════════════════════════
# AUDIT ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/audit", tags=["Audit"])
def get_audit_log(_: CurrentUser = Depends(require_admin)):
    return list(reversed(sheet_to_list(SH_AUDIT)))

@app.get("/api/audit/search", tags=["Audit"])
def search_audit_log(q: str = "", action: str = "", module: str = "",
                     _: CurrentUser = Depends(require_admin)):
    records = list(reversed(sheet_to_list(SH_AUDIT)))
    if action:
        records = [r for r in records if r.get("ACTION","").upper() == action.upper()]
    if module:
        records = [r for r in records if r.get("MODULE","").upper() == module.upper()]
    if q:
        ql = q.lower()
        records = [r for r in records if
                   ql in r.get("USERNAME","").lower() or
                   ql in r.get("DESCRIPTION","").lower() or
                   ql in r.get("ITEM_ID","").lower()]
    return records


# ═══════════════════════════════════════════════════════════════
# SERVICES
# ═══════════════════════════════════════════════════════════════

@app.get("/api/services", tags=["Services"])
def list_services(_: CurrentUser = Depends(get_current_user)):
    records = sheet_to_list(SH_SERVICES)
    for r in records:
        r["STATUS"] = _session_status(r.get("DATE",""))
    return records

@app.get("/api/services/{sn}", tags=["Services"])
def get_service(sn: str, _: CurrentUser = Depends(get_current_user)):
    records = sheet_to_list(SH_SERVICES)
    s = next((r for r in records if str(r.get("S_N","")).strip() == sn), None)
    if not s:
        raise HTTPException(404, f"Service '{sn}' not found.")
    s["STATUS"] = _session_status(s.get("DATE",""))
    return s

@app.post("/api/services", tags=["Services"])
def create_service(body: ServiceIn, u: CurrentUser = Depends(get_current_user)):
    sn     = _next_session_id("SVC", SH_SERVICES, body.date)
    status = _session_status(body.date)
    append_row(SH_SERVICES, [
        sn, body.date, body.opening_time, body.closing_time,
        body.nature_of_service, body.preacher, body.scripture_reading, body.sermon_topic,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        status, u.username, body.church_branch
    ])
    _audit(u.username, "CREATE_SERVICE", "SERVICES", sn,
           f"Created {status} service on {body.date}")
    return {
        "status": "success", "service_id": sn, "session_status": status,
        "message": f"Service '{sn}' created." +
                   (" Attendance can now be marked." if status == "PAST"
                    else " Attendance available after the service date.")
    }

@app.put("/api/services/{sn}", tags=["Services"])
def update_service(sn: str, body: ServiceIn, u: CurrentUser = Depends(get_current_user)):
    records = sheet_to_list(SH_SERVICES)
    row_idx = next((i for i, r in enumerate(records) if str(r.get("S_N","")).strip() == sn), None)
    if row_idx is None:
        raise HTTPException(404, f"Service '{sn}' not found.")
    existing  = records[row_idx]
    sheet_row = HEADER_ROW + 1 + row_idx
    status    = _session_status(body.date)
    update_row(SH_SERVICES, sheet_row, [
        sn, body.date, body.opening_time, body.closing_time,
        body.nature_of_service, body.preacher, body.scripture_reading, body.sermon_topic,
        existing.get("ATTENDANCE_MEN",0), existing.get("ATTENDANCE_WOMEN",0),
        existing.get("ATTENDANCE_YOUTH",0), existing.get("ATTENDANCE_CHILDREN",0),
        existing.get("TOTAL_ATTENDANCE",0),
        0, 0, 0, 0, 0, 0, 0, 0,
        status, u.username, body.church_branch
    ])
    _audit(u.username, "UPDATE_SERVICE", "SERVICES", sn, f"Updated service on {body.date}")
    return {"status": "success", "message": f"Service '{sn}' updated."}

@app.delete("/api/services/{sn}", tags=["Services"])
def delete_service(sn: str, u: CurrentUser = Depends(require_admin)):
    records = sheet_to_list(SH_SERVICES)
    row_idx = next((i for i, r in enumerate(records) if str(r.get("S_N","")).strip() == sn), None)
    if row_idx is None:
        raise HTTPException(404, f"Service '{sn}' not found.")
    clear_row(SH_SERVICES, HEADER_ROW + 1 + row_idx)
    _audit(u.username, "DELETE_SERVICE", "SERVICES", sn, f"Deleted service '{sn}'")
    return {"status": "success", "message": f"Service '{sn}' deleted."}


# ═══════════════════════════════════════════════════════════════
# EVENTS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/events", tags=["Events"])
def list_events(_: CurrentUser = Depends(get_current_user)):
    records = sheet_to_list(SH_EVENTS)
    for r in records:
        r["STATUS"] = _session_status(r.get("EVENT_DATE",""))
    return records

@app.get("/api/events/{sn}", tags=["Events"])
def get_event(sn: str, _: CurrentUser = Depends(get_current_user)):
    records = sheet_to_list(SH_EVENTS)
    e = next((r for r in records if str(r.get("S_N","")).strip() == sn), None)
    if not e:
        raise HTTPException(404, f"Event '{sn}' not found.")
    e["STATUS"] = _session_status(e.get("EVENT_DATE",""))
    return e

@app.post("/api/events", tags=["Events"])
def create_event(body: EventIn, u: CurrentUser = Depends(get_current_user)):
    sn     = _next_session_id("EVT", SH_EVENTS, body.event_date)
    status = _session_status(body.event_date)
    append_row(SH_EVENTS, [
        sn, body.event_title, body.event_description, body.event_date,
        body.event_time, body.event_location, body.targeted_group,
        body.pastor_in_charge, body.phone, "",
        0, 0, 0, 0, 0,
        status, u.username, body.church_branch
    ])
    _audit(u.username, "CREATE_EVENT", "EVENTS", sn,
           f"Created {status} event '{body.event_title}' on {body.event_date}")
    return {
        "status": "success", "event_id": sn, "session_status": status,
        "message": f"Event '{sn}' created." +
                   (" Attendance can now be marked." if status == "PAST"
                    else " Attendance available after the event date.")
    }

@app.put("/api/events/{sn}", tags=["Events"])
def update_event(sn: str, body: EventIn, u: CurrentUser = Depends(get_current_user)):
    records = sheet_to_list(SH_EVENTS)
    row_idx = next((i for i, r in enumerate(records) if str(r.get("S_N","")).strip() == sn), None)
    if row_idx is None:
        raise HTTPException(404, f"Event '{sn}' not found.")
    existing  = records[row_idx]
    sheet_row = HEADER_ROW + 1 + row_idx
    status    = _session_status(body.event_date)
    update_row(SH_EVENTS, sheet_row, [
        sn, body.event_title, body.event_description, body.event_date,
        body.event_time, body.event_location, body.targeted_group,
        body.pastor_in_charge, body.phone, existing.get("APPROVED_BY",""),
        existing.get("ATTENDANCE_MEN",0), existing.get("ATTENDANCE_WOMEN",0),
        existing.get("ATTENDANCE_YOUTH",0), existing.get("ATTENDANCE_CHILDREN",0),
        existing.get("TOTAL_ATTENDANCE",0),
        status, u.username, body.church_branch
    ])
    _audit(u.username, "UPDATE_EVENT", "EVENTS", sn, f"Updated event '{body.event_title}'")
    return {"status": "success", "message": f"Event '{sn}' updated."}

@app.delete("/api/events/{sn}", tags=["Events"])
def delete_event(sn: str, u: CurrentUser = Depends(require_admin)):
    records = sheet_to_list(SH_EVENTS)
    row_idx = next((i for i, r in enumerate(records) if str(r.get("S_N","")).strip() == sn), None)
    if row_idx is None:
        raise HTTPException(404, f"Event '{sn}' not found.")
    clear_row(SH_EVENTS, HEADER_ROW + 1 + row_idx)
    _audit(u.username, "DELETE_EVENT", "EVENTS", sn, f"Deleted event '{sn}'")
    return {"status": "success", "message": f"Event '{sn}' deleted."}


# ═══════════════════════════════════════════════════════════════
# ATTENDANCE
# ═══════════════════════════════════════════════════════════════

@app.get("/api/attendance/roster/{session_type}/{session_id}", tags=["Attendance"])
def get_roster(session_type: str, session_id: str, _: CurrentUser = Depends(get_current_user)):
    st = session_type.upper()
    if st not in ("SERVICE","EVENT"):
        raise HTTPException(400, "session_type must be SERVICE or EVENT.")
    sheet  = SH_SERVICES if st == "SERVICE" else SH_EVENTS
    date_f = "DATE" if st == "SERVICE" else "EVENT_DATE"
    title_f = "SERMON_TOPIC" if st == "SERVICE" else "EVENT_TITLE"
    records = sheet_to_list(sheet)
    session = next((r for r in records if str(r.get("S_N","")).strip() == session_id), None)
    if not session:
        raise HTTPException(404, f"{st} '{session_id}' not found.")
    if _session_status(session.get(date_f,"")) == "UPCOMING":
        raise HTTPException(400, "Attendance cannot be marked for upcoming sessions.")
    members    = sheet_to_list(SH_MEMBERS)
    attendance = sheet_to_list(SH_ATTENDANCE)
    present_sns = {
        str(a.get("MEMBER_SN","")).strip()
        for a in attendance
        if str(a.get("SESSION_ID","")).strip() == session_id
        and str(a.get("MARKED_PRESENT","")).strip().upper() == "TRUE"
    }
    name_key = "MEMBER_NAME" if members and "MEMBER_NAME" in members[0] else "FULL_NAME"
    return {
        "session_type":  st,
        "session_id":    session_id,
        "session_date":  session.get(date_f,""),
        "session_title": session.get(title_f,"") or session.get("NATURE_OF_SERVICE","") or session.get("EVENT_TITLE",""),
        "roster": [
            {
                "member_sn":         str(m.get("S_N","")),
                "profile_photo_url": m.get("PROFILE_PHOTO_URL", m.get("PHOTO_URL","")),
                "member_name":       m.get(name_key,""),
                "phone":             m.get("PHONE",""),
                "department":        m.get("DEPARTMENT_1", m.get("DEPARTMENTS","")),
                "is_present":        str(m.get("S_N","")).strip() in present_sns,
            }
            for m in members
        ]
    }

@app.post("/api/attendance/mark", tags=["Attendance"])
def mark_attendance(body: AttendanceMarkRequest, u: CurrentUser = Depends(get_current_user)):
    st = body.session_type.upper()
    if st not in ("SERVICE","EVENT"):
        raise HTTPException(400, "session_type must be SERVICE or EVENT.")
    sheet   = SH_SERVICES if st == "SERVICE" else SH_EVENTS
    date_f  = "DATE" if st == "SERVICE" else "EVENT_DATE"
    title_f = "SERMON_TOPIC" if st == "SERVICE" else "EVENT_TITLE"
    sessions = sheet_to_list(sheet)
    session  = next((r for r in sessions if str(r.get("S_N","")).strip() == body.session_id), None)
    if not session:
        raise HTTPException(404, f"{st} '{body.session_id}' not found.")
    if _session_status(session.get(date_f,"")) == "UPCOMING":
        raise HTTPException(400, "Cannot mark attendance for an upcoming session.")
    members     = sheet_to_list(SH_MEMBERS)
    name_key    = "MEMBER_NAME" if members and "MEMBER_NAME" in members[0] else "FULL_NAME"
    members_map = {str(m.get("S_N","")).strip(): m for m in members}
    existing_att = sheet_to_list(SH_ATTENDANCE)
    already_present = {
        str(a.get("MEMBER_SN","")).strip()
        for a in existing_att
        if str(a.get("SESSION_ID","")).strip() == body.session_id
        and str(a.get("MARKED_PRESENT","")).strip().upper() == "TRUE"
    }
    s_date  = session.get(date_f,"")
    s_title = session.get(title_f,"") or session.get("NATURE_OF_SERVICE","") or session.get("EVENT_TITLE","")
    ts      = now_str()
    newly   = 0
    for msn in body.member_sns:
        msn = str(msn).strip()
        if msn in already_present:
            continue
        member = members_map.get(msn)
        if not member:
            continue
        cat = _derive_gender_category(member.get("SEX",""), member.get("DATE_OF_BIRTH",""))
        sn  = next_sn(SH_ATTENDANCE)
        append_row(SH_ATTENDANCE, [
            sn, st, body.session_id, s_date, s_title,
            msn, member.get(name_key,""), member.get("PHONE",""),
            member.get("DEPARTMENT_1", member.get("DEPARTMENTS","")),
            cat, "TRUE", ts, u.username, "AFC UTHIRU"
        ])
        newly += 1
    counts = _recalc_counts(body.session_id)
    _push_counts(st, body.session_id, counts)
    _audit(u.username, "MARK_ATTENDANCE", "ATTENDANCE", body.session_id,
           f"{newly} member(s) marked present")
    return {"status": "success", "newly_marked": newly, "counts": counts}

@app.delete("/api/attendance/unmark", tags=["Attendance"])
def unmark_attendance(body: AttendanceUnmarkRequest, u: CurrentUser = Depends(get_current_user)):
    records = sheet_to_list(SH_ATTENDANCE)
    target  = next(
        (a for a in records
         if str(a.get("SESSION_ID","")).strip() == body.session_id
         and str(a.get("MEMBER_SN","")).strip() == str(body.member_sn).strip()
         and str(a.get("MARKED_PRESENT","")).strip().upper() == "TRUE"),
        None
    )
    if not target:
        raise HTTPException(404, "No active attendance record found.")
    row_idx = next((i for i, a in enumerate(records)
                    if str(a.get("S_N","")).strip() == str(target.get("S_N","")).strip()), None)
    if row_idx is None:
        raise HTTPException(404, "Attendance row not found.")
    update_cell(SH_ATTENDANCE, HEADER_ROW + 1 + row_idx, "K", "FALSE")
    counts = _recalc_counts(body.session_id)
    _push_counts(body.session_type.upper(), body.session_id, counts)
    _audit(u.username, "UNMARK_ATTENDANCE", "ATTENDANCE", body.session_id,
           f"Member {body.member_sn} unmarked")
    return {"status": "success", "message": "Member unmarked.", "counts": counts}

@app.get("/api/attendance/{session_id}/summary", tags=["Attendance"])
def attendance_summary(session_id: str, _: CurrentUser = Depends(get_current_user)):
    records = sheet_to_list(SH_ATTENDANCE)
    present = [a for a in records
               if str(a.get("SESSION_ID","")).strip() == session_id
               and str(a.get("MARKED_PRESENT","")).strip().upper() == "TRUE"]
    counts  = _recalc_counts(session_id)
    name_key = "MEMBER_NAME" if present and "MEMBER_NAME" in present[0] else "FULL_NAME"
    return {
        "session_id": session_id, "counts": counts,
        "attendees": [
            {"member_name": a.get(name_key,""), "phone": a.get("PHONE",""),
             "department": a.get("DEPARTMENT_1","")}
            for a in present
        ]
    }


# ═══════════════════════════════════════════════════════════════
# REPORTS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/reports/service/{sn}", tags=["Reports"])
def service_report(sn: str, _: CurrentUser = Depends(get_current_user)):
    services = sheet_to_list(SH_SERVICES)
    service  = next((s for s in services if str(s.get("S_N","")).strip() == sn), None)
    if not service:
        raise HTTPException(404, f"Service '{sn}' not found.")
    attendance = sheet_to_list(SH_ATTENDANCE)
    name_key   = "MEMBER_NAME" if attendance and "MEMBER_NAME" in attendance[0] else "FULL_NAME"
    attendees  = [
        {"member_name": a.get(name_key,""), "phone": a.get("PHONE",""), "department": a.get("DEPARTMENT_1","")}
        for a in attendance
        if str(a.get("SESSION_ID","")).strip() == sn
        and str(a.get("MARKED_PRESENT","")).strip().upper() == "TRUE"
    ]
    return {
        "report_type": "SERVICE",
        "service_details": {
            "service_id": sn, "date": service.get("DATE",""),
            "nature": service.get("NATURE_OF_SERVICE",""),
            "opening_time": service.get("OPENING_TIME",""),
            "closing_time": service.get("CLOSING_TIME",""),
            "preacher": service.get("PREACHER",""),
            "scripture": service.get("SCRIPTURE_READING",""),
            "sermon_topic": service.get("SERMON_TOPIC",""),
            "church_branch": service.get("CHURCH_BRANCH","AFC UTHIRU"),
            "record_officer": service.get("RECORD_OFFICER",""),
        },
        "attendance_summary": {
            "men": service.get("ATTENDANCE_MEN",0), "women": service.get("ATTENDANCE_WOMEN",0),
            "youth": service.get("ATTENDANCE_YOUTH",0), "children": service.get("ATTENDANCE_CHILDREN",0),
            "total": service.get("TOTAL_ATTENDANCE",0),
        },
        "attendees": attendees,
    }

@app.get("/api/reports/event/{sn}", tags=["Reports"])
def event_report(sn: str, _: CurrentUser = Depends(get_current_user)):
    events = sheet_to_list(SH_EVENTS)
    event  = next((e for e in events if str(e.get("S_N","")).strip() == sn), None)
    if not event:
        raise HTTPException(404, f"Event '{sn}' not found.")
    attendance = sheet_to_list(SH_ATTENDANCE)
    name_key   = "MEMBER_NAME" if attendance and "MEMBER_NAME" in attendance[0] else "FULL_NAME"
    attendees  = [
        {"member_name": a.get(name_key,""), "phone": a.get("PHONE",""), "department": a.get("DEPARTMENT_1","")}
        for a in attendance
        if str(a.get("SESSION_ID","")).strip() == sn
        and str(a.get("MARKED_PRESENT","")).strip().upper() == "TRUE"
    ]
    return {
        "report_type": "EVENT",
        "event_details": {
            "event_id": sn, "title": event.get("EVENT_TITLE",""),
            "description": event.get("EVENT_DESCRIPTION",""),
            "date": event.get("EVENT_DATE",""), "time": event.get("EVENT_TIME",""),
            "location": event.get("EVENT_LOCATION",""),
            "targeted_group": event.get("TARGETED_GROUP",""),
            "pastor": event.get("PASTOR_IN_CHARGE",""),
            "church_branch": event.get("CHURCH_BRANCH","AFC UTHIRU"),
            "record_officer": event.get("RECORD_OFFICER",""),
        },
        "attendance_summary": {
            "men": event.get("ATTENDANCE_MEN",0), "women": event.get("ATTENDANCE_WOMEN",0),
            "youth": event.get("ATTENDANCE_YOUTH",0), "children": event.get("ATTENDANCE_CHILDREN",0),
            "total": event.get("TOTAL_ATTENDANCE",0),
        },
        "attendees": attendees,
    }
