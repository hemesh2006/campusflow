from rest_framework.parsers import JSONParser
from rest_framework.exceptions import ParseError


def request_data(request):
    try:
        return JSONParser().parse(request)
    except ParseError:
        return None
