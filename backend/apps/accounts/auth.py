import asyncio

from django.http import JsonResponse
from django.urls import path

from app.database import users_col
from app.models.user import UserCreate, UserLogin, UserPublic, Token, resolve_role_from_email
from app.core.security import hash_password, verify_password, create_access_token
from app.core.deps import user_doc_to_public
from app.services import user_knowledge
from app.api.serializers import UserCreateSerializer, UserLoginSerializer
from app.api.requests import request_data



def _error(detail, status_code):
    return JsonResponse({"detail": detail}, status=status_code)


async def signup(request):
    if request.method != "POST":
        return _error("Method not allowed", 405)
    payload = UserCreateSerializer(data=request_data(request) or {})
    if not payload.is_valid():
        return _error(payload.errors, 400)
    data = payload.validated_data
    existing = await users_col.find_one({"email": data["email"]})
    if existing:
        return _error("Email already registered", 409)

    # Role is resolved automatically — the client never sends one.
    role = resolve_role_from_email(data["email"])

    doc = {
        "name": data["name"],
        "email": data["email"],
        "hashed_password": hash_password(data["password"]),
        "role": role.value,
        "dept": data.get("dept"),
    }
    result = await users_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    user = user_doc_to_public(doc)
    token = create_access_token(subject=str(result.inserted_id), role=role.value)
    asyncio.create_task(user_knowledge.save_snapshot(str(result.inserted_id)))
    return JsonResponse(Token(access_token=token, user=user).model_dump(mode="json"), status=201)


async def login(request):
    if request.method != "POST":
        return _error("Method not allowed", 405)
    payload = UserLoginSerializer(data=request_data(request) or {})
    if not payload.is_valid():
        return _error(payload.errors, 400)
    data = payload.validated_data
    user = await users_col.find_one({"email": data["email"]})
    if not user or not verify_password(data["password"], user["hashed_password"]):
        return _error("Incorrect email or password", 401)

    token = create_access_token(subject=str(user["_id"]), role=user["role"])
    public = user_doc_to_public(user)
    asyncio.create_task(user_knowledge.save_snapshot(str(user["_id"])))
    return JsonResponse(Token(access_token=token, user=public).model_dump(mode="json"))


async def me(request):
    from app.core.deps import get_current_user
    try:
        current_user = await get_current_user(request)
    except Exception as exc:
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))
    return JsonResponse(current_user.model_dump(mode="json"))


urlpatterns = [
    path("auth/signup", signup),
    path("auth/login", login),
    path("auth/me", me),
]
