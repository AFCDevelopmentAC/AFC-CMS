import os, bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional, Literal
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel
from googleapiclient.discovery import build
from google.oauth2.service_account import Credentials

app = FastAPI(title="AFC Uthiru CMS — Members")
app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:5173","http://localhost:3000"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ── Config ────────────────────────────────────────────────────
CREDENTIALS_FILE = "afs-uthiru-cms-de0018a945c1.json"
SPREADSHEET_ID   = "1jNWNUoTHPRK4zzLYrmJjDn2Vs3Yfr_NUFz3zRlG33Wo"
SCOPES           = ["https://www.googleapis.com/auth/spreadsheets"]
SECRET_KEY       = "AFC-UTHIRU-CHANGE-IN-PRODUCTION"
ALGORITHM        = "HS256"
TOKEN_EXPIRE_MIN = 480

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ── Sheets helpers ────────────────────────────────────────────
def svc():
    creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=SCOPES)
    return build("sheets", "v4", credentials=creds)

def sheet_to_list(sheet_name: str, header_row: int = 6) -> list[dict]:
    result = svc().spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A{header_row}:ZZ").execute()
    rows = result.get("values", [])
    if not rows: return []
    headers = [h.strip() for h in rows[0]]
    out = []
    for row in rows[1:]:
        if not row or not row[0] or str(row[0]).strip() in ("0","",): continue
        out.append({headers[i]: (row[i] if i < len(row) else None) for i in range(len(headers))})
    return out

def append_row(sheet_name: str, values: list):
    svc().spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID, range=f"{sheet_name}!A7",
        valueInputOption="USER_ENTERED", insertDataOption="INSERT_ROWS",
        body={"values": [values]}).execute()

def find_row(sheet_name: str, sn: str, header_row: int = 6) -> int | None:
    result = svc().spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A{header_row}:A").execute()
    for idx, row in enumerate(result.get("values", [])):
        if row and str(row[0]).strip() == str(sn).strip():
            return header_row + idx
    return None

def update_row(sheet_name: str, row_num: int, values: list):
    col_end = get_col(len(values))
    svc().spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A{row_num}:{col_end}{row_num}",
        valueInputOption="USER_ENTERED", body={"values": [values]}).execute()

def clear_row(sheet_name: str, row_num: int):
    svc().spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A{row_num}:Z{row_num}").execute()

def get_col(n: int) -> str:
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s

def next_sn(sheet_name: str) -> int:
    records = sheet_to_list(sheet_name)
    if not records: return 1
    try: return max(int(r.get("S_N", 0)) for r in records if str(r.get("S_N","")).isdigit()) + 1
    except: return len(records) + 1

# ── Auth helpers ──────────────────────────────────────────────
def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

def create_token(data: dict) -> str:
    p = data.copy()
    p["exp"] = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE_MIN)
    return jwt.encode(p, SECRET_KEY, algorithm=ALGORITHM)

def get_user(username: str) -> dict | None:
    for u in sheet_to_list("Users_db"):
        if u.get("USERNAME","").lower() == username.lower(): return u
    return None

def current_user(token: str = Depends(oauth2_scheme)) -> dict:
    try:
        p = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = p.get("sub")
        if not username: raise HTTPException(401, "Invalid token")
    except JWTError: raise HTTPException(401, "Token expired or invalid")
    u = get_user(username)
    if not u or u.get("IS_ACTIVE","").upper() != "TRUE":
        raise HTTPException(401, "User not found or inactive")
    return u

def req_user(u: dict = Depends(current_user)) -> dict: return u
def req_admin(u: dict = Depends(current_user)) -> dict:
    if u.get("LEVEL","4") not in ("1","2"):
        raise HTTPException(403, "Admin access required")
    return u
def req_sysadmin(u: dict = Depends(current_user)) -> dict:
    if u.get("LEVEL","4") != "1":
        raise HTTPException(403, "System Admin access required")
    return u

# ── Department logic ──────────────────────────────────────────
def derive_dept1(sex: str, marital: str, dob: str) -> str:
    from datetime import date
    non_single = {"MARRIED","WIDOW/WIDOWER","DIVORCED","SEPARATED"}
    try:
        born  = date.fromisoformat(dob)
        age   = (date.today() - born).days // 365
    except: age = None
    if age is not None:
        if age <= 12: return "SUNDAY SCHOOL"
        if age <= 17: return "PRE-YOUTH"
    if (marital or "").upper() in non_single:
        return "BROTHERS' UNION" if (sex or "").upper() == "MALE" else "SISTERS' UNION"
    return "YOUTH"

