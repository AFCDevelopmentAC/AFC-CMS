"""
AFC Uthiru Church Management System — FastAPI Sync Engine
v1.2 — Auth + Users + Members + Audit Trail + Email + Password Reset
"""

import os
import json
import secrets
import httpx
from datetime import datetime, timedelta, timezone, date
from typing import Optional, List

import bcrypt
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel
from googleapiclient.discovery import build
from google.oauth2.service_account import Credentials

# ── App ───────────────────────────────────────────────────────
app = FastAPI(title="AFC Uthiru CMS API", version="1.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Config ────────────────────────────────────────────────────
CREDENTIALS_FILE = "afs-uthiru-cms-de0018a945c1.json"
SPREADSHEET_ID   = os.environ.get("SPREADSHEET_ID", "1tX_G4wlCKKRuPVPr-jy5f992jnmlp0y_3s-yd-UNkTs")
SCOPES           = ["https://www.googleapis.com/auth/spreadsheets"]
SECRET_KEY       = os.environ.get("SECRET_KEY", "CHANGE-THIS-BEFORE-PRODUCTION-AFC-UTHIRU")
ALGORITHM        = "HS256"
TOKEN_EXPIRE_MIN = 480

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM    = os.environ.get("RESEND_FROM", "onboarding@resend.dev")
FRONTEND_URL   = os.environ.get("FRONTEND_URL", "https://afc-cms.vercel.app")

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


def sheet_to_list(sheet_name: str, header_row: int = 6) -> list[dict]:
    """
    Read a sheet into a list of dicts.
    header_row=6 matches our database format (rows 1-5 are metadata, row 6 is headers).
    Skips null/placeholder rows (S_N == 0 or NULL).
    """
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
        sn = str(row[0]).strip()
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


def find_row_by_sn(sheet_name: str, sn, header_row: int = 6) -> int | None:
    result = _service().spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A{header_row}:A"
    ).execute()
    for idx, row in enumerate(result.get("values", [])):
        if row and str(row[0]).strip() == str(sn).strip():
            return header_row + idx
    return None


def update_row(sheet_name: str, row_number: int, values: list):
    n = len(values)
    if n <= 26:
        col_end = chr(ord("A") + n - 1)
    else:
        col_end = chr(ord("A") + (n // 26) - 1) + chr(ord("A") + (n % 26) - 1)
    _service().spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A{row_number}:{col_end}{row_number}",
        valueInputOption="USER_ENTERED",
        body={"values": [values]},
    ).execute()


def clear_row(sheet_name: str, row_number: int):
    _service().spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A{row_number}:Z{row_number}",
    ).execute()


def next_sn(sheet_name: str) -> str:
    records = sheet_to_list(sheet_name)
    if not records:
        return "1"
    try:
        return str(max(int(r.get("S_N", 0)) for r in records if str(r.get("S_N", "")).isdigit()) + 1)
    except Exception:
        return str(len(records) + 1)


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ═══════════════════════════════════════════════════════════════
# AUDIT  — defined first so every endpoint can call it
# ═══════════════════════════════════════════════════════════════

def _audit(username: str, action: str, module: str, item_id: str, description: str):
    """Write an audit entry. Best-effort — never raises."""
    try:
        sn = next_sn("AuditLog_db")
        append_row("AuditLog_db", [sn, now_str(), username, action, module, str(item_id), description])
    except Exception as e:
        print(f"Audit log error: {e}")


# ═══════════════════════════════════════════════════════════════
# EMAIL  (Resend)
# ═══════════════════════════════════════════════════════════════

def _send_email(to: str, subject: str, html: str) -> bool:
    if not RESEND_API_KEY:
        print(f"[EMAIL SKIP] No RESEND_API_KEY set. Would have sent '{subject}' to {to}")
        return False
    try:
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={"from": RESEND_FROM, "to": [to], "subject": subject, "html": html},
            timeout=10,
        )
        return r.status_code in (200, 201)
    except Exception as e:
        print(f"Email error: {e}")
        return False


