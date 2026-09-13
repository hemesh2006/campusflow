from enum import Enum
from typing import Optional, Annotated
from pydantic import BaseModel, EmailStr, BeforeValidator, ConfigDict

# Represents a Mongo ObjectId as a plain string on the way in/out of
# the API, so the frontend never has to deal with bson types.
PyObjectId = Annotated[str, BeforeValidator(str)]


class Role(str, Enum):
    ADMIN = "admin"
    PRINCIPAL = "principal"
    HOD = "hod"
    ADVISOR = "advisor"
    STUDENT = "student"


def resolve_role_from_email(email: str) -> Role:
    if email.lower() == "admin@campusflow.edu":
        return Role.ADMIN
    return Role.STUDENT


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    dept: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class SemesterGpa(BaseModel):
    sem: str
    gpa: float


class UserPublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: PyObjectId
    name: str
    email: EmailStr
    role: Role
    dept: Optional[str] = None

    # Which advisor's class this student currently belongs to, if any.
    # None = registered but not yet added to a class by an advisor.
    # Only meaningful for role == student; ignored for other roles.
    class_advisor_id: Optional[str] = None

    # Extended profile fields (student-focused, optional for other roles)
    mobile: Optional[str] = None
    dob: Optional[str] = None
    year: Optional[str] = None
    college: Optional[str] = None
    cgpa: Optional[float] = None
    attendance: Optional[float] = None
    semesters: list[SemesterGpa] = []
    resume_uploaded: bool = False
    telegram_linked: bool = False
    placement_eligible: bool = True


class UserInDB(UserPublic):
    hashed_password: str


class UserProfileUpdate(BaseModel):
    """Fields a user is allowed to edit about themselves via PATCH /users/me."""
    name: Optional[str] = None
    mobile: Optional[str] = None
    dob: Optional[str] = None
    dept: Optional[str] = None
    semesters: Optional[list[SemesterGpa]] = None
    resume_uploaded: Optional[bool] = None
    telegram_linked: Optional[bool] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class AssignPrincipalPayload(BaseModel):
    user_id: str


class AssignHodPayload(BaseModel):
    user_id: str
    dept: str


class AssignAdvisorPayload(BaseModel):
    user_id: str
    dept: Optional[str] = None


class RemoveRolePayload(BaseModel):
    user_id: str


class AdminUserRoleUpdate(BaseModel):
    role: Role
    dept: Optional[str] = None


class StudentAcademicUpdate(BaseModel):
    cgpa: Optional[float] = None
    attendance: Optional[float] = None



