from rest_framework import serializers


class UserCreateSerializer(serializers.Serializer):
    name = serializers.CharField()
    email = serializers.EmailField()
    password = serializers.CharField()
    dept = serializers.CharField(required=False, allow_null=True, allow_blank=True)


class UserLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class TaskCreateSerializer(serializers.Serializer):
    title = serializers.CharField()
    due = serializers.CharField()
    agent = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    status = serializers.CharField(default="pending")


class TaskUpdateSerializer(serializers.Serializer):
    status = serializers.CharField(required=False, allow_null=True)
    title = serializers.CharField(required=False, allow_null=True)
    due = serializers.CharField(required=False, allow_null=True)


class ProfileUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, allow_null=True)
    mobile = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    dob = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    dept = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    semesters = serializers.ListField(required=False, allow_null=True)
    resume_uploaded = serializers.BooleanField(required=False, allow_null=True)
    telegram_linked = serializers.BooleanField(required=False, allow_null=True)


class StudentCreateSerializer(serializers.Serializer):
    name = serializers.CharField()
    email = serializers.EmailField()
    roll_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    dept = serializers.CharField(required=False, allow_null=True, allow_blank=True)


class AcademicUpdateSerializer(serializers.Serializer):
    cgpa = serializers.FloatField(required=False, allow_null=True)
    attendance = serializers.FloatField(required=False, allow_null=True)


class UserIdSerializer(serializers.Serializer):
    user_id = serializers.CharField()


class AssignHodSerializer(UserIdSerializer):
    dept = serializers.CharField()


class AssignAdvisorSerializer(UserIdSerializer):
    dept = serializers.CharField(required=False, allow_null=True, allow_blank=True)


class AdminRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=("admin", "principal", "hod", "advisor", "student"))
    dept = serializers.CharField(required=False, allow_null=True, allow_blank=True)