def _email_welcome(to: str, full_name: str, username: str, password: str) -> bool:
    return _send_email(to, "Your AFC Uthiru CMS Account", f"""
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:auto;padding:32px;
                background:#fff;border-radius:12px;border:1px solid #e2e8f0">
      <div style="background:#00B4D8;color:#04212F;width:44px;height:44px;border-radius:10px;
                  display:inline-flex;align-items:center;justify-content:center;
                  font-weight:800;font-size:14px;margin-bottom:20px">AFC</div>
      <h2 style="color:#0F2A47;margin:0 0 8px">Welcome, {full_name}</h2>
      <p style="color:#64748B;margin:0 0 24px">
        Your account on the AFC Uthiru Church Management System has been created.
      </p>
      <div style="background:#F0F4F8;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0 0 4px;color:#475569;font-size:12px;font-weight:600;text-transform:uppercase">Username</p>
        <p style="margin:0 0 16px;color:#0F2A47;font-size:18px;font-weight:700;font-family:monospace">{username}</p>
        <p style="margin:0 0 4px;color:#475569;font-size:12px;font-weight:600;text-transform:uppercase">Temporary password</p>
        <p style="margin:0;color:#0F2A47;font-size:18px;font-weight:700;font-family:monospace">{password}</p>
      </div>
      <a href="{FRONTEND_URL}/login"
         style="display:inline-block;background:#00B4D8;color:#04212F;font-weight:700;
                text-decoration:none;padding:12px 24px;border-radius:8px;margin-bottom:20px">
        Sign in now →
      </a>
      <p style="color:#94A3B8;font-size:12px;margin:0">
        Please change your password after your first login.
      </p>
    </div>""")


def _email_reset(to: str, full_name: str, token: str) -> bool:
    reset_url = f"{FRONTEND_URL}/reset-password?token={token}"
    return _send_email(to, "AFC Uthiru CMS — Password Reset", f"""
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:auto;padding:32px;
                background:#fff;border-radius:12px;border:1px solid #e2e8f0">
      <div style="background:#00B4D8;color:#04212F;width:44px;height:44px;border-radius:10px;
                  display:inline-flex;align-items:center;justify-content:center;
                  font-weight:800;font-size:14px;margin-bottom:20px">AFC</div>
      <h2 style="color:#0F2A47;margin:0 0 8px">Password reset request</h2>
      <p style="color:#64748B;margin:0 0 24px">
        Hi {full_name}, click the button below to reset your password.
        This link expires in <strong>1 hour</strong>.
      </p>
      <a href="{reset_url}"
         style="display:inline-block;background:#00B4D8;color:#04212F;font-weight:700;
                text-decoration:none;padding:12px 24px;border-radius:8px;margin-bottom:20px">
        Reset my password →
      </a>
      <p style="color:#94A3B8;font-size:12px;margin:0">
        If you did not request this, ignore this email.
      </p>
    </div>""")


# ═══════════════════════════════════════════════════════════════
# DEPARTMENT LOGIC
# ═══════════════════════════════════════════════════════════════

UPGRADE_STATUSES = {"MARRIED", "DIVORCED", "SEPARATED", "WIDOW/WIDOWER", "SINGLE-PARENT"}


def _age(dob_raw: str) -> int | None:
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            dob = datetime.strptime(dob_raw.strip(), fmt).date()
            today = date.today()
            return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        except Exception:
            continue
    return None


def derive_department_1(sex: str, marital_status: str, dob_raw: str) -> str:
    sex    = (sex or "").strip().upper()
    status = (marital_status or "").strip().upper()
    age    = _age(dob_raw or "")

    if status in UPGRADE_STATUSES:
        return "BROTHERS UNION" if sex == "MALE" else "SISTERS UNION"

    if age is not None:
        if age <= 12:
            return "SUNDAY SCHOOL"
        if age <= 17:
            return "PRE-YOUTH DEPARTMENT"
        return "YOUTH DEPARTMENT"

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