def ss_class(dob: str) -> str:
    from datetime import date
    try:
        born = date.fromisoformat(dob)
        age  = (date.today() - born).days // 365
        return "JUNIOR" if age <= 6 else "SENIOR"
    except: return "JUNIOR"

# ── Models ────────────────────────────────────────────────────
class Member(BaseModel):
    PROFILE_PHOTO_URL:   Optional[str] = None
    MEMBER_NAME:         str
    ADDRESS:             Optional[str] = None
    PHONE:               Optional[str] = None
    EMAIL:               Optional[str] = None
    SEX:                 Optional[Literal["MALE","FEMALE"]] = None
    MARITAL_STATUS:      Optional[Literal["SINGLE","MARRIED","WIDOW/WIDOWER","DIVORCED","SEPARATED"]] = None
    DATE_OF_BIRTH:       Optional[str] = None
    OCCUPATION:          Optional[str] = None
    OFFICE_ADDRESS:      Optional[str] = None
    DATE_JOINED:         Optional[str] = None
    MEMBERSHIP_STATUS:   Optional[Literal["OFFICER","ACTIVE MEMBER","NEW CONVERT","INACTIVE"]] = "ACTIVE MEMBER"
    SPOUSE_NAME:         Optional[str] = None
    CONVERSION_DATE:     Optional[str] = None
    NO_OF_CHILDREN:      Optional[str] = None
    BAPTISM_DATE:        Optional[str] = None
    HOLY_SPIRIT_RECEIVED:Optional[Literal["YES","NO"]] = None
    HOLY_SPIRIT_DATE:    Optional[str] = None
    HOME_CHURCH_BRANCH:  Optional[str] = "AFC UTHIRU"
    MEMBERSHIP_NUMBER:   Optional[str] = None

class MemberDept(BaseModel):
    DEPARTMENT: str

class CreateUser(BaseModel):
    username:      str
    full_name:     str
    email:         str
    password:      str
    level:         Literal["1","2","3","4"]
    church_branch: Optional[str] = "AFC UTHIRU"

class ChangePassword(BaseModel):
    current_password: str
    new_password:     str

# ── Health ────────────────────────────────────────────────────
@app.get("/")
def health():
    return {"status":"online","message":"AFC Uthiru CMS — Members API is running."}

@app.get("/api/test-connection")
def test_connection():
    try:
        meta   = svc().spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
        title  = meta.get("properties",{}).get("title","Unknown")
        sheets = [s["properties"]["title"] for s in meta.get("sheets",[])]
        return {"status":"connected","file":title,"sheets":sheets}
    except Exception as e: raise HTTPException(500, str(e))

