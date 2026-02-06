import json

from .index import handler

with open("./handlers/projects/metrics/query/event/dev.json") as user_event:
    parsed_event = json.load(user_event)

print(handler(parsed_event, ""))