def _make_token(data: dict) -> str:
    payload = {**data, "exp": datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE_MIN)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _get_user(username: str) -> dict | None:
    users = sheet_to_list("Users_db")
    return next(
        (u for u in users if u.get("USERNAME", "").lower() == username.lower()),
        None
    )


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

class CreateUser(BaseModel):
    username:      str
    full_name:     str
    email:         str
    password:      str
    is_admin:      bool = False
    church_branch: Optional[str] = "AFC UTHIRU"


class MemberIn(BaseModel):
    PROFILE_PHOTO_URL:    Optional[str] = None
    MEMBER_NAME:          str
    PHYSICAL_ADDRESS:     Optional[str] = None
    AREA_DESCRIPTION:     Optional[str] = None
    PHONE:                Optional[str] = None
    EMAIL:                Optional[str] = None
    SEX:                  Optional[str] = None
    MARITAL_STATUS:       Optional[str] = None
    DATE_OF_BIRTH:        Optional[str] = None
    OCCUPATION:           Optional[str] = None
    SUNDAY_SCHOOL_CLASS:  Optional[str] = None
    DATE_JOINED:          Optional[str] = None
    HOME_CHURCH:          Optional[str] = "AFC UTHIRU"
    MEMBERSHIP_STATUS:    Optional[str] = "ACTIVE MEMBER"
    MEMBERSHIP_NUMBER:    Optional[str] = None
    SPOUSE_NAME:          Optional[str] = None
    CONVERSION_DATE:      Optional[str] = None
    NO_OF_CHILDREN:       Optional[int] = None
    BAPTISM_DATE:         Optional[str] = None
    HOLY_SPIRIT_RECEIVED: Optional[str] = None
    HOLY_SPIRIT_DATE:     Optional[str] = None
    NOK_NAME:             Optional[str] = None
    NOK_RELATIONSHIP:     Optional[str] = None
    NOK_PHONE:            Optional[str] = None
    NOK_ADDRESS:          Optional[str] = None


class DepartmentAdd(BaseModel):
    department:    str
    church_branch: Optional[str] = "AFC UTHIRU"


class DepartmentOverride(BaseModel):
    department: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token:        str
    new_password: str


# ═══════════════════════════════════════════════════════════════
# HEALTH
# ═══════════════════════════════════════════════════════════════