# ── Auth ──────────────────────────────────────────────────────
@app.post("/api/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends()):
    u = get_user(form.username)
    if not u or not verify_password(form.password, u.get("HASHED_PASSWORD","")):
        raise HTTPException(401, "Incorrect username or password")
    if u.get("IS_ACTIVE","").upper() != "TRUE":
        raise HTTPException(403, "Account inactive. Contact System Admin.")
    must_change = u.get("MUST_CHANGE_PASSWORD","TRUE").upper() == "TRUE"
    token = create_token({"sub": u["USERNAME"], "level": u.get("LEVEL","4")})
    return {
        "access_token":        token,
        "token_type":          "bearer",
        "level":               u.get("LEVEL","4"),
        "full_name":           u.get("FULL_NAME",""),
        "username":            u["USERNAME"],
        "must_change_password":must_change,
    }

@app.get("/api/auth/me")
def me(u: dict = Depends(req_user)):
    return {
        "username":  u.get("USERNAME"),
        "full_name": u.get("FULL_NAME"),
        "email":     u.get("EMAIL"),
        "level":     u.get("LEVEL"),
        "branch":    u.get("CHURCH_BRANCH"),
    }

@app.post("/api/auth/change-password")
def change_password(body: ChangePassword, u: dict = Depends(req_user)):
    if not verify_password(body.current_password, u.get("HASHED_PASSWORD","")):
        raise HTTPException(400, "Current password is incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    rn = find_row("Users_db", u["S_N"])
    if not rn: raise HTTPException(404, "User not found")
    update_row("Users_db", rn, [
        u["S_N"], u["USERNAME"], u.get("FULL_NAME",""), u.get("EMAIL",""),
        hash_password(body.new_password), u.get("LEVEL","4"),
        u.get("MEMBER_SN",""), "TRUE", "FALSE",
        u.get("CREATED_AT",""), u.get("CREATED_BY",""), u.get("CHURCH_BRANCH","")
    ])
    return {"status":"success","message":"Password changed successfully"}

# ── User management (sysadmin only) ──────────────────────────
@app.get("/api/users")
def list_users(_: dict = Depends(req_sysadmin)):
    users = sheet_to_list("Users_db")
    for u in users: u.pop("HASHED_PASSWORD", None)
    return users

@app.post("/api/users", status_code=201)
def create_user(body: CreateUser, u: dict = Depends(req_sysadmin)):
    existing = sheet_to_list("Users_db")
    if any(x.get("USERNAME","").lower() == body.username.lower() for x in existing):
        raise HTTPException(409, f"Username '{body.username}' already exists")
    sn = str(next_sn("Users_db"))
    append_row("Users_db", [
        sn, body.username, body.full_name, body.email,
        hash_password(body.password), body.level,
        "", "TRUE", "TRUE",
        datetime.now().strftime("%Y-%m-%d"), u["USERNAME"], body.church_branch
    ])
    return {"status":"success","sn":sn,"message":f"Account created for '{body.username}'"}

@app.patch("/api/users/{username}/deactivate")
def deactivate_user(username: str, u: dict = Depends(req_sysadmin)):
    if username.lower() == u["USERNAME"].lower():
        raise HTTPException(400, "Cannot deactivate your own account")
    target = get_user(username)
    if not target: raise HTTPException(404, f"User '{username}' not found")
    rn = find_row("Users_db", target["S_N"])
    update_row("Users_db", rn, [
        target["S_N"], target["USERNAME"], target.get("FULL_NAME",""),
        target.get("EMAIL",""), target.get("HASHED_PASSWORD",""),
        target.get("LEVEL","4"), target.get("MEMBER_SN",""),
        "FALSE", target.get("MUST_CHANGE_PASSWORD","FALSE"),
        target.get("CREATED_AT",""), target.get("CREATED_BY",""),
        target.get("CHURCH_BRANCH","")
    ])
    return {"status":"success","message":f"Account '{username}' deactivated"}

# ── Members ───────────────────────────────────────────────────
@app.get("/api/members")
def list_members(_: dict = Depends(req_user)):
    return sheet_to_list("MemberDetails_db")

@app.get("/api/members/{sn}")
def get_member(sn: str, _: dict = Depends(req_user)):
    m = next((x for x in sheet_to_list("MemberDetails_db") if str(x.get("S_N","")) == sn), None)
    if not m: raise HTTPException(404, f"Member '{sn}' not found")
    # Also fetch their additional departments
    depts = [d for d in sheet_to_list("MemberDepartments_db") if str(d.get("MEMBER_SN","")) == sn]
    m["additional_departments"] = depts
    return m

@app.post("/api/members", status_code=201)
def add_member(body: Member, u: dict = Depends(req_user)):
    sn    = str(next_sn("MemberDetails_db"))
    dept1 = derive_dept1(body.SEX or "", body.MARITAL_STATUS or "", body.DATE_OF_BIRTH or "")
    ss    = ss_class(body.DATE_OF_BIRTH or "") if dept1 == "SUNDAY SCHOOL" else ""
    now   = datetime.now().strftime("%Y-%m-%d %H:%M")
    append_row("MemberDetails_db", [
        sn,
        body.PROFILE_PHOTO_URL or "",
        body.MEMBER_NAME,
        body.ADDRESS or "",
        body.PHONE or "",
        body.EMAIL or "",
        body.SEX or "",
        body.MARITAL_STATUS or "",
        body.DATE_OF_BIRTH or "",
        body.OCCUPATION or "",
        body.OFFICE_ADDRESS or "",
        f"{dept1}{' — ' + ss if ss else ''}",
        body.DATE_JOINED or "",
        body.MEMBERSHIP_STATUS or "ACTIVE MEMBER",
        body.SPOUSE_NAME or "",
        body.CONVERSION_DATE or "",
        body.NO_OF_CHILDREN or "",
        body.BAPTISM_DATE or "",
        body.HOLY_SPIRIT_RECEIVED or "",
        body.HOLY_SPIRIT_DATE or "",
        body.HOME_CHURCH_BRANCH or "AFC UTHIRU",
        "NO",   # DEPT_UPGRADE_FLAGGED
        u.get("USERNAME",""),
        now,
        body.MEMBERSHIP_NUMBER or "",
    ])
    return {
        "status":        "success",
        "sn":            sn,
        "department_1":  dept1,
        "ss_class":      ss,
        "message":       f"Member '{body.MEMBER_NAME}' added with S_N {sn}"
    }

@app.put("/api/members/{sn}")
def update_member(sn: str, body: Member, u: dict = Depends(req_user)):
    rn = find_row("MemberDetails_db", sn)
    if not rn: raise HTTPException(404, f"Member '{sn}' not found")
    dept1 = derive_dept1(body.SEX or "", body.MARITAL_STATUS or "", body.DATE_OF_BIRTH or "")
    ss    = ss_class(body.DATE_OF_BIRTH or "") if dept1 == "SUNDAY SCHOOL" else ""
    now   = datetime.now().strftime("%Y-%m-%d %H:%M")
    update_row("MemberDetails_db", rn, [
        sn,
        body.PROFILE_PHOTO_URL or "",
        body.MEMBER_NAME,
        body.ADDRESS or "",
        body.PHONE or "",
        body.EMAIL or "",
        body.SEX or "",
        body.MARITAL_STATUS or "",
        body.DATE_OF_BIRTH or "",
        body.OCCUPATION or "",
        body.OFFICE_ADDRESS or "",
        f"{dept1}{' — ' + ss if ss else ''}",
        body.DATE_JOINED or "",
        body.MEMBERSHIP_STATUS or "ACTIVE MEMBER",
        body.SPOUSE_NAME or "",
        body.CONVERSION_DATE or "",
        body.NO_OF_CHILDREN or "",
        body.BAPTISM_DATE or "",
        body.HOLY_SPIRIT_RECEIVED or "",
        body.HOLY_SPIRIT_DATE or "",
        body.HOME_CHURCH_BRANCH or "AFC UTHIRU",
        "NO",
        u.get("USERNAME",""),
        now,
        body.MEMBERSHIP_NUMBER or "",
    ])
    return {"status":"success","message":f"Member '{sn}' updated","department_1":dept1}

@app.delete("/api/members/{sn}")
def delete_member(sn: str, _: dict = Depends(req_admin)):
    rn = find_row("MemberDetails_db", sn)
    if not rn: raise HTTPException(404, f"Member '{sn}' not found")
    clear_row("MemberDetails_db", rn)
    return {"status":"success","message":f"Member '{sn}' deleted"}

@app.get("/api/members/{sn}/departments")
def get_member_depts(sn: str, _: dict = Depends(req_user)):
    return [d for d in sheet_to_list("MemberDepartments_db") if str(d.get("MEMBER_SN","")) == sn]

@app.post("/api/members/{sn}/departments")
def add_member_dept(sn: str, body: MemberDept, u: dict = Depends(req_user)):
    # Confirm member exists
    m = next((x for x in sheet_to_list("MemberDetails_db") if str(x.get("S_N","")) == sn), None)
    if not m: raise HTTPException(404, f"Member '{sn}' not found")
    dsn = str(next_sn("MemberDepartments_db"))
    append_row("MemberDepartments_db", [
        dsn, sn, m.get("MEMBER_NAME",""),
        body.DEPARTMENT,
        datetime.now().strftime("%Y-%m-%d"),
        u.get("USERNAME",""),
        m.get("HOME_CHURCH_BRANCH","AFC UTHIRU")
    ])
    return {"status":"success","message":f"Department '{body.DEPARTMENT}' added to member '{sn}'"}

@app.delete("/api/members/{sn}/departments/{dept_sn}")
def remove_member_dept(sn: str, dept_sn: str, _: dict = Depends(req_admin)):
    rn = find_row("MemberDepartments_db", dept_sn)
    if not rn: raise HTTPException(404, "Department assignment not found")
    clear_row("MemberDepartments_db", rn)
    return {"status":"success","message":"Department removed"}

@app.get("/api/members/search/{query}")
def search_members(query: str, _: dict = Depends(req_user)):
    members = sheet_to_list("MemberDetails_db")
    q = query.lower()
    return [m for m in members if
            q in (m.get("MEMBER_NAME","") or "").lower() or
            q in (m.get("PHONE","") or "").lower() or
            q in (m.get("MEMBERSHIP_NUMBER","") or "").lower() or
            q in (m.get("DEPARTMENT_1","") or "").lower()]