def validator(event):
    if not isinstance(event, dict):
        return {"status": 400, "message": "Invalid event"}
    return {"status": 200}