@app.get("/", tags=["Health"])
def root():
    return {"status": "online", "system": "AFC Uthiru CMS API v1.2"}


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
        _audit(form.username, "LOGIN_FAILED", "AUTH", "", "Incorrect username or password.")
        raise HTTPException(401, "Incorrect username or password.")

    if str(user.get("IS_ACTIVE", "")).upper() != "TRUE":
        _audit(form.username, "LOGIN_BLOCKED", "AUTH", user.get("S_N", ""), "Inactive account.")
        raise HTTPException(403, "Account inactive. Contact your admin.")

    token = _make_token({"sub": user["USERNAME"]})
    _audit(user["USERNAME"], "LOGIN", "AUTH", user.get("S_N", ""), "User logged in.")
    return {
        "access_token": token,
        "token_type":   "bearer",
        "full_name":    user.get("FULL_NAME", ""),
        "is_admin":     str(user.get("IS_ADMIN", "")).upper() == "TRUE",
        "username":     user["USERNAME"],
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


@app.post("/api/auth/forgot-password", tags=["Auth"])
def forgot_password(body: ForgotPasswordRequest):
    """Request a password reset link — sent to the user's registered email."""
    users = sheet_to_list("Users_db")
    user  = next((u for u in users if u.get("EMAIL", "").lower() == body.email.lower()), None)

    # Always return success to prevent email enumeration
    if not user:
        return {"status": "success", "message": "If that email exists, a reset link has been sent."}

    token      = secrets.token_urlsafe(32)
    expires_at = (datetime.now() + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
    sn         = next_sn("ResetTokens_db")

    try:
        append_row("ResetTokens_db", [sn, body.email, token, expires_at, "FALSE"])
    except Exception as e:
        print(f"ResetTokens_db write failed: {e}")

    _email_reset(body.email, user.get("FULL_NAME", ""), token)
    _audit(user["USERNAME"], "FORGOT_PASSWORD", "AUTH", user.get("S_N", ""), "Password reset token issued.")
    return {"status": "success", "message": "If that email exists, a reset link has been sent."}


@app.post("/api/auth/reset-password", tags=["Auth"])
def reset_password(body: ResetPasswordRequest):
    """Consume a reset token and set a new password."""
    if len(body.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters.")

    tokens    = sheet_to_list("ResetTokens_db")
    token_row = next((t for t in tokens if t.get("TOKEN", "") == body.token), None)

    if not token_row:
        raise HTTPException(400, "Invalid or expired reset link.")
    if str(token_row.get("USED", "")).upper() == "TRUE":
        raise HTTPException(400, "This reset link has already been used.")

    try:
        exp = datetime.strptime(token_row.get("EXPIRES_AT", ""), "%Y-%m-%d %H:%M:%S")
        if datetime.now() > exp:
            raise HTTPException(400, "This reset link has expired. Please request a new one.")
    except ValueError:
        raise HTTPException(400, "Invalid token expiry.")

    email = token_row.get("EMAIL", "")
    users = sheet_to_list("Users_db")
    user  = next((u for u in users if u.get("EMAIL", "").lower() == email.lower()), None)
    if not user:
        raise HTTPException(404, "User not found.")

    rn = find_row_by_sn("Users_db", user["S_N"])
    update_row("Users_db", rn, [
        user["S_N"], user["USERNAME"], user.get("FULL_NAME", ""), user.get("EMAIL", ""),
        _hash(body.new_password), user.get("IS_ADMIN", "FALSE"), user.get("IS_ACTIVE", "TRUE"),
        user.get("CREATED_AT", ""), user.get("CHURCH_BRANCH", "AFC UTHIRU"),
    ])

    # Mark token as used
    token_rn = find_row_by_sn("ResetTokens_db", token_row["S_N"])
    if token_rn:
        update_row("ResetTokens_db", token_rn, [
            token_row["S_N"], email, body.token,
            token_row.get("EXPIRES_AT", ""), "TRUE"
        ])

    _audit(user["USERNAME"], "RESET_PASSWORD", "AUTH", user["S_N"], "Password reset via token.")
    return {"status": "success", "message": "Password reset successfully. You can now log in."}


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

    sn = next_sn("Users_db")
    append_row("Users_db", [
        sn, body.username, body.full_name, body.email, _hash(body.password),
        "TRUE" if body.is_admin else "FALSE", "TRUE",
        datetime.now().strftime("%Y-%m-%d"), body.church_branch,
    ])

    email_sent = False
    if body.email:
        email_sent = _email_welcome(body.email, body.full_name, body.username, body.password)

    _audit(admin.username, "CREATE_USER", "USERS", sn,
           f"Created account '{body.username}' ({'Admin' if body.is_admin else 'Staff'})"
           f"{' — welcome email sent' if email_sent else ' — no email sent'}")

    return {
        "status":     "success",
        "message":    f"User '{body.username}' created."
                      + (f" Login details sent to {body.email}." if email_sent
                         else " Share credentials manually."),
        "sn":         sn,
        "email_sent": email_sent,
    }


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
    _audit(admin.username, "DEACTIVATE_USER", "USERS", user["S_N"], f"Deactivated '{username}'.")
    return {"status": "success", "message": f"User '{username}' deactivated."}


@app.patch("/api/users/{username}/reactivate", tags=["Users"])
def reactivate_user(username: str, admin: CurrentUser = Depends(require_admin)):
    users = sheet_to_list("Users_db")
    user  = next((u for u in users if u.get("USERNAME", "").lower() == username.lower()), None)
    if not user:
        raise HTTPException(404, f"User '{username}' not found.")
    rn = find_row_by_sn("Users_db", user["S_N"])
    update_row("Users_db", rn, [
        user["S_N"], user["USERNAME"], user.get("FULL_NAME", ""), user.get("EMAIL", ""),
        user.get("HASHED_PASSWORD", ""), user.get("IS_ADMIN", ""), "TRUE",
        user.get("CREATED_AT", ""), user.get("CHURCH_BRANCH", ""),
    ])
    _audit(admin.username, "REACTIVATE_USER", "USERS", user["S_N"], f"Reactivated '{username}'.")
    return {"status": "success", "message": f"User '{username}' reactivated."}


# ═══════════════════════════════════════════════════════════════
# DEPARTMENTS  (reference)
# ═══════════════════════════════════════════════════════════════

@app.get("/api/departments", tags=["Departments"])
def list_departments(_: CurrentUser = Depends(require_user)):
    return sheet_to_list("Departments_db")


# ═══════════════════════════════════════════════════════════════
# MEMBERS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/members", tags=["Members"])
def list_members(_: CurrentUser = Depends(require_user)):
    return sheet_to_list("MemberDetails_db")


@app.get("/api/members/search", tags=["Members"])
def search_members(q: str = "", _: CurrentUser = Depends(require_user)):
    members = sheet_to_list("MemberDetails_db")
    if not q:
        return members
    ql = q.lower()
    return [m for m in members if
            ql in (m.get("MEMBER_NAME", "") or "").lower() or
            ql in (m.get("PHONE", "") or "").lower() or
            ql in (m.get("MEMBERSHIP_NUMBER", "") or "").lower() or
            ql in (m.get("DEPARTMENT_1", "") or "").lower()]


@app.get("/api/members/{sn}", tags=["Members"])
def get_member(sn: str, _: CurrentUser = Depends(require_user)):
    members = sheet_to_list("MemberDetails_db")
    m = next((x for x in members if str(x.get("S_N", "")).strip() == sn), None)
    if not m:
        raise HTTPException(404, f"Member '{sn}' not found.")
    m["additional_departments"] = [
        r for r in sheet_to_list("MemberDepartments_db")
        if str(r.get("MEMBER_SN", "")).strip() == sn
    ]
    return m


def _build_member_row(sn, body: MemberIn, username: str, existing: dict = None) -> tuple[list, str]:
    dept1 = derive_department_1(body.SEX or "", body.MARITAL_STATUS or "", body.DATE_OF_BIRTH or "")
    photo = body.PROFILE_PHOTO_URL or (existing.get("PROFILE_PHOTO_URL", "") if existing else "")
    mem_no = (body.MEMBERSHIP_NUMBER
              if body.MEMBERSHIP_NUMBER is not None
              else (existing.get("MEMBERSHIP_NUMBER", "") if existing else ""))
    return [
        sn, photo, body.MEMBER_NAME,
        body.PHYSICAL_ADDRESS or "", body.AREA_DESCRIPTION or "",
        body.PHONE or "", body.EMAIL or "",
        body.SEX or "", body.MARITAL_STATUS or "", body.DATE_OF_BIRTH or "",
        body.OCCUPATION or "",
        dept1,                              # DEPARTMENT_1 — auto-derived
        body.DATE_JOINED or "",
        body.HOME_CHURCH or "AFC UTHIRU",
        body.MEMBERSHIP_STATUS or "ACTIVE MEMBER",
        mem_no,
        body.SPOUSE_NAME or "",
        body.CONVERSION_DATE or "",
        body.NO_OF_CHILDREN or "",
        body.BAPTISM_DATE or "",
        body.HOLY_SPIRIT_RECEIVED or "",
        body.HOLY_SPIRIT_DATE or "",
        body.NOK_NAME or "",
        body.NOK_RELATIONSHIP or "",
        body.NOK_PHONE or "",
        body.NOK_ADDRESS or "",
        username,
        now_str(),
    ], dept1


@app.post("/api/members", tags=["Members"])
def add_member(body: MemberIn, u: CurrentUser = Depends(require_user)):
    sn = next_sn("MemberDetails_db")
    values, dept1 = _build_member_row(sn, body, u.username)
    append_row("MemberDetails_db", values)
    _audit(u.username, "ADD_MEMBER", "MEMBERS", sn,
           f"Registered '{body.MEMBER_NAME}' — dept: {dept1}")

    # Sunday School sub-classification
    if dept1 == "SUNDAY SCHOOL" and body.SUNDAY_SCHOOL_CLASS:
        cls = body.SUNDAY_SCHOOL_CLASS.strip().upper()
        if cls in ("JUNIOR", "SENIOR"):
            dsn = next_sn("MemberDepartments_db")
            append_row("MemberDepartments_db", [
                dsn, sn, body.MEMBER_NAME, f"SUNDAY SCHOOL - {cls}",
                datetime.now().strftime("%Y-%m-%d"), u.username,
                body.HOME_CHURCH or "AFC UTHIRU",
            ])

    return {"status": "success", "sn": sn, "department_1": dept1,
            "message": f"Member '{body.MEMBER_NAME}' registered. Primary dept: {dept1}."}


@app.put("/api/members/{sn}", tags=["Members"])
def update_member(sn: str, body: MemberIn, u: CurrentUser = Depends(require_user)):
    members  = sheet_to_list("MemberDetails_db")
    existing = next((m for m in members if str(m.get("S_N", "")).strip() == sn), None)
    if not existing:
        raise HTTPException(404, f"Member '{sn}' not found.")
    rn = find_row_by_sn("MemberDetails_db", sn)
    values, dept1 = _build_member_row(sn, body, u.username, existing)
    # Preserve existing DEPARTMENT_1 — not re-derived on update
    values[11] = existing.get("DEPARTMENT_1", dept1)
    update_row("MemberDetails_db", rn, values)
    _audit(u.username, "UPDATE_MEMBER", "MEMBERS", sn, f"Updated member '{body.MEMBER_NAME}'")
    return {"status": "success", "message": f"Member '{sn}' updated.",
            "department_1": values[11]}


@app.delete("/api/members/{sn}", tags=["Members"])
def delete_member(sn: str, u: CurrentUser = Depends(require_admin)):
    members  = sheet_to_list("MemberDetails_db")
    existing = next((m for m in members if str(m.get("S_N", "")).strip() == sn), None)
    if not existing:
        raise HTTPException(404, f"Member '{sn}' not found.")
    rn = find_row_by_sn("MemberDetails_db", sn)
    clear_row("MemberDetails_db", rn)
    _audit(u.username, "DELETE_MEMBER", "MEMBERS", sn,
           f"Deleted member '{existing.get('MEMBER_NAME', '')}'")
    return {"status": "success", "message": f"Member '{sn}' deleted."}


@app.patch("/api/members/{sn}/department", tags=["Members"])
def override_department(sn: str, body: DepartmentOverride, u: CurrentUser = Depends(require_admin)):
    """Admin only — manually override DEPARTMENT_1."""
    members  = sheet_to_list("MemberDetails_db")
    existing = next((m for m in members if str(m.get("S_N", "")).strip() == sn), None)
    if not existing:
        raise HTTPException(404, f"Member '{sn}' not found.")
    old_dept = existing.get("DEPARTMENT_1", "")
    rn = find_row_by_sn("MemberDetails_db", sn)
    update_row("MemberDetails_db", rn, [
        existing.get("S_N", sn),
        existing.get("PROFILE_PHOTO_URL", ""),
        existing.get("MEMBER_NAME", ""),
        existing.get("PHYSICAL_ADDRESS", ""),
        existing.get("AREA_DESCRIPTION", ""),
        existing.get("PHONE", ""),
        existing.get("EMAIL", ""),
        existing.get("SEX", ""),
        existing.get("MARITAL_STATUS", ""),
        existing.get("DATE_OF_BIRTH", ""),
        existing.get("OCCUPATION", ""),
        body.department,                    # DEPARTMENT_1 overridden
        existing.get("DATE_JOINED", ""),
        existing.get("HOME_CHURCH", "AFC UTHIRU"),
        existing.get("MEMBERSHIP_STATUS", ""),
        existing.get("MEMBERSHIP_NUMBER", ""),
        existing.get("SPOUSE_NAME", ""),
        existing.get("CONVERSION_DATE", ""),
        existing.get("NO_OF_CHILDREN", ""),
        existing.get("BAPTISM_DATE", ""),
        existing.get("HOLY_SPIRIT_RECEIVED", ""),
        existing.get("HOLY_SPIRIT_DATE", ""),
        existing.get("NOK_NAME", ""),
        existing.get("NOK_RELATIONSHIP", ""),
        existing.get("NOK_PHONE", ""),
        existing.get("NOK_ADDRESS", ""),
        u.username,
        now_str(),
    ])
    _audit(u.username, "OVERRIDE_DEPARTMENT", "MEMBERS", sn,
           f"Changed dept for '{existing.get('MEMBER_NAME','')}': '{old_dept}' → '{body.department}'")
    return {"status": "success",
            "message": f"Department overridden to '{body.department}' for member '{sn}'."}


@app.get("/api/members/{sn}/departments", tags=["Members"])
def get_member_departments(sn: str, _: CurrentUser = Depends(require_user)):
    members = sheet_to_list("MemberDetails_db")
    member  = next((m for m in members if str(m.get("S_N", "")).strip() == sn), None)
    if not member:
        raise HTTPException(404, f"Member '{sn}' not found.")
    extra = [r for r in sheet_to_list("MemberDepartments_db")
             if str(r.get("MEMBER_SN", "")).strip() == sn]
    return {
        "member_sn":   sn,
        "member_name": member.get("MEMBER_NAME", ""),
        "department_1": {"department": member.get("DEPARTMENT_1", ""), "mandatory": True},
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
    if any(str(r.get("MEMBER_SN", "")).strip() == sn and
           r.get("DEPARTMENT", "").strip().upper() == body.department.strip().upper()
           for r in extra):
        raise HTTPException(409, f"Member already assigned to '{body.department}'.")
    dsn = next_sn("MemberDepartments_db")
    append_row("MemberDepartments_db", [
        dsn, sn, member.get("MEMBER_NAME", ""), body.department,
        datetime.now().strftime("%Y-%m-%d"), u.username, body.church_branch,
    ])
    _audit(u.username, "ADD_MEMBER_DEPARTMENT", "MEMBERS", sn,
           f"Added '{body.department}' to '{member.get('MEMBER_NAME','')}'")
    return {"status": "success", "message": f"'{body.department}' added to member '{sn}'."}


@app.delete("/api/members/{sn}/departments/{dept_sn}", tags=["Members"])
def remove_member_department(sn: str, dept_sn: str, u: CurrentUser = Depends(require_user)):
    rn = find_row_by_sn("MemberDepartments_db", dept_sn)
    if not rn:
        raise HTTPException(404, "Department assignment not found.")
    clear_row("MemberDepartments_db", rn)
    _audit(u.username, "REMOVE_MEMBER_DEPARTMENT", "MEMBERS", sn,
           f"Removed department assignment '{dept_sn}'")
    return {"status": "success", "message": "Department removed."}


# ═══════════════════════════════════════════════════════════════
# AUDIT  (read endpoints — admin only)
# ═══════════════════════════════════════════════════════════════

@app.get("/api/audit", tags=["Audit"])
def get_audit_log(_: CurrentUser = Depends(require_admin)):
    """Full audit trail, newest first."""
    return list(reversed(sheet_to_list("AuditLog_db")))


@app.get("/api/audit/search", tags=["Audit"])
def search_audit_log(q: str = "", action: str = "", module: str = "",
                     _: CurrentUser = Depends(require_admin)):
    """Filter audit trail by free-text, action, and/or module."""
    records = list(reversed(sheet_to_list("AuditLog_db")))
    if action:
        records = [r for r in records if r.get("ACTION", "").upper() == action.upper()]
    if module:
        records = [r for r in records if r.get("MODULE", "").upper() == module.upper()]
    if q:
        ql = q.lower()
        records = [r for r in records if
                   ql in (r.get("USERNAME", "") or "").lower() or
                   ql in (r.get("DESCRIPTION", "") or "").lower() or
                   ql in (r.get("ITEM_ID", "") or "").lower()]
    return records
